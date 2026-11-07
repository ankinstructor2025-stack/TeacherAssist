# 構成

`api/` はFastAPIとFirebase Admin SDK、`ui/` は静的HTML・ES Modules、`management/` は仕様を管理します。
qaplainを構成の参考とし、独立したTeacherAssist専用Firebaseプロジェクトを使用します。
APIがUIを同一オリジンで配信します。共通の外観は `ui/css/theme.css` に集約します。
