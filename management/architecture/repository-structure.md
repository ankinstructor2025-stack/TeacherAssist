# 構成

`api/` はFastAPIとFirebase Admin SDK、`ui/` は静的HTML・ES Modules、`management/` は仕様を管理します。
qaplainを構成の参考とし、独立したTeacherAssist専用Firebaseプロジェクトを使用します。
ローカル開発ではAPIがUIを同一オリジンで配信します。本番はFirebase HostingでUI、Cloud RunでAPIを配信する方針です。共通の外観は `ui/css/theme.css` に集約します。

`firebase.json` は `ui/` を公開し、`/api/**` を東京のCloud Runサービス `teacherassist` に転送します。リクエストパスとAuthorizationヘッダーはAPIへ渡り、API側で認証します。
ルートのDockerfileをビルドし、Cloud RunのPORT（既定8080）でUvicornを起動します。ローカル互換用にUIもイメージに含めます。
