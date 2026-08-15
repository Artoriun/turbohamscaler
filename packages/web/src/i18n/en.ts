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
      'Two organisations are seeded on purpose. Sign in as one and the other’s data is simply not there — which is the whole point.',
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
        title: 'Runs on nothing',
        body: 'No account, no container, no native build. Install, seed, and you have a working app with two organisations to poke at.',
      },
      pipeline: {
        title: 'A pipeline that fails loudly',
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
    ownerOf:
      'You are the owner of this organisation. Everything below belongs to it and to nobody else.',
    memberOf:
      'You are a {role} of this organisation. Everything below belongs to it and to nobody else.',
    projects: 'Projects',
    newProject: 'New project',
    newProjectLabel: 'New project name',
    add: 'Add',
    noProjects: 'No projects yet.',
    loading: 'Loading…',
    delete: 'Delete',
    deleteNamed: 'Delete {name}',
    members: 'Members',
    rolesNote: 'Roles decide what each person may do. Only an admin or owner can remove a project.',
    noApiTitle: 'No API behind this copy',
    noApiBody:
      'The public pages are static, so they deploy anywhere. The app needs a server for accounts and per-tenant data, and this deploy has none.',
    noApiRun: 'Run it locally and everything below works:',
    backToOverview: 'Back to the overview',
  },

  theme: { toDark: 'Switch to dark theme', toLight: 'Switch to light theme' },
};

export type Dictionary = typeof en;
