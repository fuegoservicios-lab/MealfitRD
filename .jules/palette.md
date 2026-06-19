## 2026-06-03 - Icon-only buttons accessibility
**Learning:** Icon-only buttons need an `aria-label` on the button tag itself and an `aria-hidden="true"` on the internal SVG to avoid duplicate screen reader announcements.
**Action:** Always add `aria-hidden="true"` to SVG icons inside buttons that already have an `aria-label`.
