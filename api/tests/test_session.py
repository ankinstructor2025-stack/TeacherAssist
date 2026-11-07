import unittest
from unittest.mock import patch, Mock

from fastapi.testclient import TestClient
from firebase_admin import auth
from app.main import app


class SessionTests(unittest.TestCase):
    def setUp(self):
        # 外部認証を呼ばずルーティング・認証結果を検証する。lifespanは別途検証。
        self.client = TestClient(app)

    def test_missing_and_invalid_scheme(self):
        for header in ({}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer"}):
            response = self.client.post("/api/session", headers=header)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.headers["www-authenticate"], "Bearer")

    def test_rejected_tokens(self):
        for error in (auth.InvalidIdTokenError("invalid"), auth.ExpiredIdTokenError("expired", None), auth.RevokedIdTokenError("revoked"), auth.UserDisabledError("disabled")):
            with self.subTest(error=type(error).__name__), patch("app.auth.verify_token", side_effect=error):
                self.assertEqual(self.client.post("/api/session", headers={"Authorization": "Bearer invalid"}).status_code, 401)

    def test_google_session(self):
        claims = {"uid": "test-user", "email": "teacher@example.com", "name": "先生", "email_verified": True, "firebase": {"sign_in_provider": "google.com"}}
        with patch("app.auth.verify_token", return_value=claims) as verify, patch("app.auth.user_collection") as collection:
            collection.return_value.where.return_value.limit.return_value.stream.return_value = [Mock(to_dict=lambda: {"user_name": "先生"})]
            response = self.client.post("/api/session", headers={"Authorization": "Bearer valid"})
        verify.assert_called_once_with("valid")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {**{k: claims[k] for k in ("uid", "email", "name")}, "is_system_administrator": False})
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_unregistered_user_is_rejected(self):
        claims = {"uid": "u", "email": "unknown@example.com", "email_verified": True, "firebase": {"sign_in_provider": "google.com"}}
        with patch.dict("os.environ", {"system_administrator": "admin@example.com"}), patch("app.auth.verify_token", return_value=claims), patch("app.auth.user_collection") as collection:
            collection.return_value.where.return_value.limit.return_value.stream.return_value = []
            self.assertEqual(self.client.post("/api/session", headers={"Authorization": "Bearer valid"}).status_code, 403)

    def test_administrator_needs_no_registration(self):
        claims = {"uid": "admin", "email": "Admin@example.com", "email_verified": True, "firebase": {"sign_in_provider": "google.com"}}
        with patch.dict("os.environ", {"system_administrator": "admin@example.com"}), patch("app.auth.verify_token", return_value=claims), patch("app.auth.user_collection") as collection:
            response = self.client.post("/api/session", headers={"Authorization": "Bearer valid"})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["is_system_administrator"])
            collection.assert_not_called()

    def test_registered_user_cannot_manage_users(self):
        claims = {"uid": "u", "email": "teacher@example.com", "email_verified": True, "firebase": {"sign_in_provider": "google.com"}}
        with patch.dict("os.environ", {"system_administrator": "admin@example.com"}), patch("app.auth.verify_token", return_value=claims), patch("app.auth.user_collection") as collection:
            collection.return_value.where.return_value.limit.return_value.stream.return_value = [Mock(to_dict=lambda: {"user_name": "先生"})]
            self.assertEqual(self.client.get("/api/system/users", headers={"Authorization": "Bearer valid"}).status_code, 403)
    def test_other_provider(self):
        with patch("app.auth.verify_token", return_value={"firebase": {"sign_in_provider": "password"}}):
            self.assertEqual(self.client.post("/api/session", headers={"Authorization": "Bearer other"}).status_code, 403)

    def test_ui_files(self):
        for path in ("/", "/html/home.html", "/js/index.js", "/css/theme.css"):
            self.assertEqual(self.client.get(path).status_code, 200)

    def test_missing_configuration_fails_startup(self):
        with patch.dict("os.environ", {"FIREBASE_AUTH_PROJECT_ID": ""}):
            with self.assertRaises(RuntimeError), TestClient(app):
                pass

    def test_verifier_uses_dedicated_app_and_revocation(self):
        from app.auth import verify_token
        with patch("app.auth.firebase_admin.get_app", return_value="dedicated") as get_app, patch("app.auth.auth.verify_id_token", return_value={}) as verify:
            verify_token("token")
        get_app.assert_called_once_with("teacherassist-auth")
        verify.assert_called_once_with("token", app="dedicated", check_revoked=True)


if __name__ == "__main__":
    unittest.main()
