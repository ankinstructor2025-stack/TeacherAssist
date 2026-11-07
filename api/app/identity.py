import hashlib


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def email_key(email: str) -> str:
    return hashlib.sha256(normalize_email(email).encode("utf-8")).hexdigest()
