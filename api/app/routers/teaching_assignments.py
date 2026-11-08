from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from ..auth import current_user
from ..firebase import database
from ..services.teaching_assignments import assignment_rows, save_assignment, remove_assignment
from ..services.instruction_materials import instruction_materials
from .profile import profile_document
from .teaching_subjects import teaching_subjects

router = APIRouter()


class AssignmentRequest(BaseModel):
    grade: int = Field(ge=1, le=6)
    subject: str = Field(min_length=1, max_length=20)


@router.get("/api/teaching-assignments")
def assignments(response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    registration = profile_document(user).to_dict()
    adoption = teaching_subjects(response, user)
    return {**adoption, "assignments": assignment_rows(registration, adoption["textbooks"]),
            "instruction_materials": instruction_materials(adoption["textbooks"])}


def persist(body, response, user, assignment_id=None):
    response.headers["Cache-Control"] = "no-store"
    adoption = teaching_subjects(response, user)
    school_code = adoption["profile"].get("school_code")
    if not school_code:
        raise HTTPException(422, "プロフィールで学校を登録してください。")
    if not any(body.grade in book["grades"] and body.subject == book["subject"] for book in adoption["textbooks"]):
        raise HTTPException(422, "この学年・科目の採択教科書が確認できません。")
    record = profile_document(user)
    return save_assignment(database().transaction(), record.reference, user["email"], school_code,
                           {"grade": body.grade, "subject": body.subject}, assignment_id)


@router.post("/api/teaching-assignments", status_code=201)
def create_assignment(body: AssignmentRequest, response: Response, user: Annotated[dict, Depends(current_user)]):
    return persist(body, response, user)


@router.put("/api/teaching-assignments/{assignment_id}")
def update_assignment(assignment_id: str, body: AssignmentRequest, response: Response, user: Annotated[dict, Depends(current_user)]):
    return persist(body, response, user, assignment_id)


@router.delete("/api/teaching-assignments/{assignment_id}")
def delete_assignment(assignment_id: str, response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    record = profile_document(user)
    return remove_assignment(database().transaction(), record.reference, user["email"], assignment_id)
