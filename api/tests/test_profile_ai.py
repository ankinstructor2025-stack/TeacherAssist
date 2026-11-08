import os
import unittest
from unittest.mock import Mock, patch

import httpx
from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.services.api_secrets import encrypt_key, decrypt_key
from app.services.profile_ai import save_settings
from app.services.ai_connection import test_connection, TEST_MESSAGE


class ProfileAiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.user = {"uid": "teacher", "email": "teacher@example.com"}
        app.dependency_overrides[current_user] = lambda: self.user
        self.secret = "test-only-key-not-a-real-credential"
        self.env = patch.dict(os.environ, {"API_KEY_ENCRYPTION_KEY": Fernet.generate_key().decode()})
        self.env.start()
        self.model = {"provider": "openai", "model_name": "example", "enabled": True}

    def tearDown(self):
        app.dependency_overrides.clear()
        self.env.stop()

    def test_encryption_round_trip_and_missing_configuration(self):
        encrypted = encrypt_key(self.secret)
        self.assertNotIn(self.secret, encrypted)
        self.assertEqual(decrypt_key(encrypted), self.secret)
        with patch.dict(os.environ, {"API_KEY_ENCRYPTION_KEY": ""}), self.assertRaises(HTTPException) as error:
            encrypt_key(self.secret)
        self.assertEqual(error.exception.status_code, 503)

    def test_settings_are_saved_encrypted_and_never_return_secret(self):
        registration, models, target, transaction = Mock(), Mock(), Mock(), Mock()
        registration.get.return_value = Mock(exists=True, to_dict=lambda: {"email": self.user["email"]})
        models.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: self.model)
        target.get.return_value = Mock(exists=False)
        result = save_settings.to_wrap(transaction, registration, models, target, self.user["email"], "one", self.secret)
        self.assertEqual(result, {"model_id": "one", "provider": "openai", "model_name": "example", "has_api_key": True})
        stored = transaction.set.call_args.args[1]
        self.assertEqual(decrypt_key(stored["api_key_encrypted"]), self.secret)
        self.assertNotIn("api_key", stored)

    def test_blank_key_reuses_same_provider_but_not_other_provider(self):
        registration, models, target = Mock(), Mock(), Mock()
        registration.get.return_value = Mock(exists=True, to_dict=lambda: {"email": self.user["email"]})
        models.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: self.model)
        target.get.return_value = Mock(exists=True, to_dict=lambda: {"provider": "openai", "api_key_encrypted": "kept"})
        transaction = Mock()
        save_settings.to_wrap(transaction, registration, models, target, self.user["email"], "one", "")
        self.assertEqual(transaction.set.call_args.args[1]["api_key_encrypted"], "kept")
        self.model["provider"] = "gemini"
        with self.assertRaises(HTTPException):
            save_settings.to_wrap(Mock(), registration, models, target, self.user["email"], "one", "")

    def test_disabled_model_and_changed_registration_cannot_be_saved(self):
        registration, models, target = Mock(), Mock(), Mock()
        registration.get.return_value = Mock(exists=True, to_dict=lambda: {"email": "other@example.com"})
        transaction = Mock()
        with self.assertRaises(HTTPException):
            save_settings.to_wrap(transaction, registration, models, target, self.user["email"], "one", self.secret)
        transaction.set.assert_not_called()
        registration.get.return_value = Mock(exists=True, to_dict=lambda: {"email": self.user["email"]})
        models.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: {**self.model, "enabled": False})
        with self.assertRaises(HTTPException):
            save_settings.to_wrap(transaction, registration, models, target, self.user["email"], "one", self.secret)
        transaction.set.assert_not_called()

    def test_get_lists_enabled_models_and_decrypts_own_key_for_password_field(self):
        with patch("app.routers.profile_ai.profile_document"), patch("app.routers.profile_ai.database") as db, patch("app.routers.profile_ai.settings_reference") as settings:
            db.return_value.collection.return_value.stream.return_value = [Mock(id="one", to_dict=lambda: self.model), Mock(to_dict=lambda: {**self.model, "enabled": False})]
            settings.return_value.get.return_value = Mock(exists=True, to_dict=lambda: {"model_id": "one", **self.model, "api_key_encrypted": encrypt_key(self.secret)})
            response = self.client.get("/api/profile/ai")
            self.assertEqual(len(response.json()["models"]), 1)
            self.assertTrue(response.json()["settings"]["has_api_key"])
            self.assertEqual(response.json()["settings"]["api_key"], self.secret)
            self.assertNotIn("api_key_encrypted", response.text)
            self.assertEqual(response.headers["cache-control"], "no-store")

    def test_test_endpoint_uses_saved_key_and_requires_no_message(self):
        with patch("app.routers.profile_ai.profile_document"), patch("app.routers.profile_ai.settings_reference") as settings, patch("app.routers.profile_ai.database") as db, patch("app.routers.profile_ai.test_connection") as connect:
            settings.return_value.get.return_value = Mock(exists=True, to_dict=lambda: {"model_id": "one", **self.model, "api_key_encrypted": encrypt_key(self.secret)})
            db.return_value.collection.return_value.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: self.model)
            response = self.client.post("/api/profile/ai/test")
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["ok"])
            self.assertNotIn(self.secret, response.text)
            connect.assert_called_once_with("openai", "example", self.secret)
            self.model["enabled"] = False
            self.assertEqual(self.client.post("/api/profile/ai/test").status_code, 422)
            self.assertEqual(connect.call_count, 1)

    def test_settings_reference_uses_authenticated_uid(self):
        from app.routers.profile_ai import settings_reference
        with patch("app.routers.profile_ai.database") as db:
            settings_reference(self.user)
            db.return_value.collection.return_value.document.assert_called_once_with("teacher")

    def test_all_endpoints_require_authentication(self):
        app.dependency_overrides.clear()
        self.assertEqual(self.client.get("/api/profile/ai").status_code, 401)
        self.assertEqual(self.client.put("/api/profile/ai", json={"model_id": "one"}).status_code, 401)
        self.assertEqual(self.client.post("/api/profile/ai/test").status_code, 401)

    def test_openai_fixed_prompt_and_gemini_header_auth(self):
        response = Mock(is_success=True)
        response.json.return_value = {"status": "completed", "output": [{"content": [{"type": "output_text", "text": "OK"}]}]}
        with patch("app.services.ai_connection.httpx.post", return_value=response) as post:
            test_connection("openai", "example", self.secret)
            self.assertEqual(post.call_args.kwargs["json"]["input"], TEST_MESSAGE)
            self.assertFalse(post.call_args.kwargs["json"]["store"])
            self.assertFalse(post.call_args.kwargs["follow_redirects"])
            response.json.return_value = {"candidates": [{"content": {"parts": [{"text": "OK"}]}}]}
            test_connection("gemini", "example", self.secret)
            self.assertNotIn(self.secret, post.call_args.args[0])
            self.assertEqual(post.call_args.kwargs["headers"]["x-goog-api-key"], self.secret)

    def test_upstream_errors_and_timeouts_do_not_expose_secrets(self):
        with patch("app.services.ai_connection.httpx.post", return_value=Mock(is_success=False, status_code=401, text=self.secret)):
            with self.assertRaises(HTTPException) as error:
                test_connection("openai", "example", self.secret)
            self.assertNotIn(self.secret, error.exception.detail)
        with patch("app.services.ai_connection.httpx.post", side_effect=httpx.ReadTimeout(self.secret)):
            with self.assertRaises(HTTPException) as error:
                test_connection("openai", "example", self.secret)
            self.assertEqual(error.exception.status_code, 504)
            self.assertNotIn(self.secret, error.exception.detail)
