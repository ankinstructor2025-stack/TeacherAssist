import json
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from .schools import school_catalog


def academic_year():
    today = datetime.now(timezone(timedelta(hours=9))).date()
    return today.year if today.month >= 4 else today.year - 1


@lru_cache(maxsize=1)
def adoption_catalog():
    path = Path(__file__).resolve().parents[1] / "data" / "textbook_adoptions.json"
    return json.loads(path.read_text(encoding="utf-8"))


def public_textbook_adoptions(school_code, school_year=None):
    # Resolve municipality from the school catalog, never from a query parameter
    # or an unverified city name. Do not apply city adoptions to prefectural schools.
    school = next((record for record in school_catalog() if record["code"] == school_code), None)
    if not school:
        return []
    year = academic_year() if school_year is None else school_year
    for district in adoption_catalog():
        if (school["prefecture"] == district["prefecture"]
                and school["city"] == district["city"]
                and school["name"].startswith(district["school_name_prefix"])
                and district["start_year"] <= year <= district["end_year"]):
            return [{**book, "school_year": year, "source_url": district["source_url"]}
                    for book in district["textbooks"]]
    return []
