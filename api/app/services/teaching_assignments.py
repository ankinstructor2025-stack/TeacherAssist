from uuid import uuid4

from firebase_admin import firestore
from fastapi import HTTPException

from ..identity import normalize_email
from .instruction_materials import instruction_materials


@firestore.transactional
def save_assignment(transaction, reference, email, school_code, values, assignment_id=None):
    record = reference.get(transaction=transaction)
    data = record.to_dict() if record.exists else {}
    if (normalize_email(data.get("email", "")) != normalize_email(email)
            or data.get("profile", {}).get("school_code") != school_code):
        raise HTTPException(409, "利用登録または所属校が変更されました。再読み込みしてください。")
    assignments = dict(data.get("teaching_assignments", {}))
    if assignment_id and (assignment_id not in assignments or assignments[assignment_id].get("deleted") or assignments[assignment_id]["school_code"] != school_code):
        raise HTTPException(404, "担当科目が見つかりません。")
    if assignment_id and assignments[assignment_id].get("has_lesson_plans") and any(assignments[assignment_id][field] != values[field] for field in ("grade", "subject")):
        raise HTTPException(409, "指導案があるため学年・科目は変更できません。別の担当科目として新規登録してください。")
    if any(key != assignment_id and not item.get("deleted") and item["school_code"] == school_code
           and item["grade"] == values["grade"] and item["subject"] == values["subject"]
           for key, item in assignments.items()):
        raise HTTPException(409, "この学年・科目は登録済みです。")
    key = assignment_id or uuid4().hex
    assignments[key] = {**assignments.get(key, {}), **values, "school_code": school_code}
    transaction.update(reference, {"teaching_assignments": assignments})
    return {"id": key, **assignments[key]}


def assignment_rows(registration, textbooks):
    school_code = registration.get("profile", {}).get("school_code")
    rows = []
    for key, value in registration.get("teaching_assignments", {}).items():
        if value.get("deleted") or value["school_code"] != school_code:
            continue
        books = [book for book in textbooks if value["grade"] in book["grades"] and value["subject"] == book["subject"]]
        names = [" ／ ".join(filter(None, [book.get("title"), book["publisher"]])) for book in books]
        rows.append({"id": key, **value, "textbook": "、".join(names) or "採択情報未連携",
                     "instruction_materials": instruction_materials(books, value["grade"], value["subject"])})
    return sorted(rows, key=lambda row: (row["grade"], row["subject"]))


@firestore.transactional
def remove_assignment(transaction, reference, email, assignment_id):
    record = reference.get(transaction=transaction)
    data = record.to_dict() if record.exists else {}
    if normalize_email(data.get("email", "")) != normalize_email(email):
        raise HTTPException(403, "利用登録が変更されました。")
    assignments = dict(data.get("teaching_assignments", {}))
    item = assignments.get(assignment_id)
    if not item or item.get("deleted") or item["school_code"] != data.get("profile", {}).get("school_code"):
        raise HTTPException(404, "担当科目が見つかりません。")
    assignments[assignment_id] = {**item, "deleted": True}
    transaction.update(reference, {"teaching_assignments": assignments})
    return {"id": assignment_id, "status": "deleted"}
