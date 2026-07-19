from __future__ import annotations

from pathlib import Path

from sens.schema import Example, assert_spans_valid


def load_jsonl(path: Path) -> list[Example]:
    rows: list[Example] = []
    with path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(Example.model_validate_json(line))
            except Exception as e:  # noqa: BLE001
                raise ValueError(f"{path}:{line_no}: {e}") from e
    return rows


def validate_path(path: Path) -> list[str]:
    errors: list[str] = []
    # id -> first line it appeared on. Duplicate ids are a FILE-level property, so a per-line
    # validator cannot see them: an exam amended by appending rows numbered from an id that was
    # already taken passed both this check and the coverage check, with two rows sharing an id
    # and one of them silently shadowing the other in any dict-keyed consumer (observed
    # 2026-07-19 on exam-501/502). merge_audit and disagreement both key by id.
    seen: dict[str, int] = {}
    with path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                ex = Example.model_validate_json(line)
                assert_spans_valid(ex)
                if ex.id in seen:
                    errors.append(
                        f"{path.name}:{line_no}: duplicate id {ex.id!r} "
                        f"(first seen on line {seen[ex.id]})"
                    )
                else:
                    seen[ex.id] = line_no
            except Exception as e:  # noqa: BLE001
                errors.append(f"{path.name}:{line_no}: {e}")
    return errors


def main() -> None:
    import argparse
    import sys

    p = argparse.ArgumentParser(description="Validate sens JSONL")
    p.add_argument("path", type=Path)
    args = p.parse_args()
    errs = validate_path(args.path)
    if errs:
        print("\n".join(errs))
        sys.exit(1)
    print(f"OK {args.path}")


if __name__ == "__main__":
    main()
