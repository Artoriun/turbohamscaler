import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  captureError,
  consoleErrorReporter,
  consoleLogger,
  type Level,
  type LogContext,
  setErrorReporter,
  setLogger,
} from './observability.ts';
import { type Actor, as, type Harness, signUp, startApi } from './testing/harness.ts';

/**
 * What the logs actually contain.
 *
 * Worth asserting rather than eyeballing once, because a log line is the thing nobody looks at
 * until an incident, and "the field I need was never populated" is only ever discovered at the
 * worst moment. The one that matters most here is orgId: in a multi-tenant app the first
 * question is always "one customer or everybody", and it is unanswerable after the fact.
 */

const skip = Boolean(process.env.API_BASE);

let api: Harness;
let actor: Actor;
const lines: { level: Level; message: string; context?: LogContext }[] = [];

before(async () => {
  api = await startApi();
  actor = await signUp(api.base, 'logged@example.com');
  setLogger({
    log(level, message, context) {
      lines.push({ level, message, context });
    },
  });
});

after(async () => {
  setLogger(consoleLogger);
  setErrorReporter(consoleErrorReporter);
  await api.close();
});

describe('request logging', { skip }, () => {
  test('records the tenant a request belonged to', async () => {
    lines.length = 0;
    const res = await as(actor)(`${api.base}/api/orgs/${actor.orgId}/projects`);
    assert.equal(res.status, 200);

    const line = lines.find((l) => l.context?.path?.toString().includes('/projects'));
    assert.ok(line, 'a request to a tenant route logged nothing');
    assert.equal(line.context?.orgId, actor.orgId, 'the organisation is missing from the line');
    assert.equal(line.context?.userId, actor.userId);
    assert.equal(line.context?.status, 200);
    assert.equal(typeof line.context?.ms, 'number');
    assert.ok(line.context?.requestId, 'nothing to correlate the line with');
  });

  test('the request id on the line is the one the caller was given', async () => {
    // Without this the id is decoration: somebody reporting "I got an error, here is the id"
    // has to be findable in the log by that exact string.
    lines.length = 0;
    const res = await as(actor)(`${api.base}/api/me`);
    const header = res.headers.get('x-request-id');
    assert.ok(header, 'no x-request-id came back');

    const line = lines.find((l) => l.context?.requestId === header);
    assert.ok(line, `no logged line carries the id the caller was handed (${header})`);
  });

  test('an ordinary refusal is not logged as an error', async () => {
    // 401 and 404 are this API working. Logging them at error level is how a log stops being
    // worth alerting on.
    lines.length = 0;
    await as(null)(`${api.base}/api/me`);
    const line = lines.find((l) => l.context?.status === 401);
    assert.ok(line);
    assert.equal(line.level, 'info');
  });
});

describe('error reporting', { skip }, () => {
  test('a failing reporter cannot take a request down with it', () => {
    // The reporter is somebody else's network call. If losing a report meant losing the
    // request, installing error tracking would make the app less reliable, not more.
    setErrorReporter({
      reports: true,
      capture() {
        throw new Error('the reporting service is down');
      },
    });
    // captureError swallows it; this asserting nothing thrown is the whole point.
    assert.doesNotThrow(() => captureError(new Error('something'), { requestId: 'x' }));
  });
});
