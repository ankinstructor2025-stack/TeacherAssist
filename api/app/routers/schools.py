from typing import Annotated

from fastapi import APIRouter, Depends

from ..auth import current_user
from ..services.schools import school_catalog

router = APIRouter()


@router.get("/api/schools")
def schools(user: Annotated[dict, Depends(current_user)], prefecture: str = "", city: str = ""):
    records = school_catalog()
    if not prefecture:
        return {"prefectures": list(dict.fromkeys(record["prefecture"] for record in records))}
    records = [record for record in records if record["prefecture"] == prefecture]
    if not city:
        return {"cities": sorted({record["city"] for record in records})}
    return {"schools": [record for record in records if record["city"] == city]}
