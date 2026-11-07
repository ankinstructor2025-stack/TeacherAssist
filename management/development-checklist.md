# 開発・検証記録

## 2026-11-07 初期ログイン実装

- qaplainの管理README、構成、開発チェック、管理者認証、UIスタイル資料とUI/API認証実装を参照。
- TeacherAssist専用 `api/.venv` を作成し、requirementsをインストール（終了コード0）。
- API: `cd api; .venv/Scripts/python.exe -m unittest discover -s tests -v`、7テスト成功、終了コード0。
- UI: `node --test ui/tests/auth.test.cjs`、6テスト成功、終了コード0。
- API検証: 正常セッション、認証ヘッダー欠落・不正、無効・期限切れ・失効・無効ユーザー、Google以外の拒否、静的配信、設定未入力時の起動拒否、専用アプリと失効確認の利用。
- UI検証: API確認後の遷移、ポップアップ失敗・API失敗時の再試行、未認証リダイレクト、テキストによるユーザー表示、ログアウト、不正トークン時の非表示。
- 全画面は共通theme.cssを利用。インラインスタイル・画面固有CSSなし。qaplainのスタイルを確認し、独立アプリのログインと最小ホームに必要な共通表現のみ定義。
- 未検証: Firebase実設定が未提供のため、実Googleアカウントのログイン、実トークンによる通信、実資格情報によるAPI起動、ブラウザーでのPC・狭幅レイアウト。実運用可能なログインとしての検証は未完了。

## 設定後の手動確認

1. READMEの専用Firebase設定を反映して起動。
2. Googleログインでホームに名前とメールが表示されること。
3. 再読み込み時に認証が維持されること。
4. ログアウト後のホーム直接アクセス・戻る操作でユーザー情報が表示されないこと。
5. ポップアップ取消・API停止時にエラー表示と再試行が可能なこと。
6. PC幅・375px幅で表示とキーボード操作を確認。

## 2026-11-07 Firebase Web設定の反映

- 専用プロジェクト `teacherassist-514007` の公開Web設定を反映。APIの環境変数例も同じIDに更新。
- 本番はFirebase Hosting（UI）とCloud Run（API）を使う方針を構成資料に記録。配信設定は未追加。
- 設定モジュールの読込・必須値・プロジェクトID・authDomain・APIパスの確認成功。
- UI 6テスト、API 7テスト成功、各終了コード0。
- 実Googleログイン、Firebase ConsoleでのGoogle有効化、Hosting/Cloud Runのデプロイ・接続は未検証。

## 2026-11-07 Cloud Run・Hosting配信設定

- 管理README・構成・ログイン仕様・検証記録を確認してから変更。
- ルートDockerfile（Python 3.11、Uvicorn、0.0.0.0:$PORT）、Docker除外設定、Firebase Hosting設定を追加。
- `ui/` を公開し `/api/**` は `teacherassist` / `asia-northeast1` に転送。UIテスト用ファイルはHosting公開対象から除外。
- 構成JSON・配信先・公開ディレクトリ検証成功。Uvicornを専用プロジェクトIDで起動し、画面のHTTP 200、未認証APIの401を確認、終了コード0。実トークンの検証は未実施。
- API 7テスト、UI 6テスト成功（各終了コード0）、git diff --check成功。
- Dockerエンジン停止によりdocker info失敗（終了コード1）。Dockerビルド・コンテナ起動・Cloud Build・本番公開・実Googleログインは未検証。
- ユーザー提示の画面でGoogleプロバイダー有効化とHostingドメイン承認を確認。
