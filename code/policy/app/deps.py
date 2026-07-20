"""Shared application state.

The connection lives here rather than in main.py so route modules can import
get_conn() without importing the app itself -- main.py imports the routers, so
the reverse import would be a cycle that works only by statement ordering.
"""
import os

from app.db import connect, init_schema
from app.seed import seed_registry

DB_PATH = os.environ.get("VANGUARD_POLICY_DB", "policy.db")

_conn = connect(DB_PATH)
init_schema(_conn)
seed_registry(_conn)


def get_conn():
    return _conn
