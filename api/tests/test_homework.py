import json
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.services.homework import CONTENT_FIELDS, HOMEWORK_SCHEMA, generate_homework, store_homework


class HomeworkTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.user = {"uid": "teacher", "email": "teacher@example.com"}
        app.dependency_overrides[current_user] = lambda: self.user
        self.registration = {"email": self.user["email"], "profile": {"school_code": "school"}, "teaching_assignments": {"one": {"grade": 5, "subject": "算数", "school_code": "school"}}}
        self.adoption = {"profile": self.registration["profile"], "textbooks": [{"grades": [5], "subject": "算数", "publisher": "東京書籍"}]}
        self.content = {"title": "整数と小数", **{key: f"内容：{key}" for key in CONTENT_FIELDS}}
        self.body = {**self.content, "grade": 5, "subject": "算数", "unit": "整数と小数", "minutes": 15}

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_generate_scopes_assignment_and_passes_three_level_context(self):
        with patch("app.routers.homework.profile_document", return_value=Mock(to_dict=lambda: self.registration)), patch("app.routers.homework.teaching_subjects", return_value=self.adoption), patch("app.routers.homework.generate_homework", return_value={"suggestion": self.content}) as generate:
            response = self.client.post("/api/teaching-assignments/one/homework/suggest", json={"grade": 5, "subject": "算数", "unit": "整数と小数", "minutes": 15})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(generate.call_args.args, ("teacher", {"grade": 5, "subject": "算数", "unit": "整数と小数", "minutes_per_level": 15, "publishers": ["東京書籍"]}))
            self.assertEqual(self.client.post("/api/teaching-assignments/unknown/homework/suggest", json=self.body).status_code, 404)
            self.assertEqual(generate.call_count, 1)

    def test_save_all_levels_and_reject_empty_answers(self):
        with patch("app.routers.homework.profile_document", return_value=Mock(to_dict=lambda: self.registration)), patch("app.routers.homework.database"), patch("app.routers.homework.homework_collection"), patch("app.routers.homework.store_homework", side_effect=lambda *args: {"id": "item", **args[6]}):
            response = self.client.post("/api/teaching-assignments/one/homework", json=self.body)
            self.assertEqual(response.status_code, 201)
            for key in CONTENT_FIELDS:
                self.assertEqual(response.json()[key], self.body[key])
            self.assertEqual(self.client.post("/api/teaching-assignments/one/homework", json={**self.body, "advanced_answers": "  "}).status_code, 422)

    def test_transaction_keeps_creation_date_and_rejects_other_assignment(self):
        registration, items, transaction = Mock(), Mock(), Mock()
        registration.get.return_value = Mock(exists=True, to_dict=lambda: self.registration)
        items.document.return_value.id = "item"
        items.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: {**self.body, "assignment_id": "one", "school_code": "school", "created_at": "original"})
        result = store_homework.to_wrap(transaction, registration, items, self.user["email"], "one", "school", self.body, "item")
        self.assertEqual(result["created_at"], "original")
        self.assertTrue(transaction.update.call_args.args[1]["teaching_assignments"]["one"]["has_homework"])
        items.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: {"assignment_id": "other", "school_code": "school"})
        transaction.reset_mock()
        with self.assertRaises(HTTPException):
            store_homework.to_wrap(transaction, registration, items, self.user["email"], "one", "school", self.body, "item")
        transaction.set.assert_not_called()

    def test_list_filters_old_school_and_deleted_items(self):
        with patch("app.routers.homework.profile_document", return_value=Mock(to_dict=lambda: self.registration)), patch("app.routers.homework.teaching_subjects", return_value=self.adoption), patch("app.routers.homework.homework_collection") as items:
            items.return_value.where.return_value.stream.return_value = [Mock(id="keep", to_dict=lambda: {**self.body, "school_code": "school"}), Mock(id="gone", to_dict=lambda: {"school_code": "school", "deleted": True}), Mock(id="old", to_dict=lambda: {"school_code": "other"})]
            response = self.client.get("/api/teaching-assignments/one/homework")
            self.assertEqual(response.status_code, 200)
            self.assertEqual([item["id"] for item in response.json()["homework"]], ["keep"])

    def test_unauthenticated_requests_rejected(self):
        app.dependency_overrides.clear()
        base = "/api/teaching-assignments/one/homework"
        for method, path, body in [("get", base, None), ("post", base, self.body), ("post", base + "/suggest", self.body), ("put", base + "/item", self.body), ("delete", base + "/item", None)]:
            self.assertEqual(getattr(self.client, method)(path, **({"json": body} if body else {})).status_code, 401)

    def test_ai_uses_saved_model_and_validates_all_three_levels(self):
        model = {"provider": "gemini", "model_name": "example", "enabled": True}
        saved = {**model, "model_id": "model", "api_key_encrypted": "encrypted"}
        for answer, valid in [(json.dumps(self.content), True), ('{"title":"missing levels"}', False)]:
            with patch("app.services.homework.database") as db, patch("app.services.homework.decrypt_key", return_value="test-only"), patch("app.services.homework.generate_text", return_value=answer) as generate, patch("app.services.prompts.user_prompt", return_value={"fixed_rules": "固定規則", "common_prompt_text": "3段階", "prompt_text": "追加"}):
                db.return_value.collection.return_value.document.return_value.get.side_effect = [Mock(exists=True, to_dict=lambda: saved), Mock(exists=True, to_dict=lambda: model)]
                if valid:
                    self.assertEqual(generate_homework("teacher", {"unit": "単元"})["suggestion"], self.content)
                    self.assertEqual(generate.call_args.kwargs["output_schema"], HOMEWORK_SCHEMA)
                else:
                    with self.assertRaises(HTTPException) as error:
                        generate_homework("teacher", {"unit": "単元"})
                    self.assertEqual(error.exception.status_code, 502)
