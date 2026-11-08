import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import administrator, current_user
from app.main import app
from app.services.ai_models import model_key, save_model, remove_model


class SystemModelTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        app.dependency_overrides[administrator] = lambda: {"email": "admin@example.com"}
        self.values = {"provider": "openai", "model_name": "example-model", "enabled": True}

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_admin_crud_routes_normalize_only_three_fields(self):
        with patch("app.routers.system_models.database"), patch("app.routers.system_models.save_model", return_value={"id": "one", **self.values}) as store:
            response = self.client.post("/api/system/models", json={**self.values, "model_name": " example-model ", "api_key": "ignored"})
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertEqual(store.call_args.args[3], self.values)
            self.assertEqual(self.client.put("/api/system/models/one", json={**self.values, "enabled": False}).status_code, 200)
            self.assertFalse(store.call_args.args[3]["enabled"])
            self.assertEqual(store.call_args.args[4], "one")
        with patch("app.routers.system_models.database"), patch("app.routers.system_models.remove_model", return_value={"id": "one", "status": "deleted"}) as remove:
            self.assertEqual(self.client.delete("/api/system/models/one").status_code, 200)
            self.assertEqual(remove.call_args.args[-1], "one")

    def test_nonadministrator_and_anonymous_cannot_read_or_change_models(self):
        app.dependency_overrides.clear()
        calls = [("get", "/api/system/models", None), ("get", "/api/system/models/one", None),
                 ("post", "/api/system/models", self.values), ("put", "/api/system/models/one", self.values),
                 ("delete", "/api/system/models/one", None)]
        for expected in (401, 403):
            if expected == 403:
                app.dependency_overrides[current_user] = lambda: {"email": "teacher@example.com", "email_verified": True}
            with patch.dict("os.environ", {"system_administrator": "admin@example.com"}), patch("app.routers.system_models.database") as db:
                for method, path, body in calls:
                    kwargs = {"json": body} if body else {}
                    self.assertEqual(getattr(self.client, method)(path, **kwargs).status_code, expected)
                db.assert_not_called()

    def test_invalid_provider_empty_name_and_long_name(self):
        for changes in [{"provider": "unknown"}, {"model_name": "   "}, {"model_name": "x" * 101}]:
            with patch("app.routers.system_models.database") as db:
                self.assertEqual(self.client.post("/api/system/models", json={**self.values, **changes}).status_code, 422)
                db.assert_not_called()

    def test_list_excludes_deleted_and_whitelists_returned_fields(self):
        with patch("app.routers.system_models.database") as db:
            db.return_value.collection.return_value.stream.return_value = [
                Mock(id="one", to_dict=lambda: {**self.values, "key": "internal", "api_key": "not-returned"}),
                Mock(id="gone", to_dict=lambda: {**self.values, "deleted": True})]
            result = self.client.get("/api/system/models").json()
            self.assertEqual(result, {"models": [{"id": "one", **self.values}]})

    def test_missing_model_is_404(self):
        with patch("app.routers.system_models.database") as db:
            db.return_value.collection.return_value.document.return_value.get.return_value = Mock(exists=False)
            self.assertEqual(self.client.get("/api/system/models/missing").status_code, 404)

    def test_transaction_prevents_duplicate_registration(self):
        models, keys, transaction = Mock(), Mock(), Mock()
        models.document.return_value = Mock(id="new")
        keys.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: {"model_id": "existing"})
        with self.assertRaises(HTTPException) as error:
            save_model.to_wrap(transaction, models, keys, self.values)
        self.assertEqual(error.exception.status_code, 409)
        transaction.set.assert_not_called()

    def test_update_keeps_id_and_creation_date_and_releases_old_name(self):
        models, keys, transaction = Mock(), Mock(), Mock()
        reference = Mock(id="one")
        models.document.return_value = reference
        reference.get.return_value = Mock(exists=True, to_dict=lambda: {**self.values, "key": "old", "created_at": "original"})
        keys.document.return_value.get.return_value = Mock(exists=False)
        result = save_model.to_wrap(transaction, models, keys, {**self.values, "model_name": "new"}, "one")
        self.assertEqual(result["id"], "one")
        self.assertEqual(transaction.set.call_args_list[0].args[1]["created_at"], "original")
        transaction.delete.assert_called_once_with(keys.document("old"))

    def test_delete_disables_record_and_releases_unique_key(self):
        models, keys, transaction = Mock(), Mock(), Mock()
        models.document.return_value.get.return_value = Mock(exists=True, to_dict=lambda: {**self.values, "key": "unique"})
        remove_model.to_wrap(transaction, models, keys, "one")
        stored = transaction.update.call_args.args[1]
        self.assertTrue(stored["deleted"])
        self.assertFalse(stored["enabled"])
        transaction.delete.assert_called_once_with(keys.document("unique"))
