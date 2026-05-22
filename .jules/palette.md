## 2026-05-13 - Missing aria-hidden on inner SVGs of icon-only buttons
**Learning:** Even when icon-only buttons have an `aria-label`, some screen readers might still try to read the inner SVG element, resulting in confusing announcements like "button, [svg content]".
**Action:** Always add `aria-hidden="true"` to the internal SVG component (e.g., `<Plus aria-hidden="true" />`) inside icon-only buttons to prevent redundant and confusing screen reader output. This ensures only the button's `aria-label` is announced.
