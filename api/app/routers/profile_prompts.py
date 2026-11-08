from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field

from ..auth import current_user
from ..services.prompts import check_type, user_prompt, user_prompt_reference
from .profile import profile_document

router = APIRouter(prefix="/api/profile/prompts")


class CustomPromptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt_text: str = Field(default="", max_length=4000)


@router.get("/{prompt_type}")
def get_prompt(prompt_type: str, response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    check_type(prompt_type)
    profile = profile_document(user).to_dict().get("profile", {})
    return {"profile": profile, **user_prompt(user["uid"])}


@router.put("/{prompt_type}")
def save_prompt(prompt_type: str, body: CustomPromptRequest, response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    check_type(prompt_type)
    profile_document(user)
    text = body.prompt_text.strip()
    user_prompt_reference(user["uid"]).set({"prompt_text": text, "updated_at": datetime.now(timezone.utc).isoformat()})
    return {"prompt_text": text, "use_common": not bool(text)}
