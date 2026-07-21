from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _post_extract(**headers):
    return client.post(
        "/v1/extract",
        files={"file": ("a.txt", b"Ahmad 880101-14-5566", "text/plain")},
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
