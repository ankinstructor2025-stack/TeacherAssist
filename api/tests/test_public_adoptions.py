import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.services.schools import school_catalog
from app.services.textbook_adoptions import public_textbook_adoptions


class PublicAdoptionTests(unittest.TestCase):
    def setUp(self):
        self.school = next(s for s in school_catalog() if s["name"] == "小山市立小山城東小学校")

    def test_oyama_publishers_and_grade_applicability(self):
        books = public_textbook_adoptions(self.school["code"], 2026)
        self.assertEqual(len(books), 13)
        by_subject = {b["subject"]: b for b in books}
        self.assertEqual(by_subject["国語"]["publisher"], "光村図書")
        self.assertEqual(by_subject["算数"]["publisher"], "東京書籍")
        self.assertEqual(by_subject["理科"]["publisher"], "啓林館")
        self.assertEqual(by_subject["英語"]["grades"], [5, 6])
        self.assertEqual(by_subject["生活"]["grades"], [1, 2])
        self.assertTrue(all(b["school_year"] == 2026 for b in books))
        self.assertTrue(all(b["source_url"].startswith("https://www.pref.tochigi.lg.jp/") for b in books))

    def test_only_applies_during_verified_adoption_period(self):
        for year in [2024, 2027]:
            self.assertEqual(len(public_textbook_adoptions(self.school["code"], year)), 13)
        for year in [2023, 2028]:
            self.assertEqual(public_textbook_adoptions(self.school["code"], year), [])

    def test_other_municipality_and_unknown_school_are_not_matched(self):
        other = next(s for s in school_catalog() if s["prefecture"] == "栃木県" and s["city"] != "小山市")
        self.assertEqual(public_textbook_adoptions(other["code"], 2026), [])
        self.assertEqual(public_textbook_adoptions("unknown", 2026), [])

    def test_api_uses_saved_school_code_without_extra_firestore_setup(self):
        app.dependency_overrides[current_user] = lambda: {"email": "teacher@example.com"}
        try:
            profile = {"school_code": self.school["code"], "city": "無視される地名"}
            with patch("app.routers.teaching_subjects.profile_document", return_value=Mock(to_dict=lambda: {"profile": profile})), patch("app.routers.teaching_subjects.database") as db, patch("app.services.textbook_adoptions.academic_year", return_value=2026):
                response = TestClient(app).get("/api/teaching-subjects")
                self.assertEqual(response.status_code, 200)
                self.assertTrue(response.json()["covered"])
                self.assertEqual(len(response.json()["textbooks"]), 13)
                db.assert_not_called()
        finally:
            app.dependency_overrides.clear()
