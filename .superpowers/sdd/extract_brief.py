#!/usr/bin/env python3
"""Extract one task's full text from an implementation plan."""
import re
import sys
from pathlib import Path

def main() -> None:
    if len(sys.argv) < 3 or len(sys.argv) > 4:
        print("usage: extract_brief.py PLAN_FILE TASK_NUMBER [OUTFILE]", file=sys.stderr)
        sys.exit(2)
    plan = Path(sys.argv[1])
    n = int(sys.argv[2])
    if not plan.is_file():
        print(f"no such plan file: {plan}", file=sys.stderr)
        sys.exit(2)
    out = Path(sys.argv[3]) if len(sys.argv) == 4 else Path(f".superpowers/sdd/task-{n}-brief.md")
    lines = plan.read_text(encoding="utf-8").splitlines(True)
    result: list[str] = []
    intask = False
    infence = False
    for line in lines:
        if line.startswith("```"):
            infence = not infence
        if not infence and re.match(r"^#+[ \t]+Task[ \t]+[0-9]+", line):
            m = re.match(r"^#+[ \t]+Task[ \t]+([0-9]+)", line)
            intask = bool(m and int(m.group(1)) == n)
        if intask:
            result.append(line)
    if not result:
        print(f"task {n} not found in {plan}", file=sys.stderr)
        sys.exit(3)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("".join(result), encoding="utf-8")
    print(f"wrote {out}: {len(result)} lines")

if __name__ == "__main__":
    main()
