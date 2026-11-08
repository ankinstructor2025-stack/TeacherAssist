from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, Field

from ..auth import current_user
from ..firebase import database
from ..services.homework import HomeworkContent, generate_homework, store_homework
from ..services.lesson_plans import active_assignment
from ..services.teaching_assignments import assignment_rows
from ..services.textbook_contents import textbook_contents
from .profile import profile_document
from .teaching_subjects import teaching_subjects

router = APIRouter(prefix="/api/teaching-assignments/{assignment_id}/homework")


class HomeworkRequest(HomeworkContent):
    grade: int = Field(ge=1, le=6)
    subject: str = Field(min_length=1, max_length=20)
    unit: str = Field(min_length=1, max_length=200)
    minutes: int = Field(ge=5, le=60)


class GenerateRequest(BaseModel):
    grade: int = Field(ge=1, le=6)
    subject: str = Field(min_length=1, max_length=20)
    unit: str = Field(min_length=1, max_length=200)
    minutes: int = Field(ge=5, le=60, default=15)


def homework_collection(user):
    return database().collection("user_homework").document(user["uid"]).collection("items")


@router.get("")
def list_homework(assignment_id: str, response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    registration = profile_document(user).to_dict()
    assignment = active_assignment(registration, assignment_id)
    adoption = teaching_subjects(response, user)
    if adoption["profile"].get("school_code") != assignment["school_code"]:
        raise HTTPException(409, "所属校が変更されました。再読み込みしてください。")
    resolved = next(row for row in assignment_rows(registration, adoption["textbooks"]) if row["id"] == assignment_id)
    items = [{**doc.to_dict(), "id": doc.id} for doc in homework_collection(user).where(filter=FieldFilter("assignment_id", "==", assignment_id)).stream()]
    items = [item for item in items if not item.get("deleted") and item.get("school_code") == assignment["school_code"]]
    return {"profile": adoption["profile"], "assignment": resolved, "homework": sorted(items, key=lambda item: item.get("updated_at", ""), reverse=True),
            "contents": textbook_contents(assignment, adoption["textbooks"])}


@router.post("/suggest")
def suggest(assignment_id: str, body: GenerateRequest, response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    registration = profile_document(user).to_dict()
    assignment = active_assignment(registration, assignment_id)
    if body.grade != assignment["grade"] or body.subject != assignment["subject"]:
        raise HTTPException(409, "担当科目が変更されました。再読み込みしてください。")
    if not body.unit.strip():
        raise HTTPException(422, "単元を選択してください。")
    adoption = teaching_subjects(response, user)
    if adoption["profile"].get("school_code") != assignment["school_code"]:
        raise HTTPException(409, "所属校が変更されました。再読み込みしてください。")
    publishers = [book["publisher"] for book in adoption["textbooks"] if assignment["grade"] in book["grades"] and assignment["subject"] == book["subject"]]
    return generate_homework(user["uid"], {"grade": assignment["grade"], "subject": assignment["subject"], "unit": body.unit.strip(), "minutes_per_level": body.minutes, "publishers": publishers})


def persist(assignment_id, response, user, body=None, homework_id=None, deleting=False):
    response.headers["Cache-Control"] = "no-store"
    registration = profile_document(user)
    values = body.model_dump() if body else {}
    if body:
        for field, value in values.items():
            if isinstance(value, str):
                values[field] = value.strip()
                if not values[field]:
                    raise HTTPException(422, "宿題名・単元・各段階の問題と解答を入力してください。")
    return store_homework(database().transaction(), registration.reference, homework_collection(user), user["email"], assignment_id,
                          registration.to_dict().get("profile", {}).get("school_code"), values, homework_id, deleting)


@router.post("", status_code=201)
def create(assignment_id: str, body: HomeworkRequest, response: Response, user: Annotated[dict, Depends(current_user)]):
    return persist(assignment_id, response, user, body)


@router.put("/{homework_id}")
def update(assignment_id: str, homework_id: str, body: HomeworkRequest, response: Response, user: Annotated[dict, Depends(current_user)]):
    return persist(assignment_id, response, user, body, homework_id)


@router.delete("/{homework_id}")
def delete(assignment_id: str, homework_id: str, response: Response, user: Annotated[dict, Depends(current_user)]):
    return persist(assignment_id, response, user, homework_id=homework_id, deleting=True)
