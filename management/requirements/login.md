# ログイン仕様

Googleログインとログアウトのみを実装します。テナント管理・利用者権限管理・業務機能は含みません。
Firebase AuthenticationのGoogleログインが成功した利用者は利用可能です。利用者の事前登録や独自のアクセス制限は設けません。

## インターフェース

`POST /api/session` に `Authorization: Bearer <Firebase ID token>` を付けます。
成功時は `200` と `{ "uid": "...", "email": "...", "name": "..." }` を返し、`Cache-Control: no-store` を設定します。
トークン欠落・無効・期限切れ・失効・無効化ユーザーは401、Google以外の認証プロバイダーは403です。
Firebase Admin SDKが専用プロジェクトの署名・期限・発行元・対象プロジェクト・失効を検証します。
認証サービス障害などの予期しないエラーは成功扱いにせずAPIエラーとします。

## 状態・保存

認証状態はFirebaseのブラウザーセッション永続化を使用します。独自Cookie・ユーザーDB・Firestoreは作成しません。
IDトークンはリクエスト直前にSDKから取得し、独自に保存しません。
ホームはAPI検証完了までユーザー情報を表示しません。未ログイン時はログイン画面へ遷移します。
ログイン操作の失敗時は認証状態を解除し、エラーを表示して再試行できます。
ログアウトは当該ブラウザーのFirebase認証状態を解除します。他端末のセッション失効は行いません。
ホームHTML自体は公開静的ファイルです。今後の業務APIには必ず `current_user` 認証依存を適用します。

公式資料: https://firebase.google.com/docs/auth/admin/verify-id-tokens
