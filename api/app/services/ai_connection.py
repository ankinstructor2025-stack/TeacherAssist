import os
from urllib.parse import quote, urlsplit

import httpx
from fastapi import HTTPException

TEST_MESSAGE = "接続テストです。OKとだけ返答してください。"


def generate_text(provider, model, api_key, message, max_output_tokens=512, output_schema=None):
    if provider == "openai":
        url = "https://api.openai.com/v1/responses"
        headers = {"Authorization": f"Bearer {api_key}"}
        body = {"model": model, "input": message, "max_output_tokens": max_output_tokens, "store": False}
    elif provider == "gemini":
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model, safe='')}:generateContent"
        headers = {"x-goog-api-key": api_key}
        body = {"contents": [{"parts": [{"text": message}]}], "generationConfig": {"maxOutputTokens": max_output_tokens}}
    elif provider == "takane":
        url = os.environ.get("TAKANE_CHAT_COMPLETIONS_URL", "").strip()
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise HTTPException(503, "Takaneの接続先設定が未完了です。管理者にお問い合わせください。")
        headers = {"Ocp-Apim-Subscription-Key": api_key}
        body = {"model": model, "messages": [{"role": "user", "content": message}], "max_tokens": max_output_tokens}
    else:
        raise HTTPException(422, "対応していないAIの種類です。")
    if output_schema and provider == "openai":
        body["text"] = {"format": {"type": "json_schema", "name": "lesson_suggestion", "schema": output_schema, "strict": True}}
    elif output_schema and provider == "gemini":
        body["generationConfig"].update({"responseMimeType": "application/json", "responseJsonSchema": output_schema})
    try:
        # Do not follow redirects carrying credentials or return upstream error bodies.
        response = httpx.post(url, headers=headers, json=body, timeout=55 if max_output_tokens > 512 else 45, follow_redirects=False)
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
            parts = [part.get("text", "") for item in value.get("output", []) for part in item.get("content", []) if part.get("type") == "output_text"] if value.get("status") == "completed" else []
        elif provider == "gemini":
            parts = [part.get("text", "") for item in value.get("candidates", []) for part in item.get("content", {}).get("parts", []) if not part.get("thought")]
        else:
            parts = [item.get("message", {}).get("content", "") for item in value.get("choices", [])]
        answer = "".join(parts).strip()
        if not answer:
            raise HTTPException(502, "AIに接続しましたが、回答を取得できませんでした。")
        return answer
    except httpx.TimeoutException:
        raise HTTPException(504, "AIへの接続がタイムアウトしました。再試行してください。") from None
    except (httpx.RequestError, ValueError, TypeError, AttributeError):
        raise HTTPException(502, "AIとの通信に失敗しました。接続設定を確認してください。") from None


def test_connection(provider, model, api_key):
    generate_text(provider, model, api_key, TEST_MESSAGE)
