# Layouts

No app shell. Extension UI is overlay-only on ChatGPT / Claude pages:

1. **Modal host** — full-viewport dimmed overlay, z-index max, centered dialog.
2. **Degraded banner** — fixed top-right notice when L2 is unavailable (ADR 0014).
3. **Composer hints host** (Slice 1.5) — sibling overlay for underlines + hover popover; `pointer-events` only on underline/popover hit targets.

Layouts are not route-based; they mount into `document.body` from the content script.
