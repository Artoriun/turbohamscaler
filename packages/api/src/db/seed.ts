/**
 * A demo tenant, so `npm run dev` opens on a working app instead of an empty one.
 *
 * Two organisations on purpose, not one: the second is what makes tenant isolation visible
 * while developing — sign in as the other user and the first organisation's data is simply
 * not there.
 *
 * Idempotent, so running it twice is harmless.
 */

import { DEMO_SIGN_IN } from '@hamscaler/shared';
import { hashPassword } from '../auth.ts';
import {
  addMember,
  createOrganisation,
  createProject,
  createUser,
  findUserByEmail,
} from '../repo.ts';
import { migrate } from './migrate.ts';

export const DEMO_PASSWORD = DEMO_SIGN_IN.password;

const PEOPLE = [
  {
    email: DEMO_SIGN_IN.email,
    name: 'TurboHam',
    org: 'TurboHam & Co Wheelwrights',
    slug: 'turboham-co-wheelwrights',
    projects: [
      ['Dig a second tunnel', 'The first one is getting crowded.'],
      ['Audit the seed stash', ''],
    ],
  },
  {
    email: 'teemo@example.com',
    name: 'Teemo',
    org: 'Teemo Industries (Bedding Division)',
    slug: 'teemo-industries',
    projects: [
      ['Reorganise the cheek pouches', 'Left for perishables, right for everything else.'],
      ['Nightly wheel maintenance', ''],
    ],
  },
] as const;

export async function seed(log: (msg: string) => void = console.log): Promise<void> {
  // Awaited. migrate became async when the query helpers did, and without this the seed's own
  // statements raced the schema being created — "disk I/O error" or "SQL logic error", depending
  // on which one lost.
  await migrate(() => {});
  if (await findUserByEmail(PEOPLE[0].email)) {
    log('✓ demo data already present');
    return;
  }

  const password = await hashPassword(DEMO_PASSWORD);
  for (const person of PEOPLE) {
    const user = await createUser(person.email, person.name, password);
    const org = await createOrganisation(person.org, person.slug);
    await addMember(org.id, user.id, 'owner');
    for (const [name, notes] of person.projects) {
      await createProject(org.id, name, notes);
    }
  }

  log(`✓ seeded ${PEOPLE.length} organisations, two hamsters, four projects`);
  log(`  sign in as ${PEOPLE.map((p) => p.email).join(' or ')} — password: ${DEMO_PASSWORD}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await seed();
