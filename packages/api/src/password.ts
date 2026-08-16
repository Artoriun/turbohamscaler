/**
 * Password hashing, written against Web Crypto so it runs wherever the API does.
 *
 * The reason this is its own file: `node:crypto`'s scrypt does not exist on Cloudflare Workers
 * or any other Web-Standards runtime, so leaving it inline in auth.ts pinned the whole API to
 * Node. Web Crypto's PBKDF2 exists in all of them, including Node.
 *
 * PBKDF2 is a weaker function than scrypt against custom hardware — it is cheap to parallelise,
 * where scrypt deliberately is not. It is chosen anyway because the alternative on a
 * Workers-style runtime is a WASM scrypt build, which is a native dependency by another name,
 * and this starter's whole claim is that it installs and runs with nothing. The iteration count
 * below is the compensation, and it is the number to raise as hardware gets faster.
 *
 * The scheme is recorded in the stored string, so a hash written by one algorithm is still
 * verifiable after the default changes — which is what makes moving off this possible later
 * without locking everyone out.
 */

/**
 * OWASP's floor for PBKDF2-HMAC-SHA256 at the time of writing.
 *
 * Costs roughly 100-200ms of CPU. That is the point: it is what makes a stolen database
 * expensive to attack. It is also why this cannot run on a Cloudflare Workers *free* plan,
 * which allows 10ms of CPU per request — hashing a password properly is more work than that
 * plan permits, and lowering the count to fit would be trading the security for the hosting
 * bill.
 */
const ITERATIONS = 600_000;
const KEYLEN_BYTES = 32;
const SALT_BYTES = 16;

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((byte) => Number.parseInt(byte, 16)));

async function pbkdf2(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(salt),
      iterations,
      hash: 'SHA-256',
    },
    key,
    KEYLEN_BYTES * 8,
  );
  return toHex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)).buffer);
  const derived = await pbkdf2(password, salt, ITERATIONS);
  // The iteration count travels with the hash: raising the default must not make every existing
  // password unverifiable, and without it there is no way to know what an old hash was made with.
  return `pbkdf2:${ITERATIONS}:${salt}:${derived}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, expected] = stored.split(':');
  if (scheme !== 'pbkdf2' || !iterations || !salt || !expected) return false;
  const rounds = Number(iterations);
  if (!Number.isSafeInteger(rounds) || rounds <= 0) return false;
  const derived = await pbkdf2(password, salt, rounds);
  return timingSafeEqualHex(derived, expected);
}

/**
 * Constant-time comparison of two hex strings.
 *
 * `===` on the derived hash leaks, through how long it takes to fail, how many leading
 * characters were right — enough to recover a hash one character at a time. node:crypto has
 * timingSafeEqual; Web Crypto does not, so it is written out here.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const left = fromHex(a);
  const right = fromHex(b);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= (left[i] as number) ^ (right[i] as number);
  return diff === 0;
}
