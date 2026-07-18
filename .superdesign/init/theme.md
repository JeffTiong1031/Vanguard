# Theme — Slice 1.5 Grammarly-style privacy hints

Taste: **in-composer privacy guidance for enterprise** — Grammarly-like language, high-contrast underlines, compact hover card, restrained motion. **Not** AI-purple glass.

## Tokens (canonical for typing hints + later Send Phase 4)

```css
:root {
  --vg-hint-underline: #e11d48; /* rose-600 — strong, 突出 */
  --vg-hint-underline-hover: #be123c; /* rose-700 */
  --vg-popover-bg: #ffffff;
  --vg-popover-fg: #0f172a; /* slate-900 */
  --vg-popover-muted: #64748b; /* slate-500 */
  --vg-popover-border: #e2e8f0; /* slate-200 */
  --vg-btn-primary-bg: #0f172a;
  --vg-btn-primary-fg: #ffffff;
  --vg-btn-secondary-bg: transparent;
  --vg-btn-secondary-fg: #475569; /* slate-600 */
  --vg-radius: 8px;
  --vg-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  --vg-font: "Segoe UI", system-ui, -apple-system, sans-serif;
  --vg-motion-underline: 120ms ease-out;
  --vg-motion-popover: 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

## Contrast

Popover text on white: dark slate (≥ WCAG AA for body). Primary button: slate-900 on white. Underline: rose on typical light composer backgrounds.

## Motion

- Underline: short opacity fade-in (~120ms), no loops.
- Popover: spring-ish ~200ms scale/opacity; no perpetual animation.
