import json
from functools import lru_cache
from pathlib import Path

from .textbook_adoptions import academic_year


@lru_cache(maxsize=1)
def contents_catalog():
    return json.loads((Path(__file__).resolve().parents[1] / "data" / "textbook_contents.json").read_text(encoding="utf-8"))


def textbook_contents(assignment, textbooks):
    publishers = {book["publisher"] for book in textbooks if assignment["grade"] in book["grades"] and assignment["subject"] == book["subject"]}
    year = academic_year()
    return [book for book in contents_catalog() if book["grade"] == assignment["grade"]
            and book["subject"] == assignment["subject"] and book["publisher"] in publishers
            and book["start_year"] <= year <= book["end_year"]]
