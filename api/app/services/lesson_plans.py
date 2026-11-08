from datetime import datetime, timezone
from uuid import uuid4

from firebase_admin import firestore
from fastapi import HTTPException

from ..identity import normalize_email


def active_assignment(registration, assignment_id):
    item = registration.get("teaching_assignments", {}).get(assignment_id)
    if not item or item.get("deleted") or item["school_code"] != registration.get("profile", {}).get("school_code"):
        raise HTTPException(404, "担当科目が見つかりません。")
    return item


@firestore.transactional
def store_plan(transaction, registration_ref, plans, email, assignment_id, school_code, values, plan_id=None, deleting=False):
    registration = registration_ref.get(transaction=transaction)
    data = registration.to_dict() if registration.exists else {}
    if normalize_email(data.get("email", "")) != normalize_email(email):
        raise HTTPException(403, "利用登録が変更されました。")
    assignment = active_assignment(data, assignment_id)
    if assignment["school_code"] != school_code:
        raise HTTPException(409, "所属校が変更されました。再読み込みしてください。")
    if not deleting and any(values[field] != assignment[field] for field in ("grade", "subject")):
        raise HTTPException(409, "担当科目が変更されました。再読み込みしてください。")
    key = plan_id or uuid4().hex
    target = plans.document(key)
    previous = target.get(transaction=transaction) if plan_id else None
    old = previous.to_dict() if previous is not None and previous.exists else {}
    if plan_id and (not old or old.get("deleted") or old.get("assignment_id") != assignment_id or old.get("school_code") != school_code):
        raise HTTPException(404, "指導案が見つかりません。")
    now = datetime.now(timezone.utc).isoformat()
    stored = {**old, **values, "assignment_id": assignment_id, "school_code": school_code,
              "created_at": old.get("created_at") if plan_id else now,
              "updated_at": now, "deleted": deleting}
    transaction.set(target, stored)
    assignments = dict(data["teaching_assignments"])
    assignments[assignment_id] = {**assignment, "has_lesson_plans": True}
    transaction.update(registration_ref, {"teaching_assignments": assignments})
    return {"id": key, **stored}
