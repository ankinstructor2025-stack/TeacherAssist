import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.services.student_question_sources import question_sources, resolve_source_ids


class StudentQuestionSourceTests(unittest.TestCase):
    def test_sources_match_grade_subject_and_unit_not_book_title(self):
        matched = question_sources(5, "算数", "新しい算数 ／ 分数のたし算とひき算")
        self.assertEqual([item["id"] for item in matched], ["minamiaizu-202603-lesson-v1", "nier-2025-fraction-v1"])
        self.assertEqual(len(question_sources(2, "算数", "小数")), 1)
        self.assertEqual(len(question_sources(5, "国語", "小数")), 1)
        self.assertEqual(len(question_sources(5, "算数", "小数の本 ／ 合同な図形")), 1)
        self.assertEqual(len(question_sources(4, "理科", "ものの温度と体積")), 2)

    def test_unreviewed_ids_and_urls_are_not_accepted(self):
        with self.assertRaises(HTTPException):
            resolve_source_ids(["https://example.org/unreviewed"])
        source = resolve_source_ids(["nier-2025-decimal-v1"])[0]
        self.assertIn("summary", source)
        self.assertNotIn("keywords", source)

    def test_save_resolves_reviewed_metadata_on_server(self):
        user = {"uid": "teacher", "email": "teacher@example.com"}
        app.dependency_overrides[current_user] = lambda: user
        try:
            body = {"grade": 5, "subject": "算数", "title": "指導案", "unit": "整数と小数", "question_source_ids": ["nier-2025-decimal-v1"]}
            with patch("app.routers.lesson_plans.profile_document", return_value=Mock(to_dict=lambda: {"profile": {"school_code": "school"}})), patch("app.routers.lesson_plans.database"), patch("app.routers.lesson_plans.store_plan", return_value={}) as store:
                response = TestClient(app).post("/api/teaching-assignments/one/lesson-plans", json=body)
                self.assertEqual(response.status_code, 201)
                saved = store.call_args.args[6]
                self.assertEqual(saved["question_sources"][0]["id"], "nier-2025-decimal-v1")
                self.assertNotIn("question_source_ids", saved)
        finally:
            app.dependency_overrides.clear()
