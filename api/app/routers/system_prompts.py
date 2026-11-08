from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, ConfigDict

from ..auth import administrator
from ..firebase import database
from ..services.prompts import check_type, common_prompt, PROMPT_TYPES

router = APIRouter(prefix="/api/system/prompts", dependencies=[Depends(administrator)])


class PromptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt_text: str = Field(min_length=1, max_length=12000)


@router.get("")
def list_prompts(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {"prompts": [{key: value[key] for key in ("prompt_type", "prompt_name", "updated_at", "exists")} for value in (common_prompt(kind) for kind in PROMPT_TYPES)]}


@router.get("/{prompt_type}")
def get_prompt(prompt_type: str, response: Response):
    response.headers["Cache-Control"] = "no-store"
    check_type(prompt_type)
    return common_prompt(prompt_type)


@router.put("/{prompt_type}")
def save_prompt(prompt_type: str, body: PromptRequest, response: Response):
    response.headers["Cache-Control"] = "no-store"
    check_type(prompt_type)
    text = body.prompt_text.strip()
    if not text:
        raise HTTPException(422, "共通指導方針を入力してください。")
    updated = datetime.now(timezone.utc).isoformat()
    database().collection("system_prompts").document(prompt_type).set({"prompt_text": text, "updated_at": updated})
    return {"prompt_type": prompt_type, "updated_at": updated}
