/**
 * A demo tenant, so `npm run dev` opens on a working app instead of an empty one.
 *
 * Two organisations on purpose, not one: the second is what makes tenant isolation visible
 * while developing — sign in as the other user and the first organisation's data is simply
 * not there.
 *
 * Idempotent, so running it twice is harmless.
 */

import { hashPassword } from '../auth.ts';
import {
  addMember,
  createOrganisation,
  createProject,
  createUser,
  findUserByEmail,
} from '../repo.ts';
import { migrate } from './migrate.ts';

export const DEMO_PASSWORD = 'hamster-wheel-9000';

const PEOPLE = [
  { email: 'ada@example.com', name: 'Ada', org: 'Ada & Co', slug: 'ada-co' },
  { email: 'grace@example.com', name: 'Grace', org: 'Grace Industries', slug: 'grace-industries' },
] as const;

export async function seed(log: (msg: string) => void = console.log): Promise<void> {
  migrate(() => {});
  if (await findUserByEmail(PEOPLE[0].email)) {
    log('✓ demo data already present');
    return;
  }

  const password = await hashPassword(DEMO_PASSWORD);
  for (const person of PEOPLE) {
    const user = await createUser(person.email, person.name, password);
    const org = await createOrganisation(person.org, person.slug);
    await addMember(org.id, user.id, 'owner');
    await createProject(
      org.id,
      `${person.name}'s first project`,
      'Seeded so the list is not empty.',
    );
    await createProject(org.id, 'Second project', '');
  }

  log(`✓ seeded ${PEOPLE.length} organisations`);
  log(`  sign in as ${PEOPLE.map((p) => p.email).join(' or ')} — password: ${DEMO_PASSWORD}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await seed();
