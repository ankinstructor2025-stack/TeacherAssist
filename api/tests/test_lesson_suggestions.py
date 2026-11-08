import json
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.services.lesson_suggestions import suggest_lesson


class LessonSuggestionTests(unittest.TestCase):
    def setUp(self):
        self.prompt_patch = patch("app.services.prompts.user_prompt", return_value={"common_prompt_text": "共通方針", "prompt_text": "追加方針"})
        self.prompt_patch.start()
        self.client = TestClient(app)
        self.user = {"uid": "teacher", "email": "teacher@example.com"}
        app.dependency_overrides[current_user] = lambda: self.user
        self.context = {"grade": 5, "subject": "算数", "unit": "整数と小数", "hours": 1}
        self.result = {"title": "整数と小数", "objectives": "目標", "activities": "導入・展開・まとめ", "student_questions": "児童：なぜですか？ 教師：比べてみよう。", "assessment": "評価", "notes": "準備"}

    def tearDown(self):
        self.prompt_patch.stop()
        app.dependency_overrides.clear()

    def test_route_uses_own_assignment_and_only_sends_teaching_context(self):
        registration = {"profile": {"school_code": "school"}, "teaching_assignments": {"one": {"school_code": "school", "grade": 5, "subject": "算数"}}}
        adoption = {"profile": registration["profile"], "textbooks": [{"grades": [5], "subject": "算数", "publisher": "東京書籍"}]}
        with patch("app.routers.lesson_plans.profile_document", return_value=Mock(to_dict=lambda: registration)), patch("app.routers.lesson_plans.teaching_subjects", return_value=adoption), patch("app.routers.lesson_plans.suggest_lesson", return_value={"suggestion": self.result}) as generate:
            response = self.client.post("/api/teaching-assignments/one/lesson-plans/suggest", json=self.context)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(generate.call_args.args, ("teacher", {**self.context, "publishers": ["東京書籍"]}))
            self.assertEqual(self.client.post("/api/teaching-assignments/other/lesson-plans/suggest", json=self.context).status_code, 404)
            self.assertEqual(generate.call_count, 1)

    def test_route_requires_authentication_and_valid_hours(self):
        path = "/api/teaching-assignments/one/lesson-plans/suggest"
        self.assertEqual(self.client.post(path, json={**self.context, "hours": 0}).status_code, 422)
        app.dependency_overrides.clear()
        self.assertEqual(self.client.post(path, json=self.context).status_code, 401)

    def test_suggestion_uses_saved_model_and_does_not_save_draft(self):
        model = {"provider": "gemini", "model_name": "example", "enabled": True}
        saved = {**model, "model_id": "model", "api_key_encrypted": "encrypted"}
        db = Mock()
        db.collection.return_value.document.return_value.get.side_effect = [Mock(exists=True, to_dict=lambda: saved), Mock(exists=True, to_dict=lambda: model)]
        with patch("app.services.lesson_suggestions.database", return_value=db), patch("app.services.lesson_suggestions.decrypt_key", return_value="test-only-key"), patch("app.services.lesson_suggestions.generate_text", return_value=json.dumps(self.result, ensure_ascii=False)) as generate:
            result = suggest_lesson("teacher", self.context)
            self.assertEqual(result["suggestion"], self.result)
            self.assertEqual(generate.call_args.args[:3], ("gemini", "example", "test-only-key"))
            self.assertNotIn("test-only-key", generate.call_args.args[3])
            db.transaction.assert_not_called()

    def test_missing_settings_and_invalid_ai_output_fail_without_draft(self):
        with patch("app.services.lesson_suggestions.database") as db:
            db.return_value.collection.return_value.document.return_value.get.return_value = Mock(exists=False)
            with self.assertRaises(HTTPException) as error:
                suggest_lesson("teacher", self.context)
            self.assertEqual(error.exception.status_code, 422)
        model = {"provider": "gemini", "model_name": "example", "enabled": True}
        with patch("app.services.lesson_suggestions.database") as db, patch("app.services.lesson_suggestions.decrypt_key", return_value="test-only"), patch("app.services.lesson_suggestions.generate_text", return_value="invalid sensitive upstream response"):
            db.return_value.collection.return_value.document.return_value.get.side_effect = [Mock(exists=True, to_dict=lambda: {**model, "model_id": "model", "api_key_encrypted": "enc"}), Mock(exists=True, to_dict=lambda: model)]
            with self.assertRaises(HTTPException) as error:
                suggest_lesson("teacher", self.context)
            self.assertEqual(error.exception.status_code, 502)
            self.assertNotIn("sensitive", error.exception.detail)
