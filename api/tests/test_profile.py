import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from app.main import app, current_user, school_catalog


class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.user = {"uid": "u", "email": "teacher@example.com", "name": "先生"}
        app.dependency_overrides[current_user] = lambda: self.user

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_catalog_contains_all_prefectures_and_unique_schools(self):
        records = school_catalog()
        self.assertEqual(len({r["prefecture"] for r in records}), 47)
        self.assertEqual(len({r["code"] for r in records}), len(records))
        self.assertTrue(all(r["code"].startswith("B1") for r in records))
        self.assertIn("東京都", {r["prefecture"] for r in records})

    def test_cascading_school_choices(self):
        sample = school_catalog()[0]
        response = self.client.get("/api/schools", params={"prefecture": sample["prefecture"]})
        self.assertIn(sample["city"], response.json()["cities"])
        response = self.client.get("/api/schools", params={"prefecture": sample["prefecture"], "city": sample["city"]})
        self.assertTrue(all(r["prefecture"] == sample["prefecture"] and r["city"] == sample["city"] for r in response.json()["schools"]))

    def test_unknown_school_cannot_be_saved(self):
        with patch("app.main.store_profile") as store:
            response = self.client.put("/api/profile", json={"school_code": "unknown"})
            self.assertEqual(response.status_code, 422)
            store.assert_not_called()

    def test_profile_save_uses_catalog_and_own_registration(self):
        sample = school_catalog()[0]
        record = Mock()
        with patch("app.main.profile_document", return_value=record) as document, patch("app.main.database"), patch("app.main.store_profile") as store:
            response = self.client.put("/api/profile", json={"school_code": sample["code"], "email": "other@example.com", "city": "改ざん"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["profile"]["city"], sample["city"])
            document.assert_called_once_with(self.user)
            self.assertEqual(store.call_args.args[1], record.reference)
            self.assertEqual(store.call_args.args[2], self.user["email"])

    def test_profile_restores_saved_selection(self):
        record = Mock(to_dict=lambda: {"profile": {"school_code": "saved"}})
        with patch("app.main.profile_document", return_value=record):
            self.assertEqual(self.client.get("/api/profile").json(), {"profile": {"school_code": "saved"}})
