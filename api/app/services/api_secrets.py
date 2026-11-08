import os

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException


def cipher():
    key = os.environ.get("API_KEY_ENCRYPTION_KEY", "").strip()
    if not key:
        raise HTTPException(503, "APIキーの保存設定が未完了です。管理者にお問い合わせください。")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeError):
        raise HTTPException(503, "APIキーの保存設定が不正です。管理者にお問い合わせください。") from None


def encrypt_key(value):
    return cipher().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_key(value):
    try:
        return cipher().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, UnicodeError):
        raise HTTPException(503, "保存したAPIキーを読み取れません。管理者にお問い合わせください。") from None
