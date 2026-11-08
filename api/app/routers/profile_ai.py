from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Response, HTTPException
from pydantic import BaseModel, Field, SecretStr

from ..auth import current_user
from ..firebase import database
from ..services.ai_models import model_data
from ..services.profile_ai import public_settings, active_model, save_settings
from ..services.api_secrets import decrypt_key
from ..services.ai_connection import test_connection
from .profile import profile_document

router = APIRouter(prefix="/api/profile/ai")


class AiSettingsRequest(BaseModel):
    model_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    api_key: SecretStr | None = None


def settings_reference(user):
    return database().collection("user_ai_settings").document(user["uid"])


@router.get("")
def get_settings(response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    profile_document(user)
    models = [model_data(doc) for doc in database().collection("system_ai_models").stream()
              if doc.to_dict().get("enabled") and not doc.to_dict().get("deleted")]
    record = settings_reference(user).get()
    value = record.to_dict() if record.exists else {}
    return {"models": sorted(models, key=lambda row: (row["provider"], row["model_name"])),
            "settings": {**public_settings(value), "api_key": decrypt_key(value["api_key_encrypted"]) if value.get("api_key_encrypted") else ""}}


@router.put("")
def update_settings(body: AiSettingsRequest, response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    raw = body.api_key.get_secret_value().strip() if body.api_key else ""
    if len(raw) > 4096 or any(char.isspace() for char in raw):
        raise HTTPException(422, "APIキーの形式を確認してください。")
    record = profile_document(user)
    db = database()
    return {"settings": save_settings(db.transaction(), record.reference, db.collection("system_ai_models"),
                                      settings_reference(user), user["email"], body.model_id, raw)}


@router.post("/test")
def test_settings(response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    profile_document(user)
    record = settings_reference(user).get()
    value = record.to_dict() if record.exists else {}
    if not value.get("api_key_encrypted"):
        raise HTTPException(422, "先にモデルとAPIキーを保存してください。")
    model = active_model(database().collection("system_ai_models").document(value["model_id"]).get())
    if model["provider"] != value["provider"] or model["model_name"] != value["model_name"]:
        raise HTTPException(409, "モデル設定が変更されています。モデルを選び直して保存してください。")
    test_connection(model["provider"], model["model_name"], decrypt_key(value["api_key_encrypted"]))
    return {"ok": True, "message": "疎通テストに成功しました。", "tested_at": datetime.now(timezone.utc).isoformat()}
