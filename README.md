# TeacherAssist

プロフィールのAPI設定・暗号化キー・疎通テストの設定手順は [API設定](management/requirements/profile-api.md) を参照してください。

Googleログインを備えた独立アプリの初期構成です。TeacherAssist専用Firebaseプロジェクト `teacherassist-514007` を使用します。

- `api/`: FastAPI・Firebase IDトークン検証
- `ui/`: HTML・JavaScript・共通CSS
- `management/`: 仕様・構成・検証記録

## Firebase設定

1. TeacherAssist専用FirebaseプロジェクトにWebアプリを登録します。
2. Authentication の Sign-in method で Google を有効にします。
3. Authentication の Authorized domains に開発用 `localhost` と公開先ドメインを登録します。
4. Webアプリ設定は `ui/js/config.js` に反映済みです。これらは公開設定です。
5. APIに同じプロジェクトIDを `FIREBASE_AUTH_PROJECT_ID` として渡します。
6. APIでApplication Default Credentialsを利用できるようにします。ローカルでは専用プロジェクトのサービスアカウントJSONをリポジトリ外に保存し、`GOOGLE_APPLICATION_CREDENTIALS` にその絶対パスを設定できます。秘密鍵をUIやGitに追加しないでください。

## 起動（PowerShell）

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:FIREBASE_AUTH_PROJECT_ID = "teacherassist-514007"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:/secure/teacherassist-service-account.json"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

ブラウザーで http://localhost:8000 を開きます。UIとAPIを同じサーバーから配信します。`.env.example` は参考資料で、自動読込はしません。本番はHTTPSで配信してください。

## テスト

```powershell
cd api
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Firebaseプロジェクトの作成・実設定・実アカウントでのログイン検証は別途必要です。

UIの振る舞いのテスト: `node --test ui/tests/auth.test.cjs`（リポジトリルート）。

## 本番公開

Firebase HostingでUI、Cloud RunでAPIを配信します。`firebase.json` により `/api/**` を `teacherassist`（`asia-northeast1`）へ転送します。CORS設定は不要です。

1. 変更をGitHubに反映します。
2. Cloud Runのリポジトリ連携でmain、ルートの `/Dockerfile` を選択します。
3. サービス名 `teacherassist`、東京 `asia-northeast1`、コンテナポート8080、環境変数 `FIREBASE_AUTH_PROJECT_ID=teacherassist-514007` を指定します。
4. パブリックアクセスを許可します。利用者認証はAPIのFirebaseトークン検証で行います。
5. 実行用サービスアカウントには専用プロジェクトで `firebaseauth.users.get` を含む権限（例: Firebase Authentication閲覧者 `roles/firebaseauth.viewer`）を付与します。失効・無効化確認に必要です。秘密鍵ファイルやGOOGLE_APPLICATION_CREDENTIALSはCloud Runに設定しません。
6. Cloud Runのビルド・デプロイ成功後、下記をリポジトリルートで実行してHostingを公開します。`firebase init` は不要です。

```powershell
firebase login
firebase deploy --only hosting --project teacherassist-514007
```

公開先: https://teacherassist-514007.web.app

Cloud Runが存在しない状態ではHostingのAPI転送設定をデプロイできません。公開後にGoogleログイン・ログアウトと未認証拒否を確認してください。

## ユーザー管理の設定

Cloud Runに `system_administrator=管理者のGoogleメールアドレス` と `FIRESTORE_DATABASE_ID=teacher-assist` を設定します。
同じFirebaseプロジェクトにStandard版Firestoreデータベース `teacher-assist` を作成します。`users` コレクションは最初のユーザー登録で作成されます。
実行用サービスアカウントにFirestoreの読み書き権限（`roles/datastore.user`）を付与します。
管理者がシステムメニューのユーザー管理でメールアドレス・氏名を登録すると、対象者がGoogleログインで利用可能になります。
メール・氏名の編集、利用登録の削除もこの画面で行います。登録されていない人は利用できません。
