#!/usr/bin/env python3
"""Strip Co-authored-by trailers from a commit message (stdin -> stdout)."""
import re
import sys

text = sys.stdin.read()
text = re.sub(r"(?im)^Co-authored-by:.*\n?", "", text)
# Also drop a blank line left before EOF if message ended with trailer block
text = re.sub(r"\n{3,}$", "\n\n", text)
sys.stdout.write(text.rstrip() + "\n")
