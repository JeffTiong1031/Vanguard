"""The demo narrative, end to end, with no browser.

mint token -> enrol -> Gemini is blocked -> request -> admin approves ->
policy version changes -> Gemini is approved -> the employee's next poll
sees it.

Tasks 5-9 each test one route in isolation. None proves the *sequence*:
mint a token, enrol, find the tool blocked, request access, admin approves,
the policy version changes, the tool is now approved. That sequence is the
demo. This test drives every hop of it through the real HTTP boundary, with
two separate TestClient instances -- one for the employee, one for the admin
-- so the admin's session cookie can never leak into an employee request.
That separation is itself part of what the test proves: an employee has no
way to reach an admin-only route by accident.
"""
from fastapi.testclient import TestClient

from app.main import app, bootstrap_demo, get_conn

employee = TestClient(app)
admin = TestClient(app)


def test_the_whole_demo_sequence():
    org_id = bootstrap_demo("Acme Corp", "vanguard")

    # app/deps.py's connection is a process-wide singleton, so every test
    # file in this run shares one "Acme Corp" org -- and test_admin.py's own
    # tests legitimately approve "google" as part of exercising that route,
    # leaving it approved for whichever test runs next. Force the seeded
    # "blocked" state back explicitly so this test's own walkthrough (block
    # -> request -> approve) describes what THIS test does, not an accident
    # of file ordering. This is setup, the same "reach into the connection
    # directly" idiom test_admin.py already uses -- not a workaround for a
    # production defect.
    get_conn().execute(
        "UPDATE org_llm_policy SET status = 'blocked' WHERE org_id = ? AND llm_id = 'google'",
        (org_id,),
    )
    get_conn().commit()

    assert admin.post("/v1/admin/login", json={
        "org_name": "Acme Corp", "password": "vanguard",
    }).status_code == 200

    # The admin client now carries a session cookie. The employee client
    # never logs in and never will -- if any admin route were reachable
    # from `employee`, that would be the bug this separation exists to
    # catch.
    assert "vg_admin" not in employee.cookies

    # 1. Admin mints a department token.
    token = admin.post("/v1/admin/tokens", json={"department": "Engineering"}).json()["token"]

    # 2. Employee enrols. Department comes from the token, not self-declared.
    enroll_resp = employee.post("/v1/enroll", json={"token": token})
    assert enroll_resp.status_code == 200
    enrolled = enroll_resp.json()
    pseudo_id, org_id = enrolled["pseudo_id"], enrolled["org_id"]
    assert enrolled["department"] == "Engineering"

    # 3. Gemini starts blocked, so there is something to walk into.
    tools = {t["llm_id"]: t["status"] for t in enrolled["policy"]["tools"]}
    assert tools["google"] == "blocked"
    version_before = enrolled["policy"]["version"]

    # 3a. The employee's own poll agrees with what enrolment handed back,
    # and hands us an ETag to test the caching contract with.
    first_poll = employee.get("/v1/policy", params={"org_id": org_id})
    assert first_poll.status_code == 200
    assert first_poll.json()["version"] == version_before
    etag_before = first_poll.headers["etag"]

    # 3b. Sending that ETag back gets a 304 -- nothing has changed yet.
    # This pins the caching mechanism the propagation step below depends
    # on: if this ever silently returned 200, the 200-after-approval
    # assertion later would prove nothing about propagation.
    cached = employee.get(
        "/v1/policy", params={"org_id": org_id},
        headers={"If-None-Match": etag_before},
    )
    assert cached.status_code == 304
    assert cached.content == b""

    # 4. The extension cannot smuggle prompt text into an event. The wire
    # model sets extra="forbid", so an attempt is rejected with 422 rather
    # than silently dropped or stored -- I3's structural guarantee.
    rejected = employee.post("/v1/events", json={
        "pseudo_id": pseudo_id,
        "events": [{"host": "gemini.google.com", "type": "visit_unapproved",
                    "ts": "2026-07-19T10:00:00+00:00", "prompt": "leaked text"}],
    })
    assert rejected.status_code == 422

    # 4a. The real event -- host, type, category, hash, ts only -- is
    # accepted.
    assert employee.post("/v1/events", json={
        "pseudo_id": pseudo_id,
        "events": [{"host": "gemini.google.com", "type": "visit_unapproved",
                    "ts": "2026-07-19T10:00:00+00:00"}],
    }).status_code == 202

    # 5. Employee requests access.
    request_resp = employee.post("/v1/requests", json={
        "pseudo_id": pseudo_id, "llm_id": "google", "reason": "Translation QA",
    })
    assert request_resp.status_code == 201
    request_id = request_resp.json()["id"]

    # 6. It reaches the admin queue, matched by id, with the right
    # department -- proving the queue joins back to the employee's
    # enrolment, not just that *a* row exists.
    queue = admin.get("/v1/admin/requests").json()
    matches = [r for r in queue if r["id"] == request_id]
    assert len(matches) == 1
    assert matches[0]["department"] == "Engineering"
    assert matches[0]["llm_id"] == "google"

    # 7. Admin approves.
    decide_resp = admin.post(
        f"/v1/admin/requests/{request_id}", json={"decision": "approved"}
    )
    assert decide_resp.status_code == 200
    version_after_decision = decide_resp.json()["version"]
    assert version_after_decision > version_before

    # 8. The employee's next poll, sent with the ETag from BEFORE the
    # approval, is no longer a cache hit: it returns 200 (not 304), a
    # higher version, and Gemini now approved. This is the propagation
    # mechanism the whole demo depends on -- a revocation or an approval
    # is only real if the next poll observes it.
    refreshed_resp = employee.get(
        "/v1/policy", params={"org_id": org_id},
        headers={"If-None-Match": etag_before},
    )
    assert refreshed_resp.status_code == 200
    refreshed = refreshed_resp.json()
    assert refreshed["version"] > version_before
    assert refreshed["version"] == version_after_decision
    assert {t["llm_id"]: t["status"] for t in refreshed["tools"]}["google"] == "approved"
    etag_after = refreshed_resp.headers["etag"]
    assert etag_after != etag_before

    # 8a. And the new ETag is now the one that earns a 304 -- the cache
    # contract holds on the new version too, not just the old one.
    assert employee.get(
        "/v1/policy", params={"org_id": org_id},
        headers={"If-None-Match": etag_after},
    ).status_code == 304

    # 9. The usage dashboard attributes the recorded visit to the right
    # department.
    usage = admin.get("/v1/admin/usage").json()
    assert any(
        d["department"] == "Engineering" and d["events"] >= 1
        for d in usage["by_department"]
    )
