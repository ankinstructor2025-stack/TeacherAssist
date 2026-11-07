# 構成

`api/` はFastAPIとFirebase Admin SDK、`ui/` は静的HTML・ES Modules、`management/` は仕様を管理します。
qaplainを構成の参考とし、独立したTeacherAssist専用Firebaseプロジェクトを使用します。
ローカル開発ではAPIがUIを同一オリジンで配信します。本番はFirebase HostingでUI、Cloud RunでAPIを配信する方針です。共通の外観は `ui/css/theme.css` に集約します。

`firebase.json` は `ui/` を公開し、`/api/**` を東京のCloud Runサービス `teacherassist` に転送します。リクエストパスとAuthorizationヘッダーはAPIへ渡り、API側で認証します。

## APIの分割

- `api/app/main.py`: アプリ生成、ルーター登録、静的UIの配信。
- `api/app/firebase.py`: Firebaseの起動・終了、Firestore接続。
- `api/app/auth.py`: トークン検証、利用登録と管理者権限の確認。
- `api/app/identity.py`: メールアドレスの正規化と文書キー。
- `api/app/routers/`: session、system_users、profile、schools、teaching_subjects の機能別API。
- `api/app/services/`: 学校一覧の読み込み、公開採択情報と所属校・使用年度の照合。
- `api/app/data/`: 学校一覧、出典と適用期間を持つ公開採択情報。

機能を追加するときは対応するルーター・サービスに配置し、main.pyには業務処理を追加しない。
ルートのDockerfileをビルドし、Cloud RunのPORT（既定8080）でUvicornを起動します。ローカル互換用にUIもイメージに含めます。
