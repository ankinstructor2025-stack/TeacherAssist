from typing import Annotated

from fastapi import APIRouter, Depends, Response

from ..auth import current_user, is_system_administrator

router = APIRouter()


@router.post("/api/session")
def session(response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    return {"uid": user["uid"], "email": user.get("email", ""), "name": user.get("name", ""), "is_system_administrator": is_system_administrator(user)}
