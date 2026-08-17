/**
 * Sending mail, behind an interface with nothing real behind it yet.
 *
 * The seam exists because of what it changes about the invitation route. With no way to send
 * anything, that route had to return the token in its reply for an admin to copy and pass on by
 * hand — which puts a live credential into a response body, a browser's memory, and whatever
 * logs sit in between. Acceptable while there is no alternative; not something to leave in
 * place once there is.
 *
 * So `delivers` is part of the interface. A mailer that actually reaches the recipient means
 * the route stops returning the token at all; the console one does not, so it still does. That
 * way wiring up a provider tightens the behaviour by itself, rather than leaving a second
 * change for someone to remember.
 */

export interface Mail {
  to: string;
  subject: string;
  /** Plain text. A starter that ships an HTML email template ships a maintenance problem. */
  body: string;
}

export interface Mailer {
  /**
   * Whether this reaches the recipient.
   *
   * False for anything that only writes locally, which is what tells the API that the caller
   * still needs to be handed the token themselves.
   */
  readonly delivers: boolean;
  send(mail: Mail): Promise<void>;
}

/**
 * The default: writes to the log and reaches nobody.
 *
 * Deliberately not a silent no-op. A starter where invitations appear to send and vanish is
 * worse than one that admits it has no mail server, and the printed body is how you check what
 * would have been sent.
 */
export const consoleMailer: Mailer = {
  delivers: false,
  async send({ to, subject, body }) {
    // stderr, not stdout. The test harness runs the API in the same process as the test runner,
    // and the runner's TAP output is stdout — anything written there corrupts the report, which
    // is how this first showed up: three tests vanished from the count.
    const out = [`── mail (not sent: no provider configured) ──`, `to: ${to}`, subject, '', body];
    console.error(out.map((line) => `  ${line}`).join('\n'));
  },
};

let mailer: Mailer = consoleMailer;

/**
 * A worked example, because an interface on its own is a puzzle.
 *
 * Any HTTP mail API looks like this; Resend is used here only because its request is short
 * enough to read. `fetch` rather than a client library, so it works unchanged on Workers, where
 * most Node mail SDKs do not.
 *
 * ```ts
 * // packages/api/src/index.ts, before serve()
 * import { setMailer } from './mailer.ts';
 *
 * const key = process.env.RESEND_API_KEY;
 * if (key) {
 *   setMailer({
 *     delivers: true,
 *     async send({ to, subject, body }) {
 *       const res = await fetch('https://api.resend.com/emails', {
 *         method: 'POST',
 *         headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
 *         body: JSON.stringify({ from: 'you@yourdomain.test', to, subject, text: body }),
 *       });
 *       // Throwing matters: the invitation route turns a failure here into a 500 rather than
 *       // reporting an invitation that was created and never sent.
 *       if (!res.ok) throw new Error(`mail failed: ${res.status} ${await res.text()}`);
 *     },
 *   });
 * }
 * ```
 *
 * On Workers the key is a binding rather than an environment variable, so the same block goes
 * in worker.ts's fetch handler instead, reading it off `env`.
 *
 * `delivers: true` is the part that changes behaviour beyond sending: the invitation route stops
 * returning the token once something can carry it. Leave it false on a mailer that only logs, or
 * admins will have no way to pass an invitation on.
 */

/**
 * Installs a real mailer. Call it once at start-up, before serving.
 *
 * Nothing in this starter does — see the README. It is one function because the alternative,
 * reading provider credentials from the environment in here, decides for you which provider
 * you are using.
 */
export function setMailer(next: Mailer): void {
  mailer = next;
}

export function getMailer(): Mailer {
  return mailer;
}
