import hashlib
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from firebase_admin import firestore


def model_key(provider, name):
    return hashlib.sha256(f"{provider}\n{name}".encode("utf-8")).hexdigest()


def model_data(record):
    value = record.to_dict()
    return {"id": record.id, "provider": value["provider"], "model_name": value["model_name"], "enabled": value["enabled"]}


@firestore.transactional
def save_model(transaction, models, keys, values, model_id=None):
    target = models.document(model_id or uuid4().hex)
    old = target.get(transaction=transaction) if model_id else None
    previous = old.to_dict() if old is not None and old.exists else {}
    if model_id and (not previous or previous.get("deleted")):
        raise HTTPException(404, "モデルが見つかりません。")
    key = model_key(values["provider"], values["model_name"])
    unique = keys.document(key)
    existing = unique.get(transaction=transaction)
    if existing.exists and existing.to_dict().get("model_id") != target.id:
        raise HTTPException(409, "同じAIの種類・モデル名が登録されています。")
    stamp = datetime.now(timezone.utc).isoformat()
    transaction.set(target, {**values, "key": key, "created_at": previous.get("created_at", stamp), "updated_at": stamp, "deleted": False})
    transaction.set(unique, {"model_id": target.id})
    if previous and previous["key"] != key:
        transaction.delete(keys.document(previous["key"]))
    return {"id": target.id, **values}


@firestore.transactional
def remove_model(transaction, models, keys, model_id):
    target = models.document(model_id)
    old = target.get(transaction=transaction)
    value = old.to_dict() if old.exists else {}
    if not value or value.get("deleted"):
        raise HTTPException(404, "モデルが見つかりません。")
    transaction.update(target, {"deleted": True, "enabled": False, "updated_at": datetime.now(timezone.utc).isoformat()})
    transaction.delete(keys.document(value["key"]))
    return {"id": model_id, "status": "deleted"}
