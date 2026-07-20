from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
STATIC = Path(__file__).parent.parent / "app" / "static"


def test_console_is_served_at_root_when_built():
    if not (STATIC / "index.html").exists():
        import pytest
        pytest.skip("console not built; run `npm run build` in admin/")
    r = client.get("/")
    assert r.status_code == 200
    assert "<div id=\"root\">" in r.text


def test_api_routes_still_win_over_the_static_mount():
    assert client.get("/healthz").json() == {"ok": True}
