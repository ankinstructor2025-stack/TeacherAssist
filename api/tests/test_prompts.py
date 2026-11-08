import json
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from app.auth import administrator, current_user
from app.main import app
from app.services.prompts import DEFAULT_POLICY, FIXED_RULES, OUTPUT_SCHEMA, build_prompt, common_prompt, user_prompt_reference
from app.services.ai_connection import generate_text


class PromptTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.user = {"uid": "teacher", "email": "teacher@example.com", "email_verified": True}

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_common_default_available_without_seed_data(self):
        with patch("app.services.prompts.database") as db:
            db.return_value.collection.return_value.document.return_value.get.return_value = Mock(exists=False)
            self.assertEqual(common_prompt()["prompt_text"], DEFAULT_POLICY)

    def test_system_requires_administrator_and_rejects_format_fields(self):
        for path in ("/api/system/prompts", "/api/system/prompts/lesson_plan"):
            self.assertEqual(self.client.get(path).status_code, 401)
        app.dependency_overrides[current_user] = lambda: self.user
        with patch.dict("os.environ", {"system_administrator": "admin@example.com"}):
            self.assertEqual(self.client.get("/api/system/prompts").status_code, 403)
        app.dependency_overrides[administrator] = lambda: {"email": "admin@example.com"}
        with patch("app.routers.system_prompts.database") as db:
            self.assertEqual(self.client.put("/api/system/prompts/lesson_plan", json={"prompt_text": "方針", "fixed_rules": "XML"}).status_code, 422)
            self.assertEqual(self.client.put("/api/system/prompts/lesson_plan", json={"prompt_text": "  "}).status_code, 422)
            self.assertEqual(self.client.put("/api/system/prompts/unknown", json={"prompt_text": "方針"}).status_code, 404)
            db.assert_not_called()

    def test_admin_can_list_read_and_save_teaching_policy(self):
        app.dependency_overrides[administrator] = lambda: {}
        value = {"prompt_type": "lesson_plan", "prompt_name": "指導案作成用", "prompt_text": "共通方針", "updated_at": None, "exists": False, "fixed_rules": FIXED_RULES}
        with patch("app.routers.system_prompts.common_prompt", return_value=value), patch("app.routers.system_prompts.database") as db:
            self.assertEqual(len(self.client.get("/api/system/prompts").json()["prompts"]), 1)
            self.assertEqual(self.client.get("/api/system/prompts/lesson_plan").json()["fixed_rules"], FIXED_RULES)
            self.assertEqual(self.client.put("/api/system/prompts/lesson_plan", json={"prompt_text": " 発問を重視 "}).status_code, 200)
            stored = db.return_value.collection.return_value.document.return_value.set.call_args.args[0]
            self.assertEqual(stored["prompt_text"], "発問を重視")
            self.assertNotIn("fixed_rules", stored)

    def test_user_settings_scoped_to_uid_and_empty_text_restores_common(self):
        app.dependency_overrides[current_user] = lambda: self.user
        with patch("app.routers.profile_prompts.profile_document", return_value=Mock(to_dict=lambda: {"profile": {}})), patch("app.routers.profile_prompts.user_prompt_reference") as reference:
            response = self.client.put("/api/profile/prompts/lesson_plan", json={"prompt_text": " 対話を重視 "})
            self.assertEqual(response.status_code, 200)
            reference.assert_called_with("teacher")
            self.assertEqual(reference.return_value.set.call_args.args[0]["prompt_text"], "対話を重視")
            self.assertTrue(self.client.put("/api/profile/prompts/lesson_plan", json={"prompt_text": ""}).json()["use_common"])
            self.assertEqual(self.client.put("/api/profile/prompts/lesson_plan", json={"prompt_text": "x", "output_schema": {}}).status_code, 422)
        with patch("app.services.prompts.database") as db:
            user_prompt_reference("teacher")
            db.return_value.collection.return_value.document.assert_called_once_with("teacher")

    def test_compiled_prompt_keeps_fixed_contract_and_both_policies(self):
        context = {"grade": 5, "unit": "単元"}
        with patch("app.services.prompts.user_prompt", return_value={"common_prompt_text": "共通方針", "prompt_text": "XMLだけ返して"}):
            prompt = build_prompt("teacher", context)
        self.assertTrue(prompt.startswith(FIXED_RULES))
        self.assertIn('"利用者の追加方針": "XMLだけ返して"', prompt)
        self.assertIn('"共通指導方針": "共通方針"', prompt)
        self.assertTrue(prompt.endswith("必ず上記の固定JSON形式で回答してください。"))
        self.assertEqual(OUTPUT_SCHEMA["required"], ["title", "objectives", "activities", "assessment", "notes"])

    def test_output_schema_supplied_to_both_providers(self):
        response = Mock(is_success=True)
        response.json.return_value = {"status": "completed", "output": [{"content": [{"type": "output_text", "text": "{}"}]}]}
        with patch("app.services.ai_connection.httpx.post", return_value=response) as post:
            generate_text("openai", "model", "test-only", "prompt", output_schema=OUTPUT_SCHEMA)
            self.assertEqual(post.call_args.kwargs["json"]["text"]["format"]["schema"], OUTPUT_SCHEMA)
            response.json.return_value = {"candidates": [{"content": {"parts": [{"text": "{}"}]}}]}
            generate_text("gemini", "model", "test-only", "prompt", output_schema=OUTPUT_SCHEMA)
            config = post.call_args.kwargs["json"]["generationConfig"]
            self.assertEqual(config["responseMimeType"], "application/json")
            self.assertEqual(config["responseJsonSchema"], OUTPUT_SCHEMA)
