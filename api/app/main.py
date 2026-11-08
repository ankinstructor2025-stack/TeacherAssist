from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .firebase import lifespan
from .routers import profile, schools, session, system_users, teaching_subjects, teaching_assignments, lesson_plans, system_models, profile_ai

app = FastAPI(title="TeacherAssist API", lifespan=lifespan)
for routes in (session, system_users, schools, profile, teaching_subjects, teaching_assignments, lesson_plans, system_models, profile_ai):
    app.include_router(routes.router)

app.mount("/", StaticFiles(directory=Path(__file__).resolve().parents[2] / "ui", html=True), name="ui")
