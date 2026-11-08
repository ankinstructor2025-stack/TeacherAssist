from typing import Annotated

from fastapi import APIRouter, Depends, Response, HTTPException
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, Field

from ..auth import current_user
from ..firebase import database
from ..services.lesson_plans import active_assignment, store_plan
from ..services.textbook_contents import textbook_contents
from .profile import profile_document
from .teaching_subjects import teaching_subjects
from ..services.teaching_assignments import assignment_rows

router = APIRouter(prefix="/api/teaching-assignments/{assignment_id}/lesson-plans")


class LessonPlanRequest(BaseModel):
    grade: int = Field(ge=1, le=6)
    subject: str = Field(min_length=1, max_length=20)
    title: str = Field(min_length=1, max_length=150)
    unit: str = Field(min_length=1, max_length=200)
    hours: int = Field(ge=1, le=100, default=1)
    objectives: str = Field(max_length=10000, default="")
    activities: str = Field(max_length=20000, default="")
    assessment: str = Field(max_length=10000, default="")
    notes: str = Field(max_length=10000, default="")


def plan_collection(user):
    return database().collection("user_lesson_plans").document(user["uid"]).collection("plans")


@router.get("")
def lesson_plans(assignment_id: str, response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    registration = profile_document(user).to_dict()
    assignment = active_assignment(registration, assignment_id)
    adoption = teaching_subjects(response, user)
    if adoption["profile"].get("school_code") != assignment["school_code"]:
        raise HTTPException(409, "所属校が変更されました。再読み込みしてください。")
    resolved = next(row for row in assignment_rows(registration, adoption["textbooks"]) if row["id"] == assignment_id)
    plans = [{**doc.to_dict(), "id": doc.id} for doc in plan_collection(user).where(filter=FieldFilter("assignment_id", "==", assignment_id)).stream()]
    plans = [plan for plan in plans if not plan.get("deleted") and plan.get("school_code") == assignment["school_code"]]
    return {"profile": adoption["profile"], "assignment": resolved, "plans": sorted(plans, key=lambda plan: plan.get("updated_at", ""), reverse=True),
            "contents": textbook_contents(assignment, adoption["textbooks"])}


def persist(assignment_id, response, user, body=None, plan_id=None, deleting=False):
    response.headers["Cache-Control"] = "no-store"
    record = profile_document(user)
    school_code = record.to_dict().get("profile", {}).get("school_code")
    values = body.model_dump() if body else {}
    if body:
        values["title"] = body.title.strip()
        values["unit"] = body.unit.strip()
        if not values["title"] or not values["unit"]:
            raise HTTPException(422, "指導案名と単元を入力してください。")
    return store_plan(database().transaction(), record.reference, plan_collection(user), user["email"], assignment_id, school_code, values, plan_id, deleting)


@router.post("", status_code=201)
def create_plan(assignment_id: str, body: LessonPlanRequest, response: Response, user: Annotated[dict, Depends(current_user)]):
    return persist(assignment_id, response, user, body)


@router.put("/{plan_id}")
def update_plan(assignment_id: str, plan_id: str, body: LessonPlanRequest, response: Response, user: Annotated[dict, Depends(current_user)]):
    return persist(assignment_id, response, user, body, plan_id)


@router.delete("/{plan_id}")
def delete_plan(assignment_id: str, plan_id: str, response: Response, user: Annotated[dict, Depends(current_user)]):
    return persist(assignment_id, response, user, plan_id=plan_id, deleting=True)
