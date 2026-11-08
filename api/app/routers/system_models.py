from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from ..auth import administrator
from ..firebase import database
from ..services.ai_models import model_data, save_model, remove_model

router = APIRouter(prefix="/api/system/models", dependencies=[Depends(administrator)])


class ModelRequest(BaseModel):
    provider: Literal["openai", "gemini", "takane"]
    model_name: str = Field(min_length=1, max_length=100)
    enabled: bool = True


def model_values(body):
    name = body.model_name.strip()
    if not name:
        raise HTTPException(422, "モデル名を入力してください。")
    return {"provider": body.provider, "model_name": name, "enabled": body.enabled}


@router.get("")
def list_models(response: Response):
    response.headers["Cache-Control"] = "no-store"
    records = [model_data(doc) for doc in database().collection("system_ai_models").stream() if not doc.to_dict().get("deleted")]
    return {"models": sorted(records, key=lambda row: (row["provider"], row["model_name"]))}


@router.get("/{model_id}")
def get_model(model_id: str, response: Response):
    response.headers["Cache-Control"] = "no-store"
    record = database().collection("system_ai_models").document(model_id).get()
    if not record.exists or record.to_dict().get("deleted"):
        raise HTTPException(404, "モデルが見つかりません。")
    return model_data(record)


def persist(body, response, model_id=None):
    response.headers["Cache-Control"] = "no-store"
    values = model_values(body)
    db = database()
    return save_model(db.transaction(), db.collection("system_ai_models"), db.collection("system_ai_model_keys"), values, model_id)


@router.post("", status_code=201)
def create_model(body: ModelRequest, response: Response):
    return persist(body, response)


@router.put("/{model_id}")
def update_model(model_id: str, body: ModelRequest, response: Response):
    return persist(body, response, model_id)


@router.delete("/{model_id}")
def delete_model(model_id: str, response: Response):
    response.headers["Cache-Control"] = "no-store"
    db = database()
    return remove_model(db.transaction(), db.collection("system_ai_models"), db.collection("system_ai_model_keys"), model_id)
