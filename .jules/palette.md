## 2026-06-24 - ARIA label pattern for icon-only navigation buttons
**Learning:** Found an icon-only back button in the assessment flow layout that lacked an `aria-label`. In navigational layouts like wizards or multistep flows, it is critical to ensure screen readers can read these controls.
**Action:** Add `aria-label` to the container `<button>` and `aria-hidden="true"` to the internal SVG icon to prevent redundant readouts when adding navigation icons.
