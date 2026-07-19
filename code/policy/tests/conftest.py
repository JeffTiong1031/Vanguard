"""Point every test at an in-memory database.

This MUST run before `app.main` is imported, because that module opens its
connection at import time. pytest loads conftest.py first, which is the whole
reason this lives here rather than in a fixture.
"""
import os

os.environ["VANGUARD_POLICY_DB"] = ":memory:"
