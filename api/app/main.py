import os
import hashlib
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import firebase_admin
from firebase_admin import auth, firestore
from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from google.cloud.firestore_v1.base_query import FieldFilter

APP_NAME = "teacherassist-auth"


@asynccontextmanager
async def lifespan(app: FastAPI):
    project_id = os.environ.get("FIREBASE_AUTH_PROJECT_ID", "").strip()
    if not project_id or project_id == "your-teacherassist-project-id":
        raise RuntimeError("FIREBASE_AUTH_PROJECT_ID にTeacherAssist専用プロジェクトIDを設定してください。")
    firebase_app = firebase_admin.initialize_app(options={"projectId": project_id}, name=APP_NAME)
    try:
        yield
    finally:
        firebase_admin.delete_app(firebase_app)


app = FastAPI(title="TeacherAssist API", lifespan=lifespan)
bearer = HTTPBearer(auto_error=False)


def database():
    return firestore.client(app=firebase_admin.get_app(APP_NAME), database_id=os.environ.get("FIRESTORE_DATABASE_ID", "teacher-assist"))


def user_collection():
    return database().collection("users")


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def email_key(email: str) -> str:
    return hashlib.sha256(normalize_email(email).encode("utf-8")).hexdigest()


def is_system_administrator(user: dict) -> bool:
    email = normalize_email(os.environ.get("system_administrator", ""))
    return bool(email and user.get("email_verified") and normalize_email(user.get("email", "")) == email)


def verify_token(token: str) -> dict:
    return auth.verify_id_token(token, app=firebase_admin.get_app(APP_NAME), check_revoked=True)


def current_user(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> dict:
    unauthorized = HTTPException(401, "認証情報を確認できませんでした。", headers={"WWW-Authenticate": "Bearer"})
    if credentials is None:
        raise unauthorized
    try:
        claims = verify_token(credentials.credentials)
    except (auth.InvalidIdTokenError, auth.ExpiredIdTokenError, auth.RevokedIdTokenError, auth.UserDisabledError, ValueError) as error:
        raise unauthorized from error
    if claims.get("firebase", {}).get("sign_in_provider") != "google.com":
        raise HTTPException(403, "Googleアカウントでログインしてください。")
    if not claims.get("email_verified") or not claims.get("email"):
        raise HTTPException(403, "確認済みのメールアドレスが必要です。")
    if not is_system_administrator(claims):
        records = list(user_collection().where(filter=FieldFilter("email", "==", normalize_email(claims["email"]))).limit(1).stream())
        if not records:
            raise HTTPException(403, "利用登録されていません。管理者にお問い合わせください。")
        claims = {**claims, "name": records[0].to_dict().get("user_name", "")}
    return claims


def administrator(user: Annotated[dict, Depends(current_user)]):
    if not is_system_administrator(user):
        raise HTTPException(403, "システム管理者権限がありません。")
    return user


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


@app.get("/api/system/users")
def users(response: Response, user: Annotated[dict, Depends(administrator)]):
    response.headers["Cache-Control"] = "no-store"
    records = [{"id": doc.id, **doc.to_dict()} for doc in user_collection().stream()]
    return {"users": sorted(records, key=lambda record: record.get("user_name", ""))}


@firestore.transactional
def save_user(transaction, collection, data, user_id=None):
    # メールごとの一意な文書IDで、同時登録時も重複を防ぐ。
    target = collection.document(email_key(data["email"]))
    old = collection.document(user_id) if user_id else None
    if old and not old.get(transaction=transaction).exists:
        raise HTTPException(404, "ユーザーが見つかりません。")
    existing = target.get(transaction=transaction)
    if existing.exists and (not old or old.id != target.id):
        raise HTTPException(409, "このメールアドレスは登録済みです。")
    if old and old.id != target.id:
        transaction.delete(old)
    transaction.set(target, data)
    return {"id": target.id, **data}


@app.post("/api/system/users", status_code=201)
def create_user(body: UserRequest, response: Response, user: Annotated[dict, Depends(administrator)]):
    response.headers["Cache-Control"] = "no-store"
    collection = user_collection()
    return save_user(database().transaction(), collection, user_data(body))


@app.put("/api/system/users/{user_id}")
def update_user(user_id: str, body: UserRequest, response: Response, user: Annotated[dict, Depends(administrator)]):
    response.headers["Cache-Control"] = "no-store"
    collection = user_collection()
    return save_user(database().transaction(), collection, user_data(body), user_id)


@app.delete("/api/system/users/{user_id}")
def delete_user(user_id: str, response: Response, user: Annotated[dict, Depends(administrator)]):
    response.headers["Cache-Control"] = "no-store"
    reference = user_collection().document(user_id)
    if not reference.get().exists:
        raise HTTPException(404, "ユーザーが見つかりません。")
    reference.delete()
    return {"id": user_id, "status": "deleted"}


@app.post("/api/session")
def session(response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    return {"uid": user["uid"], "email": user.get("email", ""), "name": user.get("name", ""), "is_system_administrator": is_system_administrator(user)}


app.mount("/", StaticFiles(directory=Path(__file__).resolve().parents[2] / "ui", html=True), name="ui")
