import os
from contextlib import asynccontextmanager

import firebase_admin
from firebase_admin import firestore
from fastapi import FastAPI

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


def database():
    return firestore.client(app=firebase_admin.get_app(APP_NAME), database_id=os.environ.get("FIRESTORE_DATABASE_ID", "teacher-assist"))


def user_collection():
    return database().collection("users")
