from typing import Annotated

from fastapi import APIRouter, Depends, Response

from ..auth import current_user
from ..firebase import database
from ..services.textbook_adoptions import public_textbook_adoptions
from .profile import profile_document

router = APIRouter()


@router.get("/api/teaching-subjects")
def teaching_subjects(response: Response, user: Annotated[dict, Depends(current_user)]):
    response.headers["Cache-Control"] = "no-store"
    profile = profile_document(user).to_dict().get("profile", {})
    school_code = profile.get("school_code")
    textbooks = public_textbook_adoptions(school_code)
    if textbooks:
        return {"profile": profile, "covered": True, "textbooks": textbooks}
    # School identity always comes from the authenticated user's saved profile.
    # Verified public adoption records are shared by all members of the school.
    adoption = database().collection("school_textbook_adoptions").document(school_code).get() if school_code else None
    data = adoption.to_dict() if adoption is not None and adoption.exists else {}
    return {"profile": profile, "covered": bool(data.get("textbooks")), "textbooks": data.get("textbooks", [])}
