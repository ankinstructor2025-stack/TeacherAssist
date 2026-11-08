import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.services.instruction_materials import instruction_materials


class InstructionMaterialTests(unittest.TestCase):
    def setUp(self):
        self.books = [{"grades": [1, 2, 3, 4, 5, 6], "subject": "算数", "publisher": "東京書籍"},
                      {"grades": [1, 2, 3, 4, 5, 6], "subject": "国語", "publisher": "光村図書"}]

    def test_materials_match_grade_subject_publisher_and_edition(self):
        for grade in range(1, 7):
            math = instruction_materials(self.books, grade, "算数", 2026)
            self.assertEqual(len(math), 1)
            self.assertTrue(math[0]["url"].endswith(f"sansu_keikaku_saian_{grade}.pdf"))
            self.assertEqual(len(instruction_materials(self.books, grade, "国語", 2026)), 1)
        self.assertEqual(instruction_materials(self.books, 5, "算数", 2028), [])
        self.assertEqual(instruction_materials([{**self.books[0], "publisher": "別の出版社"}], 5, "算数", 2026), [])
        self.assertEqual(instruction_materials(self.books, 5, "理科", 2026), [])

    def test_no_link_without_confirmed_school_adoption(self):
        self.assertEqual(instruction_materials([], 5, "算数", 2026), [])
        self.assertEqual(instruction_materials([{**self.books[0], "grades": [6]}], 5, "算数", 2026), [])

    def test_existing_assignments_receive_links_without_resaving(self):
        app.dependency_overrides[current_user] = lambda: {"email": "teacher@example.com"}
        registration = {"profile": {"school_code": "school"}, "teaching_assignments": {
            "one": {"school_code": "school", "grade": 5, "subject": "算数"}}}
        try:
            with patch("app.routers.teaching_assignments.profile_document", return_value=Mock(to_dict=lambda: registration)), patch("app.routers.teaching_assignments.teaching_subjects", return_value={"profile": registration["profile"], "textbooks": self.books}), patch("app.services.instruction_materials.academic_year", return_value=2026):
                response = TestClient(app).get("/api/teaching-assignments")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(len(response.json()["instruction_materials"]), 12)
                material = response.json()["assignments"][0]["instruction_materials"][0]
                self.assertEqual(material["grade"], 5)
                self.assertEqual(material["publisher"], "東京書籍")
        finally:
            app.dependency_overrides.clear()
