import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { closeDb } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import {
  addMember,
  createInvitation,
  createOrganisation,
  createProject,
  createUser,
  deleteOrganisation,
  listAudit,
  listInvitations,
  listProjects,
  membersOf,
  recordAudit,
} from './repo.ts';

/**
 * Deleting an organisation takes everything belonging to it.
 *
 * Checked here rather than through the API because the API cannot see it: once the memberships
 * are gone the caller gets a 404 whether the organisation was deleted or merely abandoned, so
 * an HTTP-level test passes either way. Confirmed by deleting only the memberships — the whole
 * API suite stayed green, which is what sent this file down a layer.
 *
 * Node only. It reads the database directly, and under `test:api:worker` the rows live in the
 * Worker's D1 rather than here.
 */

const skip = Boolean(process.env.API_BASE);

before(async () => {
  process.env.DATABASE_URL = ':memory:';
  closeDb();
  await migrate(() => {});
});

after(() => {
  closeDb();
});

describe('deleting an organisation', { skip }, () => {
  test('takes its members, projects, invitations and audit log with it', async () => {
    const user = await createUser('cascade@example.com', 'Cascade', 'x');
    const org = await createOrganisation('Doomed', `doomed-${Date.now()}`);
    await addMember(org.id, user.id, 'owner');
    await createProject(org.id, 'A project');
    await createInvitation(org.id, 'guest@example.com', 'member', user.id, 'hash', 3600);
    await recordAudit(org.id, 'organisation.created', { id: user.id, label: 'Cascade' }, 'Doomed');

    // Everything is there first, or the assertions below would pass on an empty database.
    assert.equal((await listProjects(org.id)).length, 1);
    assert.equal((await listInvitations(org.id)).length, 1);
    assert.equal((await listAudit(org.id)).length, 1);
    assert.equal((await membersOf(org.id)).length, 1);

    assert.equal(await deleteOrganisation(org.id), true);

    assert.deepEqual(await listProjects(org.id), [], 'projects outlived their organisation');
    assert.deepEqual(await listInvitations(org.id), [], 'invitations outlived their organisation');
    assert.deepEqual(await listAudit(org.id), [], 'audit events outlived their organisation');
    assert.deepEqual(await membersOf(org.id), [], 'memberships outlived their organisation');
  });
});
