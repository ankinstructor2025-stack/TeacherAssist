from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict, ValidationError

from ..firebase import database
from .profile_ai import active_model
from .api_secrets import decrypt_key
from .ai_connection import generate_text
from .prompts import build_prompt, OUTPUT_SCHEMA


class LessonSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=150)
    objectives: str = Field(min_length=1, max_length=10000)
    activities: str = Field(min_length=1, max_length=20000)
    assessment: str = Field(min_length=1, max_length=10000)
    notes: str = Field(max_length=10000)


def suggest_lesson(uid, context):
    db = database()
    record = db.collection("user_ai_settings").document(uid).get()
    settings = record.to_dict() if record.exists else {}
    if not settings.get("api_key_encrypted"):
        raise HTTPException(422, "プロフィールでモデルとAPIキーを保存してください。")
    model = active_model(db.collection("system_ai_models").document(settings["model_id"]).get())
    if model["provider"] != settings["provider"] or model["model_name"] != settings["model_name"]:
        raise HTTPException(409, "プロフィールでモデルを選び直して保存してください。")
    prompt = build_prompt(uid, context)
    answer = generate_text(model["provider"], model["model_name"], decrypt_key(settings["api_key_encrypted"]), prompt, max_output_tokens=8192, output_schema=OUTPUT_SCHEMA)
    try:
        text = answer.strip()
        if text.startswith("```") and text.endswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        result = LessonSuggestion.model_validate_json(text)
        if any(not getattr(result, field).strip() for field in ("title", "objectives", "activities", "assessment")):
            raise ValueError("empty suggestion")
    except (ValidationError, ValueError, IndexError):
        raise HTTPException(502, "AI提案の形式を読み取れませんでした。再度お試しください。") from None
    return {"suggestion": result.model_dump(), "model_name": model["model_name"]}
