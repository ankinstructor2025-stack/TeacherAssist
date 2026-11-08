import json
from functools import lru_cache
from pathlib import Path

from .textbook_adoptions import academic_year


@lru_cache(maxsize=1)
def materials_catalog():
    path = Path(__file__).resolve().parents[1] / "data" / "instruction_materials.json"
    return json.loads(path.read_text(encoding="utf-8"))


def instruction_materials(textbooks, grade=None, subject=None, school_year=None):
    year = academic_year() if school_year is None else school_year
    return [dict(item) for item in materials_catalog()
            if (grade is None or item["grade"] == grade)
            and (subject is None or item["subject"] == subject)
            and item["start_year"] <= year <= item["end_year"]
            and any(book["publisher"] == item["publisher"] and book["subject"] == item["subject"]
                    and item["grade"] in book["grades"] for book in textbooks)]
