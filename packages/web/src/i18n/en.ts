/**
 * The English dictionary, and the shape every other language must match.
 *
 * `Dictionary` is derived from this object rather than declared separately, so adding a string
 * here immediately makes every other locale a type error until it is translated — a
 * half-finished language fails `npm run typecheck` instead of rendering blanks in production.
 *
 * Deliberately not `as const`: that would freeze every value to its own literal type and then
 * demand the Japanese file repeat the English strings verbatim.
 */
export const en = {
  label: 'English',
  language: { label: 'Language' },

  nav: {
    overview: 'Overview',
    source: 'Source',
    openApp: 'Open the app',
    sourceOnGitHub: 'Source on GitHub',
  },

  home: {
    eyebrow: 'TurboRepo starter',
    // Split so the accent span can wrap only the second half.
    headline: 'The boring half of a multi-tenant app,',
    headlineAccent: 'already done',
    lede: 'TurboHamscaler gives you accounts, organisations, roles and per-tenant data — with the isolation checks that keep them honest. Clone it and start on the part that is actually yours.',
    openDemo: 'Open the demo',
    readSource: 'Read the source',
    demoSignIn: 'Demo sign-in:',
    whatYouGet: 'What you get',
    startHeading: 'Start in three commands',
    startNote:
      'Two organisations are seeded on purpose: TurboHam runs a wheelwright’s, Teemo is in bedding. Sign in as one and the other’s data is simply not there — no filter to remember, no flag to forget.',
    footer:
      'TurboHamscaler — a TurboRepo starter for multi-tenant apps. Every service it needs has a free tier, so the running cost is a hamster-appropriate zero.',
    features: {
      accounts: {
        title: 'Accounts that revoke',
        body: 'Sessions are rows, not tokens. Signing out everywhere actually ends every session, on every device — no waiting for a token to expire.',
      },
      orgs: {
        title: 'Organisations and roles',
        body: 'Members, admins and owners, with per-organisation data. Everyone starts in an organisation of their own and joins others by invitation.',
      },
      isolation: {
        title: 'Tenant isolation, proven',
        body: 'Every tenant query lives in one file and takes the organisation first. A test suite written from the attacker’s side proves the rows stay apart.',
      },
      migrations: {
        title: 'Migrations that refuse to drift',
        body: 'Applied in order and hashed, so editing one that has already run is an error rather than a database that quietly differs from everyone else’s.',
      },
      nothing: {
        title: 'Runs on a diet of nothing',
        body: 'No account, no container, no native build. Install, seed, and you have a working app with two organisations to poke at. Cheaper to run than the hamster.',
      },
      pipeline: {
        title: 'A pipeline that squeaks when it should',
        body: 'Lint, types, tenancy guards, unit and API tests, a bundle budget, and the browser suite run twice — against the dev server and the built output.',
      },
    },
  },

  notFound: {
    title: 'Nothing here',
    body: 'TurboHam checked behind the wheel. That page does not exist.',
    back: 'Back to the start',
  },

  auth: {
    signIn: 'Sign in',
    createAccount: 'Create an account',
    signInNote: 'Your organisation and its data are waiting.',
    signUpNote: 'You will get an organisation of your own to start in.',
    email: 'Email',
    name: 'Name',
    password: 'Password',
    working: 'Working…',
    createAccountAction: 'Create account',
    switchToSignUp: 'Create an account instead',
    switchToSignIn: 'I already have an account',
    rejected: 'Those details were not accepted.',
    couldNotCreate: 'Could not create that account.',
    weakPassword: 'Password must be at least 10 characters.',
    emailTaken: 'That address already has an account.',
    signOut: 'Sign out',
  },

  portal: {
    organisation: 'Organisation',
    orgSettings: 'Organisation',
    account: 'Your account',
    sessions: 'Signed in on',
    sessionCurrent: 'This device',
    sessionSince: 'Since {when}',
    sessionRevoke: 'End session',
    sessionRevokeNamed: 'End the session started {when}',
    sessionsNone: 'No other sessions. One hamster, one wheel.',
    yourName: 'Your name',
    saveName: 'Save name',
    currentPassword: 'Current password',
    newPassword: 'New password',
    changePassword: 'Change password',
    passwordChanged: 'Password changed. Any other devices have been signed out.',
    passwordWrong: 'That is not your current password.',
    closeAccount: 'Close your account',
    closeConfirm: 'Close your account? This cannot be undone.',
    closeBlocked:
      'You are the only owner of {orgs}. Make someone else an owner, or delete it, before closing your account.',
    orgName: 'Name',
    orgRename: 'Rename',
    orgDelete: 'Delete this organisation',
    orgDeleteConfirm:
      'Delete {name}? Its projects, members, invitations and history go with it. This cannot be undone.',
    orgCreate: 'Another burrow',
    orgCreateName: 'Name for the new organisation',
    orgCreateAction: 'Create',
    orgNone:
      'You do not belong to an organisation yet. Even a hamster needs somewhere to keep its things.',
    orgFailed: 'That change was not allowed.',
    ownerOf:
      'You are the owner of this organisation. Everything below belongs to it and to nobody else.',
    memberOf:
      'You are a {role} of this organisation. Everything below belongs to it and to nobody else.',
    projects: 'Projects',
    projectNotes: 'Notes',
    projectNotesFor: 'Notes for {name}',
    projectNameFor: 'Name for {name}',
    projectEdit: 'Edit',
    projectSave: 'Save',
    projectCancel: 'Cancel',
    projectSaved: 'Saved',
    newProject: 'Something to gnaw on',
    newProjectLabel: 'New project name',
    add: 'Add',
    noProjects: 'No projects yet. The wheel is not going to turn itself.',
    loading: 'Spinning up…',
    delete: 'Delete',
    deleteNamed: 'Delete {name}',
    members: 'Members',
    invitations: 'Invitations',
    activity: 'Activity',
    activityNone: 'Nothing has happened yet. Suspiciously quiet.',
    activityBy: 'by {who}',
    action: {
      'organisation.created': 'Created {subject}',
      'organisation.renamed': 'Renamed the organisation to {subject}',
      'invitation.created': 'Invited {subject}',
      'invitation.revoked': 'Revoked the invitation for {subject}',
      'invitation.accepted': '{subject} joined',
      'member.role-changed': 'Changed {subject}',
      'member.removed': 'Removed {subject}',
      'member.left': '{subject} left',
    },
    memberRole: 'Role for {name}',
    memberRemove: 'Remove',
    memberRemoveNamed: 'Remove {name} from this organisation',
    leave: 'Leave this organisation',
    leaveConfirm: 'Leave {org}? You will lose access to everything in it.',
    lastOwner: 'An organisation needs an owner. Make someone else an owner first.',
    memberChangeFailed: 'That change was not allowed.',
    joinHeading: 'Join {org}?',
    joinBody: 'You have been invited as a {role}.',
    joinAccept: 'Accept invitation',
    joinDecline: 'Not now',
    joinGone: 'That invitation is no longer valid. Ask for a new one.',
    joinWrongAccount:
      'That invitation was sent to a different address. Sign in as that account to accept it.',
    inviteHeading: 'Invite someone',
    inviteEmail: 'Address to invite',
    inviteRole: 'Role',
    inviteAction: 'Create invitation',
    inviteNote:
      'An invitation is addressed to whoever you name. Nothing is checked against the account list, so this never reveals who already has an account.',
    inviteTokenHeading: 'Send them this link',
    inviteTokenNote: 'Shown once. It is not stored, so copy it now.',
    inviteCopy: 'Copy',
    inviteCopied: 'Copied',
    inviteRevoke: 'Revoke',
    inviteRevokeNamed: 'Revoke the invitation for {email}',
    invitePending: 'Awaiting acceptance',
    inviteExpired: 'Expired',
    inviteNone: 'No invitations outstanding. Nobody is waiting at the tunnel entrance.',
    inviteTaken: 'That address already has an invitation to this organisation.',
    inviteBadAddress: 'Enter an email address and a role.',
    rolesNote: 'Roles decide what each person may do. Only an admin or owner can remove a project.',
    noApiTitle: 'This wheel is not connected to anything',
    noApiBody:
      'The public pages are static, so they deploy anywhere. The app itself needs a server for accounts and per-tenant data, and this copy has none — TurboHam is running, but the wheel is not attached to the machinery.',
    noApiRun: 'Three commands and it all works, hamsters included:',
    backToOverview: 'Back to the overview',
  },

  theme: { toDark: 'Switch to dark theme', toLight: 'Switch to light theme' },
};

export type Dictionary = typeof en;
