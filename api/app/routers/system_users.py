from typing import Annotated

from firebase_admin import firestore
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from ..auth import administrator
from ..firebase import database, user_collection
from ..identity import email_key, normalize_email

router = APIRouter()


class UserRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    user_name: str = Field(min_length=1, max_length=100)


def user_data(body: UserRequest):
    email = normalize_email(body.email)
    name = body.user_name.strip()
    if email.count("@") != 1 or any(c.isspace() for c in email) or not all(email.split("@")):
        raise HTTPException(422, "正しいメールアドレスを入力してください。")
    if not name:
        raise HTTPException(422, "氏名を入力してください。")
    return {"email": email, "user_name": name}


@router.get("/api/system/users")
def users(response: Response, user: Annotated[dict, Depends(administrator)]):
    response.headers["Cache-Control"] = "no-store"
    records = [{"id": doc.id, **doc.to_dict()} for doc in user_collection().stream()]
    return {"users": sorted(records, key=lambda record: record.get("user_name", ""))}


@firestore.transactional
def save_user(transaction, collection, data, user_id=None):
    # メールごとの一意な文書IDで、同時登録時も重複を防ぐ。
    target = collection.document(email_key(data["email"]))
    old = collection.document(user_id) if user_id else None
    previous = old.get(transaction=transaction) if old else None
    if previous is not None and not previous.exists:
        raise HTTPException(404, "ユーザーが見つかりません。")
    existing = target.get(transaction=transaction)
    if existing.exists and (not old or old.id != target.id):
        raise HTTPException(409, "このメールアドレスは登録済みです。")
    if old and old.id != target.id:
        transaction.delete(old)
    stored = {**(previous.to_dict() if previous is not None else {}), **data}
    transaction.set(target, stored)
    return {"id": target.id, **data}


@router.post("/api/system/users", status_code=201)
def create_user(body: UserRequest, response: Response, user: Annotated[dict, Depends(administrator)]):
    response.headers["Cache-Control"] = "no-store"
    collection = user_collection()
    return save_user(database().transaction(), collection, user_data(body))


@router.put("/api/system/users/{user_id}")
def update_user(user_id: str, body: UserRequest, response: Response, user: Annotated[dict, Depends(administrator)]):
    response.headers["Cache-Control"] = "no-store"
    collection = user_collection()
    return save_user(database().transaction(), collection, user_data(body), user_id)


@router.delete("/api/system/users/{user_id}")
def delete_user(user_id: str, response: Response, user: Annotated[dict, Depends(administrator)]):
    response.headers["Cache-Control"] = "no-store"
    reference = user_collection().document(user_id)
    if not reference.get().exists:
        raise HTTPException(404, "ユーザーが見つかりません。")
    reference.delete()
    return {"id": user_id, "status": "deleted"}
