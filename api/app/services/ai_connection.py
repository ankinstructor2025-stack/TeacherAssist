import os
from urllib.parse import quote, urlsplit

import httpx
from fastapi import HTTPException

TEST_MESSAGE = "接続テストです。OKとだけ返答してください。"


def test_connection(provider, model, api_key):
    if provider == "openai":
        url = "https://api.openai.com/v1/responses"
        headers = {"Authorization": f"Bearer {api_key}"}
        body = {"model": model, "input": TEST_MESSAGE, "max_output_tokens": 512, "store": False}
    elif provider == "gemini":
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model, safe='')}:generateContent"
        headers = {"x-goog-api-key": api_key}
        body = {"contents": [{"parts": [{"text": TEST_MESSAGE}]}], "generationConfig": {"maxOutputTokens": 512}}
    elif provider == "takane":
        url = os.environ.get("TAKANE_CHAT_COMPLETIONS_URL", "").strip()
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise HTTPException(503, "Takaneの接続先設定が未完了です。管理者にお問い合わせください。")
        headers = {"Ocp-Apim-Subscription-Key": api_key}
        body = {"model": model, "messages": [{"role": "user", "content": TEST_MESSAGE}], "max_tokens": 64}
    else:
        raise HTTPException(422, "対応していないAIの種類です。")
    try:
        # Do not follow redirects carrying credentials or return upstream error bodies.
        response = httpx.post(url, headers=headers, json=body, timeout=45, follow_redirects=False)
        if not response.is_success:
            if response.status_code in (401, 403):
                message = "AIの認証に失敗しました。APIキーと利用権限を確認してください。"
            elif response.status_code == 429:
                message = "AIの利用上限または送信制限に達しています。時間をおいて再試行してください。"
            elif response.status_code == 404:
                message = "選択したモデルが見つかりません。モデル名と利用権限を確認してください。"
            else:
                message = "AIへの接続に失敗しました。設定を確認して再試行してください。"
            raise HTTPException(502, message)
        value = response.json()
        if provider == "openai":
            answered = value.get("status") == "completed" and any(
                part.get("type") == "output_text" and part.get("text", "").strip()
                for item in value.get("output", []) for part in item.get("content", []))
        elif provider == "gemini":
            answered = any(part.get("text", "").strip() and not part.get("thought")
                           for item in value.get("candidates", []) for part in item.get("content", {}).get("parts", []))
        else:
            answered = any(item.get("message", {}).get("content", "").strip() for item in value.get("choices", []))
        if not answered:
            raise HTTPException(502, "AIに接続しましたが、確認用の回答を取得できませんでした。")
    except httpx.TimeoutException:
        raise HTTPException(504, "AIへの接続がタイムアウトしました。再試行してください。") from None
    except (httpx.RequestError, ValueError, TypeError, AttributeError):
        raise HTTPException(502, "AIとの通信に失敗しました。接続設定を確認してください。") from None
