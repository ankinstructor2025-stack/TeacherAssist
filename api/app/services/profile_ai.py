from datetime import datetime, timezone

from fastapi import HTTPException
from firebase_admin import firestore

from ..identity import normalize_email
from .api_secrets import encrypt_key


def public_settings(value):
    return {"model_id": value.get("model_id", ""), "provider": value.get("provider", ""),
            "model_name": value.get("model_name", ""), "has_api_key": bool(value.get("api_key_encrypted"))}


def active_model(record):
    value = record.to_dict() if record.exists else {}
    if not value or value.get("deleted") or not value.get("enabled"):
        raise HTTPException(422, "利用可能なモデルを選択してください。")
    return value


@firestore.transactional
def save_settings(transaction, registration, models, settings, email, model_id, api_key):
    user = registration.get(transaction=transaction)
    if not user.exists or normalize_email(user.to_dict().get("email", "")) != normalize_email(email):
        raise HTTPException(403, "利用登録が変更されました。ログインし直してください。")
    model = active_model(models.document(model_id).get(transaction=transaction))
    previous = settings.get(transaction=transaction)
    old = previous.to_dict() if previous.exists else {}
    if api_key:
        encrypted = encrypt_key(api_key)
    elif old.get("api_key_encrypted") and old.get("provider") == model["provider"]:
        encrypted = old["api_key_encrypted"]
    else:
        raise HTTPException(422, "選択したAIのAPIキーを入力してください。")
    value = {"model_id": model_id, "provider": model["provider"], "model_name": model["model_name"],
             "api_key_encrypted": encrypted, "updated_at": datetime.now(timezone.utc).isoformat()}
    transaction.set(settings, value)
    return public_settings(value)
