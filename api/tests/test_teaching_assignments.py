import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.services.teaching_assignments import assignment_rows, save_assignment


class AssignmentTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.user = {"email": "teacher@example.com"}
        app.dependency_overrides[current_user] = lambda: self.user
        self.adoption = {"profile": {"school_code": "school"}, "covered": True,
                         "textbooks": [{"grades": [1, 2], "subject": "国語", "publisher": "光村図書"}]}

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_create_uses_own_registration_and_ignores_submitted_textbook(self):
        record = Mock()
        with patch("app.routers.teaching_assignments.teaching_subjects", return_value=self.adoption), patch("app.routers.teaching_assignments.profile_document", return_value=record), patch("app.routers.teaching_assignments.database"), patch("app.routers.teaching_assignments.save_assignment", return_value={"id": "new"}) as store:
            response = self.client.post("/api/teaching-assignments", json={"grade": 1, "subject": "国語", "school_code": "other", "publisher": "改ざん"})
            self.assertEqual(response.status_code, 201)
            self.assertEqual(store.call_args.args[1:5], (record.reference, self.user["email"], "school", {"grade": 1, "subject": "国語"}))

    def test_missing_adoption_rejects_save(self):
        with patch("app.routers.teaching_assignments.teaching_subjects", return_value=self.adoption), patch("app.routers.teaching_assignments.save_assignment") as store:
            self.assertEqual(self.client.post("/api/teaching-assignments", json={"grade": 1, "subject": "理科"}).status_code, 422)
            store.assert_not_called()

    def test_list_resolves_textbook_and_excludes_previous_school(self):
        registration = {"profile": {"school_code": "school"}, "teaching_assignments": {
            "mine": {"school_code": "school", "grade": 1, "subject": "国語"},
            "old": {"school_code": "previous", "grade": 1, "subject": "国語"}}}
        with patch("app.routers.teaching_assignments.profile_document", return_value=Mock(to_dict=lambda: registration)), patch("app.routers.teaching_assignments.teaching_subjects", return_value=self.adoption):
            rows = self.client.get("/api/teaching-assignments").json()["assignments"]
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["id"], "mine")
            self.assertEqual(rows[0]["textbook"], "光村図書")

    def test_authentication_and_invalid_grade(self):
        self.assertEqual(self.client.post("/api/teaching-assignments", json={"grade": 7, "subject": "国語"}).status_code, 422)
        app.dependency_overrides.clear()
        self.assertEqual(self.client.get("/api/teaching-assignments").status_code, 401)
        self.assertEqual(self.client.put("/api/teaching-assignments/id", json={"grade": 1, "subject": "国語"}).status_code, 401)

    def test_transaction_preserves_other_assignments_and_updates_existing(self):
        data = {"email": self.user["email"], "profile": {"school_code": "school"}, "teaching_assignments": {
            "first": {"school_code": "school", "grade": 1, "subject": "国語"},
            "second": {"school_code": "school", "grade": 2, "subject": "国語"}}}
        reference = Mock()
        reference.get.return_value = Mock(exists=True, to_dict=lambda: data)
        transaction = Mock()
        result = save_assignment.to_wrap(transaction, reference, self.user["email"], "school", {"grade": 3, "subject": "算数"}, "first")
        self.assertEqual(result["id"], "first")
        stored = transaction.update.call_args.args[1]["teaching_assignments"]
        self.assertEqual(stored["second"], data["teaching_assignments"]["second"])
        self.assertEqual(stored["first"]["grade"], 3)

    def test_transaction_rejects_duplicates_unknown_ids_and_school_changes(self):
        data = {"email": self.user["email"], "profile": {"school_code": "school"}, "teaching_assignments": {
            "first": {"school_code": "school", "grade": 1, "subject": "国語"}}}
        for school, key, status in [("school", None, 409), ("school", "unknown", 404), ("other", None, 409)]:
            reference = Mock()
            reference.get.return_value = Mock(exists=True, to_dict=lambda: data)
            transaction = Mock()
            with self.assertRaises(HTTPException) as error:
                save_assignment.to_wrap(transaction, reference, self.user["email"], school, {"grade": 1, "subject": "国語"}, key)
            self.assertEqual(error.exception.status_code, status)
            transaction.update.assert_not_called()
