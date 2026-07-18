"""F4 regression tests.

Doc 02 section 4.3: "Zero-retention is not an architecture decision you make
once. It's a property you defend against your own future engineers' good
ideas." These tests are that defence, in executable form.
"""
import logging
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
SECRET = b"Ahmad bin Ali 880101-14-5566"


def test_no_temp_file_survives_a_request():
    tmp = Path(tempfile.gettempdir())
    before = set(tmp.iterdir())
    client.post("/v1/extract", files={"file": ("notes.txt", SECRET, "text/plain")})
    after = set(tmp.iterdir())
    assert after - before == set(), f"request left temp files behind: {after - before}"


def test_no_file_content_reaches_the_logs(caplog):
    with caplog.at_level(logging.DEBUG):
        client.post("/v1/extract", files={"file": ("notes.txt", SECRET, "text/plain")})
    joined = "\n".join(r.getMessage() for r in caplog.records)
    assert "880101-14-5566" not in joined
    assert "Ahmad" not in joined


def test_a_parse_failure_does_not_log_the_body(caplog):
    with caplog.at_level(logging.DEBUG):
        client.post("/v1/extract", files={"file": ("x.pdf", b"%PDF-1.7 " + SECRET, "application/pdf")})
    joined = "\n".join(r.getMessage() for r in caplog.records)
    assert "880101-14-5566" not in joined


def test_the_app_declares_no_retry_or_queue_dependency():
    # A structural guard: doc 02 section 4.3 names async retry and dead-letter
    # queues as the mechanisms that silently turn zero-retention into
    # short-retention. If someone adds one, this test is where they notice.
    import app.main as main_module
    source = Path(main_module.__file__).read_text()
    for banned in ("celery", "rq.Queue", "boto3", "kafka", "retry_queue"):
        assert banned not in source, f"{banned} introduces a persistence path; see doc 02 section 4.3"
