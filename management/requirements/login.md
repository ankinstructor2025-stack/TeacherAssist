# ログイン・ユーザー管理仕様

Google認証後、APIでメールアドレスの利用登録を確認します。
環境変数 `system_administrator` に指定した確認済みメールアドレスは、登録なしでシステムメニューに進めます。
その他はFirestoreに登録済みの確認済みメールアドレスだけ利用できます。未登録の場合は403を返し、ログイン画面で認証状態を解除します。

## Firestore

TeacherAssist専用プロジェクトのデータベース `teacher-assist`（環境変数 `FIRESTORE_DATABASE_ID`）、コレクション `users` を使用します。
各文書には `email` と `user_name` を保存します。メールは前後の空白を除去し小文字化します。
文書IDは正規化メールのSHA-256です。メール変更時はトランザクションで旧文書を削除して新文書へ移します。同じメールの重複登録は409です。
初期状態の一覧は空です。Firebase Authenticationの認証済みアカウント一覧は表示しません。

## API

- `POST /api/session`: Firebase IDトークン検証と利用登録確認。氏名は登録した `user_name` を返します。
- `GET /api/system/users`: 登録ユーザー一覧。
- `POST /api/system/users`: `{ "email": "...", "user_name": "..." }` を登録。
- `PUT /api/system/users/{id}`: メール・氏名を修正。
- `DELETE /api/system/users/{id}`: 登録を削除。

管理APIはすべてシステム管理者のみ利用可能です。登録確認は `current_user` で毎回実施するため、削除またはメール変更後は旧メールでの次のAPI利用を拒否します。
Google認証そのものとアプリの利用許可は別です。ユーザー削除時にFirebase Authenticationアカウントは削除しません。
APIのFirestoreアクセスはAdmin SDKとIAMで行います。ブラウザーからFirestoreを直接操作しないため、セキュリティルールは限定的のまま使用します。

## ユーザーメニュー

登録済みの一般ユーザーはログイン成功後 `ui/html/home.html` のユーザーメニューへ進みます。
先頭項目は「プロフィール」で、登録された氏名とログインメールアドレスを確認できます。
管理者は引き続きシステムメニューへ進みます。未登録ユーザーにはログイン画面でAPIのエラーメッセージを表示します。

## 所属学校のプロフィール登録

ユーザー本人が都道府県→市区町村→公立小学校を選択して登録します。
`GET /api/schools` は都道府県一覧、`prefecture` 指定で市区町村一覧、さらに `city` 指定で学校一覧を返します。
`GET /api/profile` と `PUT /api/profile` は認証ユーザー本人の `users` 文書の `profile` を読み書きします。
保存するのは `prefecture`, `city`, `school_code`, `school_name` です。学校コードをサーバー側の公立小学校一覧と照合して地名・学校名を確定します。
氏名・メール・他人のプロフィールは変更できません。管理者によるメール・氏名変更時もプロフィールを保持します。
学校データの出典と抽出条件は `api/app/data/README.md` に記載します。
