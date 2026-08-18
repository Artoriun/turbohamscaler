/**
 * The privacy page's copy, kept out of the shared dictionaries on purpose.
 *
 * Every string in i18n/en.ts and i18n/ja.ts ships in the initial payload, because the language
 * provider is loaded on the first paint of every page. Nine paragraphs of prose in two languages
 * is about 3KB gzipped of that, spent on a page almost nobody opens — enough to put the public
 * page over its bundle budget. Here, it loads with the page that uses it.
 *
 * `ja` is typed against `en`, so a missing translation is a type error rather than a blank
 * section, which is the same guarantee the main dictionaries give.
 */

export const PRIVACY_EN = {
  title: 'Privacy',
  lede: 'What this app stores, why, and how to get rid of it. Written against the schema rather than from a template — if a line here is wrong, the code is what is right.',
  cookieHeading: 'One cookie',
  cookieBody:
    'A session cookie, set when you sign in and cleared when you sign out. It holds a random identifier and nothing else — not your address, not your name, nothing derived from them. It is httpOnly, so scripts on the page cannot read it, and SameSite=Lax, so a browser will not send it to another site. There is no tracking cookie, because there is no tracking.',
  storedHeading: 'What is stored',
  storedBody: 'Everything below lives in this deployment’s own database and goes nowhere else.',
  storedAccount:
    'Your name, your email address, and your password — hashed with PBKDF2, never in a form anybody can read back.',
  storedWork:
    'The organisations, projects and invitations you create, with the times they were created and changed.',
  storedSessions:
    'One row per signed-in device, so you can end any of them. The list names them by a hash of the session rather than by the session itself.',
  storedAudit:
    'An audit log of membership and invitation changes, admin-visible, which keeps the actor’s name as it was at the time — so a record still reads after the account behind it is gone.',
  logsHeading: 'Server logs',
  logsBody:
    'One line per request: a request id, the method and path, the response status, how long it took, and the organisation and account it belonged to. No page content and no field values. The identifier is echoed back to you on the response, so an error you report can be found in the log by the string you were shown.',
  emailHeading: 'Email',
  emailBody:
    'This starter ships without a mail provider, so by default it sends nothing at all — an invitation hands the token to the admin to pass on themselves. Install a provider and invitation emails go to the address they are addressed to, and nowhere else.',
  thirdPartiesHeading: 'Third parties',
  thirdPartiesBody:
    'None. No analytics, no fonts or scripts from anybody else’s server, no error-reporting service unless the deployer installs one. The content security policy this app sends refuses connections to other origins outright, so the browser enforces it rather than taking anyone’s word for it.',
  deleteHeading: 'Removing it',
  deleteBody:
    'Closing your account deletes it, along with your sessions and memberships. It is refused while you are the only owner of an organisation with other people in it — hand that over or delete the organisation first. Audit entries stay, holding the name recorded at the time, because a log an actor can erase is not a log.',
  demoNote:
    'On the public demo, none of this is worth worrying about: the database is thrown away and rebuilt from two fictional hamsters on every restart. Do not put anything real in it — not because it would leak, but because it will be gone.',
  forkNote:
    'Deploying your own copy? This page describes what the code in this repository does. Change the code and this page stops being true, so read it again before you ship.',
};

export const PRIVACY_JA: typeof PRIVACY_EN = {
  title: 'プライバシー',
  lede: 'このアプリが何を保存し、なぜ保存し、どうすれば消せるのか。テンプレートではなくスキーマを読んで書いています。ここの記述とコードが食い違っていれば、正しいのはコードです。',
  cookieHeading: 'クッキーは 1 つだけ',
  cookieBody:
    'サインイン時に設定し、サインアウト時に削除するセッションクッキーです。中身はランダムな識別子だけで、メールアドレスも名前も、そこから導かれるものも含みません。httpOnly なのでページ上のスクリプトからは読めず、SameSite=Lax なので他サイトへは送信されません。トラッキングは行わないので、トラッキング用のクッキーもありません。',
  storedHeading: '保存するもの',
  storedBody: '以下はすべて、この配置自身のデータベースにのみ保存されます。',
  storedAccount:
    '名前、メールアドレス、パスワード。パスワードは PBKDF2 でハッシュ化され、読み戻せる形では保存しません。',
  storedWork: '作成した組織・プロジェクト・招待と、その作成日時と更新日時。',
  storedSessions:
    'サインイン中の端末ごとに 1 行。どれでも終了できます。一覧ではセッションそのものではなく、そのハッシュで識別します。',
  storedAudit:
    'メンバーと招待の変更履歴（管理者のみ閲覧可）。実行者の名前はその時点のまま保持されるので、アカウントが削除されたあとでも記録として読めます。',
  logsHeading: 'サーバーログ',
  logsBody:
    'リクエストごとに 1 行。リクエスト ID、メソッドとパス、ステータス、所要時間、そして対象の組織とアカウントを記録します。ページの内容や入力値は記録しません。ID はレスポンスにも返されるので、表示された文字列からログを特定できます。',
  emailHeading: 'メール',
  emailBody:
    'このスターターはメール送信サービスを同梱していないため、初期状態では何も送信しません。招待はトークンを管理者に返し、管理者が自分で渡します。送信サービスを設定すると、招待メールは宛先のアドレスにのみ送られます。',
  thirdPartiesHeading: '第三者',
  thirdPartiesBody:
    'ありません。アクセス解析も、外部サーバーのフォントやスクリプトもなく、エラー収集サービスも配置者が導入しない限り使いません。このアプリが送るコンテンツセキュリティポリシーが他オリジンへの接続を禁じているので、宣言ではなくブラウザが実際に強制します。',
  deleteHeading: '削除する',
  deleteBody:
    'アカウントを閉じると、セッションとメンバーシップも含めて削除されます。ただし他のメンバーがいる組織の唯一のオーナーである間は拒否されます。先に譲渡するか、組織を削除してください。監査ログはその時点の名前を保持したまま残ります。実行者が消せるログは、ログとして意味をなさないからです。',
  demoNote:
    '公開デモでは気にする必要はありません。データベースは再起動のたびに破棄され、架空のハムスター 2 匹から作り直されます。実在の情報は入れないでください。漏れるからではなく、消えるからです。',
  forkNote:
    '自分の環境に配置する場合、このページはこのリポジトリのコードの動作を説明したものです。コードを変えればこのページは正しくなくなるので、公開前に読み直してください。',
};

export const PRIVACY = { en: PRIVACY_EN, ja: PRIVACY_JA };
