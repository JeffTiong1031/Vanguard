import json

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _post_extract(**headers):
    return client.post(
        "/v1/extract",
        files={"file": ("a.txt", b"Ahmad 880101-14-5566", "text/plain")},
        headers=headers,
    )


def _post_redact(spec=None, **headers):
    if spec is None:
        spec = {"extract_sha256": "0" * 64, "spans": []}
    return client.post(
        "/v1/redact",
        files={"file": ("a.txt", b"Ahmad 880101-14-5566", "text/plain")},
        data={"spec": json.dumps(spec)},
        headers=headers,
    )


def test_healthz_is_open_even_with_token_set(monkeypatch):
    monkeypatch.setenv("VANGUARD_DEMO_TOKEN", "s3cret")
    assert client.get("/healthz").status_code == 200


def test_extract_401_without_bearer(monkeypatch):
    monkeypatch.setenv("VANGUARD_DEMO_TOKEN", "s3cret")
    r = _post_extract()
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


def test_extract_401_with_wrong_bearer(monkeypatch):
    monkeypatch.setenv("VANGUARD_DEMO_TOKEN", "s3cret")
    r = _post_extract(authorization="Bearer nope")
    assert r.status_code == 401


def test_extract_200_with_correct_bearer(monkeypatch):
    monkeypatch.setenv("VANGUARD_DEMO_TOKEN", "s3cret")
    r = _post_extract(authorization="Bearer s3cret")
    assert r.status_code == 200


def test_gate_disabled_when_env_unset(monkeypatch):
    monkeypatch.delenv("VANGUARD_DEMO_TOKEN", raising=False)
    r = _post_extract()
    assert r.status_code == 200


def test_redact_401_without_bearer(monkeypatch):
    monkeypatch.setenv("VANGUARD_DEMO_TOKEN", "s3cret")
    r = _post_redact()
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


def test_redact_401_with_wrong_bearer(monkeypatch):
    monkeypatch.setenv("VANGUARD_DEMO_TOKEN", "s3cret")
    r = _post_redact(authorization="Bearer nope")
    assert r.status_code == 401


def test_redact_200_or_further_with_correct_bearer(monkeypatch):
    monkeypatch.setenv("VANGUARD_DEMO_TOKEN", "s3cret")
    r = _post_redact(authorization="Bearer s3cret")
    # Assert gate passes; the response may be 409 (extract_mismatch) from redact logic,
    # but NOT 401 from the auth gate.
    assert r.status_code != 401


def test_cors_preflight_allows_authorization_header():
    r = client.options(
        "/v1/extract",
        headers={
            "Origin": "https://chatgpt.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert r.status_code == 200
    allowed = r.headers.get("access-control-allow-headers", "").lower()
    assert "authorization" in allowed
