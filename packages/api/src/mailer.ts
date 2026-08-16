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
