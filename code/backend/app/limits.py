"""Every Slice 2 limit, in one place.

🔴 Each value is an (estimate). None is derived from a measurement, and
`code/README.md` forbids laundering an estimate into a decided constant:
"A number in a config file looks decided."  Revisit after the team test.
"""

MAX_UPLOAD_BYTES = 10 * 1024 * 1024        # 10 MB   (estimate)
MAX_EXTRACT_CHARS = 100_000                # ~25k tokens ~50 chunks  (estimate)
MAX_PDF_PAGES = 100                        # (estimate)
MAX_CSV_ROWS = 20_000                      # (estimate)

# OOXML containers are ZIPs, so they are zip-bomb carriers.
MAX_ZIP_ENTRIES = 1_000                    # (estimate)
MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024   # 100 MB (estimate)
MAX_ZIP_RATIO = 100                        # uncompressed:compressed (estimate)

PARSE_TIMEOUT_SECONDS = 10.0               # hard wall clock per parse (estimate)
REQUEST_TIMEOUT_SECONDS = 30.0             # (estimate)

# A PDF that yields fewer than this many characters per page is treated as
# having no usable text layer -> ERROR, never a clean scan. See Pushback 3.
MIN_CHARS_PER_PAGE = 8                     # (estimate)
