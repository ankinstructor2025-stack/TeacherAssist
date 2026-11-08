# プロフィールのAPI設定

qaplainのAPI呼び出し・Fernetによるキー保存を参考にする。プロフィール内で管理者が有効にしたモデルを選択し、自分のAPIキーを保存する。
保存済みキーはpassword入力欄に伏せ字で表示し、「表示／非表示」で文字列を確認できる。Embeddingなどの設定項目は設けない。

## 保存

- 学校プロフィールとは独立した `/api/profile/ai` のGET・PUTを使う。
- 設定は `user_ai_settings/{Firebase UID}` に保存し、認証された自分の設定だけを取得・更新する。
- APIキーは暗号化して保存する。自分の設定取得時のみ復号して返す。レスポンスは `Cache-Control: no-store`。
- 未入力での保存は同じAI種類に限り既存キーを維持する。種類を変更したらキー欄をクリアし、新しいキーを要求する。
- 管理者によるモデルの削除・無効化後は、そのモデルで保存・テストできない。

## 疎通テスト

- 「疎通テスト」を押すだけ。利用者が文字を入力する欄は設けない。
- `/api/profile/ai/test` は保存済みモデルと保存済みキーを使い、固定の短文を送信する。
- 画面には成功・失敗を表示する。生成された確認文や外部APIの生のエラーは返さない。
- 未保存の変更がある間はテストを無効にする。失敗時も設定・入力は保持し再試行できる。
- OpenAIはResponses API、GeminiはgenerateContent、Takaneはqaplain同様の互換chat/completionsを使用する。
- 外部接続はタイムアウトを設定し、キーを付けたリダイレクトを追わない。

## サーバー設定

`API_KEY_ENCRYPTION_KEY` にFernetキーを設定する。生成方法（生成値はGitに保存しない）：

```powershell
api/.venv/Scripts/python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Cloud RunではSecret Manager等で値を管理し、環境変数として渡す。既存データの復号に必要なため、保存後に値を変更・紛失しない。
`.env.example` の自動読み込みは行わない。ローカルではプロセスの環境変数に設定する。
Takaneを利用する場合のみ、契約先のHTTPS URLを `TAKANE_CHAT_COMPLETIONS_URL` に設定する。
qaplainのHTTP接続例はそのまま移植せず、キーを暗号化通信で送信する。

実APIのテストには利用者によるキー設定が必要。自動テストは外部APIをモックして検証する。
