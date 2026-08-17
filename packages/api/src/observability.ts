/**
 * Structured logs, and somewhere to send the errors nobody is watching for.
 *
 * The same shape as mailer.ts and for the same reason: a seam with one honest implementation,
 * so that installing a real provider is a line of wiring rather than a search through the code
 * for every place something is written out.
 *
 * Two separate concerns on purpose. A **log** is a line about something that happened, and its
 * value is almost entirely in being able to filter it — which is why these are objects and not
 * sentences: `grep '"orgId":"…"'` answers a question that a well-worded English line cannot.
 * An **error report** is a thing somebody has to look at, and the difference matters because a
 * log nobody reads and an alert nobody receives fail in opposite ways.
 *
 * Everything is written to stderr, never stdout. The test harness runs the API in the same
 * process as the test runner, whose TAP report *is* stdout — writing there corrupts the report,
 * and three tests once vanished from the count that way rather than failing.
 */

export type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * What a line is about, beyond its message.
 *
 * `requestId` ties the lines of one request together, and `orgId` is what makes a log useful in
 * a multi-tenant app: "is this one customer or everybody" is the first question every incident
 * starts with, and it is unanswerable after the fact if nothing recorded which tenant a request
 * belonged to.
 */
export interface LogContext {
  requestId?: string;
  orgId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface Logger {
  log(level: Level, message: string, context?: LogContext): void;
}

/** Somewhere an error goes when it is not the caller's problem to handle. */
export interface ErrorReporter {
  /** Whether this reaches a person. False for anything that only writes locally. */
  readonly reports: boolean;
  capture(error: unknown, context?: LogContext): void;
}

/**
 * The default logger: one JSON object per line, on stderr.
 *
 * JSON rather than a formatted line because every log service parses it, and because the
 * alternative — pretty output that a human reads over a developer's shoulder — is exactly the
 * format that becomes unqueryable the moment there is more than one instance.
 */
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * The lowest level that gets written, from LOG_LEVEL.
 *
 * `silent` exists for the test suites. Under `test:api:worker` the API runs inside `wrangler
 * dev`, which relays everything the Worker writes through its own console — and a line per
 * request meant a few hundred requests of test traffic went through that relay, which wedged
 * it: one request hung for five minutes and the run failed on a timeout rather than on
 * anything the tests were checking. Production wants these lines; a test run wants the
 * behaviour they describe.
 *
 * Read on each call rather than once at import, so a test can change it after this module has
 * already been loaded by something else.
 */
const threshold = (): number => {
  const configured = globalThis.process?.env?.LOG_LEVEL as Level | 'silent' | undefined;
  if (configured === 'silent') return Number.POSITIVE_INFINITY;
  return ORDER[configured ?? 'info'] ?? ORDER.info;
};

export const consoleLogger: Logger = {
  log(level, message, context) {
    if (ORDER[level] < threshold()) return;
    const line = JSON.stringify({
      level,
      message,
      time: new Date().toISOString(),
      ...context,
    });
    console.error(line);
  },
};

/**
 * The default reporter: writes the error out and reaches nobody.
 *
 * Deliberately not a silent no-op, for the same reason consoleMailer is not: a starter where
 * errors appear to be handled and disappear is worse than one that admits nothing is watching.
 *
 * A worked example, for when something should be:
 *
 *     import * as Sentry from '@sentry/node';
 *     Sentry.init({ dsn: process.env.SENTRY_DSN });
 *     setErrorReporter({
 *       reports: true,
 *       capture(error, context) {
 *         Sentry.captureException(error, { extra: context });
 *       },
 *     });
 */
export const consoleErrorReporter: ErrorReporter = {
  reports: false,
  capture(error, context) {
    const detail =
      error instanceof Error ? { error: error.message, stack: error.stack } : { error };
    consoleLogger.log('error', 'unhandled', { ...context, ...detail });
  },
};

let logger: Logger = consoleLogger;
let reporter: ErrorReporter = consoleErrorReporter;

export function setLogger(next: Logger): void {
  logger = next;
}

export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

export function getLogger(): Logger {
  return logger;
}

export function getErrorReporter(): ErrorReporter {
  return reporter;
}

/** Shorthand, so a call site reads as the thing it is recording. */
export const log = {
  debug: (message: string, context?: LogContext) => logger.log('debug', message, context),
  info: (message: string, context?: LogContext) => logger.log('info', message, context),
  warn: (message: string, context?: LogContext) => logger.log('warn', message, context),
  error: (message: string, context?: LogContext) => logger.log('error', message, context),
};

/** Reports an error to whatever is installed. Never throws: a reporter that fails is not news. */
export function captureError(error: unknown, context?: LogContext): void {
  try {
    reporter.capture(error, context);
  } catch {
    // Nothing useful to do. Losing the report is bad; taking the request down with it is worse.
  }
}
