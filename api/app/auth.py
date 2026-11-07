import os
from typing import Annotated

import firebase_admin
from firebase_admin import auth
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.cloud.firestore_v1.base_query import FieldFilter

from .firebase import APP_NAME, user_collection
from .identity import normalize_email

bearer = HTTPBearer(auto_error=False)


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
