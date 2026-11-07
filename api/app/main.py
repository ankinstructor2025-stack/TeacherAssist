import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import firebase_admin
from firebase_admin import auth
from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles

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
    return claims


@app.post("/api/session")
def session(response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    return {"uid": user["uid"], "email": user.get("email", ""), "name": user.get("name", "")}


app.mount("/", StaticFiles(directory=Path(__file__).resolve().parents[2] / "ui", html=True), name="ui")
