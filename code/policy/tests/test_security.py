from app.db import connect, init_schema
from app.security import (
    hash_password, hash_token, issue_session, new_token, session_org, verify_password,
)


def test_new_token_is_prefixed_and_its_hash_matches():
    plain, hashed = new_token("ENG")
    assert plain.startswith("ENG-")
    assert hash_token(plain) == hashed


def test_two_tokens_are_never_equal():
    assert new_token("ENG")[0] != new_token("ENG")[0]


def test_password_round_trips_and_rejects_the_wrong_one():
    stored = hash_password("hunter2")
    assert verify_password("hunter2", stored) is True
    assert verify_password("hunter3", stored) is False


def test_password_hash_is_salted_so_two_hashes_of_one_password_differ():
    assert hash_password("hunter2") != hash_password("hunter2")


def test_session_round_trip():
    conn = connect(":memory:")
    init_schema(conn)
    conn.execute(
        "INSERT INTO orgs (id, name, admin_password_hash) VALUES ('o1', 'Acme', 'x')"
    )
    token = issue_session(conn, "o1")
    assert session_org(conn, token) == "o1"
    assert session_org(conn, "not-a-session") is None
