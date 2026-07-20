"""Seed data: the curated AI-tool registry and a demo org.

The registry is deliberately a short, explicit list. It is why the extension
asks for ten host permissions instead of <all_urls> -- doc 02 section 6.4's
un-N/A-able security-questionnaire row.
"""
import sqlite3
import uuid

from app.security import hash_password, now_iso

# (id, host, display_name)
REGISTRY: list[tuple[str, str, str]] = [
    ("openai",     "chatgpt.com",       "ChatGPT"),
    ("anthropic",  "claude.ai",         "Claude"),
    ("google",     "gemini.google.com", "Google Gemini"),
    ("microsoft",  "copilot.microsoft.com", "Microsoft Copilot"),
    ("perplexity", "www.perplexity.ai", "Perplexity"),
    ("deepseek",   "chat.deepseek.com", "DeepSeek"),
    ("mistral",    "chat.mistral.ai",   "Le Chat (Mistral)"),
    ("xai",        "grok.com",          "Grok"),
]

# (key, label). The first two are the case study's own named prohibitions.
ETHICS_CATEGORIES: list[tuple[str, str]] = [
    ("covert_surveillance",      "Covert monitoring of employees"),
    ("undisclosed_profiling",    "Profiling people without their knowledge"),
    ("discriminatory_screening", "Screening or ranking people on protected attributes"),
    ("security_evasion",         "Evading security controls or producing exploit code"),
    ("harassment_content",       "Harassing, threatening, or abusive content"),
    ("regulatory_circumvention", "Circumventing legal or regulatory obligations"),
]

_DEFAULT_APPROVED = {"openai", "anthropic"}


def seed_registry(conn: sqlite3.Connection) -> None:
    conn.executemany(
        "INSERT OR IGNORE INTO llm_registry (id, host, display_name) VALUES (?, ?, ?)",
        REGISTRY,
    )
    conn.commit()


def seed_demo_org(conn: sqlite3.Connection, name: str, admin_password: str) -> str:
    org_id = uuid.uuid4().hex
    conn.execute(
        "INSERT INTO orgs (id, name, admin_password_hash, policy_version)"
        " VALUES (?, ?, ?, 1)",
        (org_id, name, hash_password(admin_password)),
    )
    conn.executemany(
        "INSERT INTO org_llm_policy (org_id, llm_id, status) VALUES (?, ?, ?)",
        [
            (org_id, llm_id, "approved" if llm_id in _DEFAULT_APPROVED else "blocked")
            for llm_id, _, _ in REGISTRY
        ],
    )
    conn.executemany(
        "INSERT INTO policy_category (org_id, key, label, enabled) VALUES (?, ?, ?, 1)",
        [(org_id, key, label) for key, label in ETHICS_CATEGORIES],
    )
    conn.commit()
    return org_id
