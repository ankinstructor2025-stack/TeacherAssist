import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from app.main import app, current_user


class TeachingSubjectsTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        app.dependency_overrides[current_user] = lambda: {"email": "teacher@example.com"}

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_uses_profile_school_instead_of_requested_school(self):
        profile = {"school_code": "own-school", "prefecture": "県", "city": "市", "school_name": "学校"}
        books = [{"grades": [3, 4], "subject": "保健", "publisher": "出版社", "school_year": 2026, "source_url": "https://example.org/adoption"}]
        record = Mock(to_dict=lambda: {"profile": profile})
        with patch("app.main.profile_document", return_value=record), patch("app.main.database") as db:
            db.return_value.collection.return_value.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: {"textbooks": books})
            response = self.client.get("/api/teaching-subjects?school_code=other-school")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertEqual(response.json(), {"profile": profile, "covered": True, "textbooks": books})
            db.return_value.collection.assert_called_once_with("school_textbook_adoptions")
            db.return_value.collection.return_value.document.assert_called_once_with("own-school")

    def test_no_school_does_not_query_adoptions(self):
        with patch("app.main.profile_document", return_value=Mock(to_dict=lambda: {})), patch("app.main.database") as db:
            self.assertEqual(self.client.get("/api/teaching-subjects").json(), {"profile": {}, "covered": False, "textbooks": []})
            db.assert_not_called()

    def test_missing_public_data_is_not_presented_as_adopted(self):
        with patch("app.main.profile_document", return_value=Mock(to_dict=lambda: {"profile": {"school_code": "school"}})), patch("app.main.database") as db:
            db.return_value.collection.return_value.document.return_value.get.return_value = Mock(exists=False)
            result = self.client.get("/api/teaching-subjects").json()
            self.assertFalse(result["covered"])
            self.assertEqual(result["textbooks"], [])

    def test_requires_authentication(self):
        app.dependency_overrides.clear()
        self.assertEqual(self.client.get("/api/teaching-subjects").status_code, 401)
