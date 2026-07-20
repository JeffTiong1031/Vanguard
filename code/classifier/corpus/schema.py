"""Corpus row type and validation.

The six categories mirror code/policy/app/seed.py's ETHICS_CATEGORIES. If you
change one, change both -- the modal shows the server's label for the key this
model returns.
"""
import json
from pathlib import Path
from typing import Optional, TypedDict

CATEGORIES: list[str] = [
    "covert_surveillance",
    "undisclosed_profiling",
    "discriminatory_screening",
    "security_evasion",
    "harassment_content",
    "regulatory_circumvention",
]


class Row(TypedDict):
    text: str
    label: Optional[str]      # None == negative


def load(path: Path) -> list[Row]:
    rows: list[Row] = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    validate(rows)
    return rows


def validate(rows: list[Row]) -> None:
    for row in rows:
        if "text" not in row or "label" not in row:
            raise ValueError(f"row missing keys: {row}")
        if not row["text"].strip():
            raise ValueError("empty text")
        if row["label"] is not None and row["label"] not in CATEGORIES:
            raise ValueError(f"unknown label: {row['label']}")
