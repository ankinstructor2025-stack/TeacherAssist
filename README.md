# TeacherAssist

Googleログインを備えた独立アプリの初期構成です。qaplainの業務機能やFirebase設定は含みません。

- `api/`: FastAPI・Firebase IDトークン検証
- `ui/`: HTML・JavaScript・共通CSS
- `management/`: 仕様・構成・検証記録

## Firebase設定

1. TeacherAssist専用FirebaseプロジェクトにWebアプリを登録します。
2. Authentication の Sign-in method で Google を有効にします。
3. Authentication の Authorized domains に開発用 `localhost` と公開先ドメインを登録します。
4. Webアプリ設定の apiKey / authDomain / projectId / appId を `ui/js/config.js` に入力します。これらは公開設定です。
5. APIに同じプロジェクトIDを `FIREBASE_AUTH_PROJECT_ID` として渡します。
6. APIでApplication Default Credentialsを利用できるようにします。ローカルでは専用プロジェクトのサービスアカウントJSONをリポジトリ外に保存し、`GOOGLE_APPLICATION_CREDENTIALS` にその絶対パスを設定できます。秘密鍵をUIやGitに追加しないでください。

## 起動（PowerShell）

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:FIREBASE_AUTH_PROJECT_ID = "TeacherAssist専用プロジェクトID"
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
