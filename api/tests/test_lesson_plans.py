import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app
from app.services.lesson_plans import store_plan
from app.services.teaching_assignments import assignment_rows, remove_assignment
from app.services.textbook_contents import textbook_contents


class LessonPlanTests(unittest.TestCase):
    def setUp(self):
        self.user = {"uid": "teacher", "email": "teacher@example.com"}
        app.dependency_overrides[current_user] = lambda: self.user
        self.client = TestClient(app)
        self.registration = {"email": self.user["email"], "profile": {"school_code": "school"}, "teaching_assignments": {
            "assignment": {"school_code": "school", "grade": 5, "subject": "国語"}}}
        self.reference = Mock()
        self.reference.get.return_value = Mock(exists=True, to_dict=lambda: self.registration)
        self.values = {"grade": 5, "subject": "国語", "title": "本時の授業", "unit": "銀色の裏地", "hours": 1}

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_new_plan_saved_and_assignment_marked_in_one_transaction(self):
        transaction, plans = Mock(), Mock()
        result = store_plan.to_wrap(transaction, self.reference, plans, self.user["email"], "assignment", "school", self.values)
        self.assertEqual(result["title"], self.values["title"])
        self.assertEqual(result["assignment_id"], "assignment")
        self.assertTrue(result["created_at"])
        self.assertEqual(result["created_at"], result["updated_at"])
        transaction.set.assert_called_once()
        self.assertTrue(transaction.update.call_args.args[1]["teaching_assignments"]["assignment"]["has_lesson_plans"])

    def test_unknown_deleted_previous_school_and_stale_assignment_are_rejected(self):
        cases = [({}, "assignment", "school", self.values),
                 ({"deleted": True}, "assignment", "school", self.values),
                 ({}, "assignment", "other", self.values),
                 ({}, "assignment", "school", {**self.values, "grade": 4})]
        for changes, assignment_id, school, values in cases:
            original = self.registration["teaching_assignments"]["assignment"]
            self.registration["teaching_assignments"]["assignment"] = {**original, **changes}
            transaction = Mock()
            if not changes and school == "school" and values is self.values:
                assignment_id = "unknown"
            with self.assertRaises(HTTPException):
                store_plan.to_wrap(transaction, self.reference, Mock(), self.user["email"], assignment_id, school, values)
            transaction.set.assert_not_called()
            self.registration["teaching_assignments"]["assignment"] = original

    def test_cannot_edit_plan_from_another_assignment(self):
        plans = Mock()
        plans.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: {"assignment_id": "other", "school_code": "school"})
        transaction = Mock()
        with self.assertRaises(HTTPException) as error:
            store_plan.to_wrap(transaction, self.reference, plans, self.user["email"], "assignment", "school", self.values, "plan")
        self.assertEqual(error.exception.status_code, 404)
        transaction.set.assert_not_called()

    def test_plan_delete_is_soft_and_preserves_content(self):
        plans = Mock()
        old = {**self.values, "assignment_id": "assignment", "school_code": "school"}
        plans.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: old)
        transaction = Mock()
        result = store_plan.to_wrap(transaction, self.reference, plans, self.user["email"], "assignment", "school", {}, "plan", True)
        self.assertTrue(result["deleted"])
        self.assertEqual(result["title"], old["title"])

    def test_update_keeps_original_creation_date(self):
        plans = Mock()
        old = {**self.values, "assignment_id": "assignment", "school_code": "school", "created_at": "2026-11-01T03:00:00+00:00"}
        plans.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: old)
        result = store_plan.to_wrap(Mock(), self.reference, plans, self.user["email"], "assignment", "school", self.values, "plan")
        self.assertEqual(result["created_at"], old["created_at"])
        self.assertNotEqual(result["updated_at"], old["created_at"])

    def test_legacy_plan_update_does_not_invent_creation_date(self):
        plans = Mock()
        old = {**self.values, "assignment_id": "assignment", "school_code": "school"}
        plans.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: old)
        result = store_plan.to_wrap(Mock(), self.reference, plans, self.user["email"], "assignment", "school", self.values, "plan")
        self.assertIsNone(result["created_at"])

    def test_assignment_delete_hides_it_without_removing_saved_data(self):
        transaction = Mock()
        remove_assignment.to_wrap(transaction, self.reference, self.user["email"], "assignment")
        stored = transaction.update.call_args.args[1]
        self.assertTrue(stored["teaching_assignments"]["assignment"]["deleted"])
        self.assertEqual(assignment_rows({**self.registration, **stored}, []), [])

    def test_owner_uid_scopes_plan_collection(self):
        from app.routers.lesson_plans import plan_collection
        with patch("app.routers.lesson_plans.database") as db:
            plan_collection(self.user)
            db.return_value.collection.assert_called_once_with("user_lesson_plans")
            db.return_value.collection.return_value.document.assert_called_once_with("teacher")

    def test_list_shows_only_active_plans_for_current_school_and_has_contents(self):
        plans = Mock()
        plans.where.return_value.stream.return_value = [Mock(id="mine", to_dict=lambda: {"school_code": "school", "title": "授業"}),
            Mock(id="old", to_dict=lambda: {"school_code": "old-school"}), Mock(id="deleted", to_dict=lambda: {"school_code": "school", "deleted": True})]
        adoption = {"profile": self.registration["profile"], "textbooks": [{"grades": [5], "subject": "国語", "publisher": "光村図書"}]}
        with patch("app.routers.lesson_plans.profile_document", return_value=Mock(to_dict=lambda: self.registration)), patch("app.routers.lesson_plans.teaching_subjects", return_value=adoption), patch("app.routers.lesson_plans.plan_collection", return_value=plans), patch("app.services.textbook_contents.academic_year", return_value=2026):
            response = self.client.get("/api/teaching-assignments/assignment/lesson-plans")
            self.assertEqual(response.status_code, 200)
            self.assertEqual([p["id"] for p in response.json()["plans"]], ["mine"])
            self.assertIn("銀色の裏地", response.json()["contents"][0]["units"])

    def test_authenticated_mutation_routes_and_validation(self):
        base = "/api/teaching-assignments/assignment/lesson-plans"
        record = Mock(to_dict=lambda: self.registration)
        with patch("app.routers.lesson_plans.profile_document", return_value=record), patch("app.routers.lesson_plans.database"), patch("app.routers.lesson_plans.plan_collection"), patch("app.routers.lesson_plans.store_plan", return_value={"id": "plan"}) as store:
            self.assertEqual(self.client.post(base, json=self.values).status_code, 201)
            self.assertEqual(self.client.put(base + "/plan", json=self.values).status_code, 200)
            self.assertEqual(self.client.delete(base + "/plan").status_code, 200)
            self.assertEqual(store.call_args.args[-2:], ("plan", True))
            self.assertEqual(self.client.post(base, json={**self.values, "title": "  "}).status_code, 422)
        app.dependency_overrides.clear()
        self.assertEqual(self.client.get(base).status_code, 401)
        self.assertEqual(self.client.post(base, json=self.values).status_code, 401)
        self.assertEqual(self.client.delete(base + "/plan").status_code, 401)

    def test_contents_match_grade_subject_publisher_and_edition(self):
        assignment = {"grade": 5, "subject": "算数"}
        books = [{"grades": [5], "subject": "算数", "publisher": "東京書籍"}]
        with patch("app.services.textbook_contents.academic_year", return_value=2026):
            self.assertEqual(len(textbook_contents(assignment, books)), 2)
            self.assertEqual(textbook_contents({"grade": 4, "subject": "算数"}, books), [])
            self.assertEqual(textbook_contents(assignment, [{**books[0], "publisher": "別の出版社"}]), [])
        with patch("app.services.textbook_contents.academic_year", return_value=2028):
            self.assertEqual(textbook_contents(assignment, books), [])

    def test_question_area_is_saved_separately_and_optional_for_old_clients(self):
        body = {**self.values, "activities": "授業展開", "student_questions": "児童：なぜ？ 教師：比べよう。"}
        with patch("app.routers.lesson_plans.profile_document", return_value=Mock(to_dict=lambda: self.registration)), patch("app.routers.lesson_plans.database"), patch("app.routers.lesson_plans.plan_collection"), patch("app.routers.lesson_plans.store_plan", side_effect=lambda *args: {"id": "plan", **args[6]}) as store:
            result = self.client.post("/api/teaching-assignments/assignment/lesson-plans", json=body)
            self.assertEqual(result.status_code, 201)
            self.assertEqual(result.json()["student_questions"], body["student_questions"])
            self.assertEqual(result.json()["activities"], "授業展開")
            self.client.post("/api/teaching-assignments/assignment/lesson-plans", json=self.values)
            self.assertEqual(store.call_args.args[6]["student_questions"], "")
