from typing import Annotated

from firebase_admin import firestore
from fastapi import APIRouter, Depends, HTTPException, Response
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, Field

from ..auth import current_user
from ..firebase import database, user_collection
from ..identity import normalize_email
from ..services.schools import school_catalog

router = APIRouter()


def profile_document(user):
    records = list(user_collection().where(filter=FieldFilter("email", "==", normalize_email(user["email"]))).limit(1).stream())
    if not records:
        raise HTTPException(403, "利用登録されていません。管理者にお問い合わせください。")
    return records[0]


class ProfileRequest(BaseModel):
    school_code: str = Field(min_length=1, max_length=20)


@router.get("/api/profile")
def get_profile(response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    return {"profile": profile_document(user).to_dict().get("profile", {})}


@firestore.transactional
def store_profile(transaction, reference, email, profile):
    record = reference.get(transaction=transaction)
    if not record.exists or normalize_email(record.to_dict().get("email", "")) != normalize_email(email):
        raise HTTPException(403, "利用登録が変更されました。ログインし直してください。")
    transaction.update(reference, {"profile": profile})


@router.put("/api/profile")
def update_profile(body: ProfileRequest, response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    school = next((record for record in school_catalog() if record["code"] == body.school_code), None)
    if school is None:
        raise HTTPException(422, "一覧から公立小学校を選択してください。")
    profile = {"prefecture": school["prefecture"], "city": school["city"], "school_code": school["code"], "school_name": school["name"]}
    record = profile_document(user)
    store_profile(database().transaction(), record.reference, user["email"], profile)
    return {"profile": profile}
