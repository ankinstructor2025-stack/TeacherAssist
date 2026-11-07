import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def school_catalog():
    path = Path(__file__).resolve().parents[1] / "data" / "public_elementary_schools.json"
    return json.loads(path.read_text(encoding="utf-8-sig"))
