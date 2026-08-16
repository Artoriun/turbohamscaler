import type { Dictionary } from './en';

/**
 * Japanese. The `: Dictionary` annotation is what makes a missing key a build failure rather
 * than a blank on the page.
 */
export const ja: Dictionary = {
  label: '日本語',
  language: { label: '言語' },

  nav: {
    overview: '概要',
    source: 'ソース',
    openApp: 'アプリを開く',
    sourceOnGitHub: 'GitHub でソースを見る',
  },

  home: {
    eyebrow: 'TurboRepo スターター',
    headline: 'マルチテナントアプリの退屈な部分は、',
    headlineAccent: 'すでに完成',
    lede: 'TurboHamscaler には、アカウント・組織・ロール・テナントごとのデータが揃っています。しかもテナント分離を裏づけるチェック付きです。クローンして、あなた自身の仕事から始めてください。',
    openDemo: 'デモを開く',
    readSource: 'ソースを読む',
    demoSignIn: 'デモ用サインイン:',
    whatYouGet: '含まれるもの',
    startHeading: '3 つのコマンドで開始',
    startNote:
      '組織を 2 つ用意してあるのには理由があります。片方でサインインすると、もう片方のデータはそもそも存在しません。それがこのスターターの要点です。',
    footer:
      'TurboHamscaler — マルチテナントアプリのための TurboRepo スターター。必要なサービスはすべて無料枠があるので、運用コストはハムスターにふさわしくゼロです。',
    features: {
      accounts: {
        title: '確実に失効するアカウント',
        body: 'セッションはトークンではなく行です。「すべての端末からサインアウト」は本当にすべてのセッションを終了させます。トークンの期限切れを待つ必要はありません。',
      },
      orgs: {
        title: '組織とロール',
        body: 'メンバー・管理者・オーナーと、組織ごとのデータ。全員が自分の組織から始まり、他の組織には招待で参加します。',
      },
      isolation: {
        title: '検証済みのテナント分離',
        body: 'テナント向けのクエリは 1 つのファイルにまとまり、必ず組織を最初に受け取ります。攻撃者の視点で書かれたテストが、データが混ざらないことを証明します。',
      },
      migrations: {
        title: 'ずれないマイグレーション',
        body: '順番に適用され、ハッシュで記録されます。適用済みのものを書き換えるとエラーになるので、データベースが知らないうちに他の人と食い違うことはありません。',
      },
      nothing: {
        title: '何も要らずに動く',
        body: 'アカウントもコンテナもネイティブビルドも不要。インストールしてシードすれば、組織が 2 つ入った動くアプリが手に入ります。',
      },
      pipeline: {
        title: '黙って通さないパイプライン',
        body: 'Lint、型、テナンシーガード、ユニットと API のテスト、バンドル予算、そしてブラウザテストを 2 回 — 開発サーバーとビルド成果物の両方に対して実行します。',
      },
    },
  },

  notFound: {
    title: 'ここには何もありません',
    body: 'TurboHam が回し車の裏まで探しましたが、そのページは存在しません。',
    back: '最初に戻る',
  },

  auth: {
    signIn: 'サインイン',
    createAccount: 'アカウントを作成',
    signInNote: 'あなたの組織とデータが待っています。',
    signUpNote: '最初の組織が自動で用意されます。',
    email: 'メールアドレス',
    name: '名前',
    password: 'パスワード',
    working: '処理中…',
    createAccountAction: 'アカウントを作成',
    switchToSignUp: '新しくアカウントを作成する',
    switchToSignIn: 'すでにアカウントを持っている',
    rejected: 'その内容では認証できませんでした。',
    couldNotCreate: 'アカウントを作成できませんでした。',
    weakPassword: 'パスワードは 10 文字以上にしてください。',
    emailTaken: 'そのメールアドレスは既に登録されています。',
    signOut: 'サインアウト',
  },

  portal: {
    organisation: '組織',
    orgSettings: '組織',
    account: 'アカウント',
    yourName: '名前',
    saveName: '保存',
    currentPassword: '現在のパスワード',
    newPassword: '新しいパスワード',
    changePassword: 'パスワードを変更',
    passwordChanged: 'パスワードを変更しました。他の端末はサインアウトされました。',
    passwordWrong: '現在のパスワードが違います。',
    closeAccount: 'アカウントを削除',
    closeConfirm: 'アカウントを削除しますか？元に戻せません。',
    closeBlocked:
      '{orgs} の唯一のオーナーです。別のメンバーをオーナーにするか、組織を削除してから実行してください。',
    orgName: '名前',
    orgRename: '名前を変更',
    orgDelete: 'この組織を削除',
    orgDeleteConfirm:
      '{name} を削除しますか？プロジェクト・メンバー・招待・履歴もすべて削除されます。元に戻せません。',
    orgCreate: '新しい組織',
    orgCreateName: '新しい組織の名前',
    orgCreateAction: '作成',
    orgNone: 'まだどの組織にも所属していません。まずは組織を作成してください。',
    orgFailed: 'この変更は許可されていません。',
    ownerOf:
      'あなたはこの組織のオーナーです。以下のデータはすべてこの組織のもので、他の誰のものでもありません。',
    memberOf:
      'あなたはこの組織の{role}です。以下のデータはすべてこの組織のもので、他の誰のものでもありません。',
    projects: 'プロジェクト',
    newProject: '新しいプロジェクト',
    newProjectLabel: '新しいプロジェクト名',
    add: '追加',
    noProjects: 'プロジェクトはまだありません。',
    loading: '読み込み中…',
    delete: '削除',
    deleteNamed: '{name} を削除',
    members: 'メンバー',
    invitations: '招待',
    activity: 'アクティビティ',
    activityNone: 'まだ何も起きていません。',
    activityBy: '実行者：{who}',
    action: {
      'organisation.created': '{subject} を作成しました',
      'organisation.renamed': '組織名を {subject} に変更しました',
      'invitation.created': '{subject} を招待しました',
      'invitation.revoked': '{subject} への招待を取り消しました',
      'invitation.accepted': '{subject} が参加しました',
      'member.role-changed': '{subject} の権限を変更しました',
      'member.removed': '{subject} を削除しました',
      'member.left': '{subject} が抜けました',
    },
    memberRole: '{name} の権限',
    memberRemove: '削除',
    memberRemoveNamed: '{name} をこの組織から削除',
    leave: 'この組織から抜ける',
    leaveConfirm: '{org} から抜けますか？組織内のすべてにアクセスできなくなります。',
    lastOwner: '組織にはオーナーが必要です。先に別のメンバーをオーナーにしてください。',
    memberChangeFailed: 'この変更は許可されていません。',
    joinHeading: '{org} に参加しますか？',
    joinBody: '{role} として招待されています。',
    joinAccept: '招待を承諾',
    joinDecline: '今はしない',
    joinGone: 'この招待は無効になりました。新しい招待を依頼してください。',
    joinWrongAccount:
      'この招待は別のアドレス宛てです。そのアカウントでサインインして承諾してください。',
    inviteHeading: 'メンバーを招待',
    inviteEmail: '招待するアドレス',
    inviteRole: '権限',
    inviteAction: '招待を作成',
    inviteNote:
      '招待は指定したアドレス宛てに作られます。アカウント一覧とは照合しないため、誰が登録済みかが分かることはありません。',
    inviteTokenHeading: 'このリンクを相手に送ってください',
    inviteTokenNote: '表示はこの一度きりです。保存されないので、いまコピーしてください。',
    inviteCopy: 'コピー',
    inviteCopied: 'コピーしました',
    inviteRevoke: '取り消す',
    inviteRevokeNamed: '{email} への招待を取り消す',
    invitePending: '承諾待ち',
    inviteExpired: '期限切れ',
    inviteNone: '保留中の招待はありません。',
    inviteTaken: 'このアドレスにはすでにこの組織への招待があります。',
    inviteBadAddress: 'メールアドレスと権限を入力してください。',
    rolesNote:
      'ロールによってできることが決まります。プロジェクトを削除できるのは管理者とオーナーだけです。',
    noApiTitle: 'このコピーには API がありません',
    noApiBody:
      '公開ページは静的なのでどこにでも配置できます。一方アプリ側はアカウントとテナントごとのデータのためにサーバーが必要ですが、この配置にはサーバーがありません。',
    noApiRun: 'ローカルで実行すれば、以下がすべて動きます:',
    backToOverview: '概要に戻る',
  },

  theme: { toDark: 'ダークテーマに切り替える', toLight: 'ライトテーマに切り替える' },
};
