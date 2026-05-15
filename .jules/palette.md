## 2024-05-15 - ARIA Labels on Icon-Only Buttons
**Learning:** Adding `aria-label` to icon-only buttons is crucial for screen reader accessibility, as they otherwise only announce "button". Furthermore, when adding `aria-label` to the parent `<button>`, the inner SVG icon (e.g. from lucide-react) should receive `aria-hidden="true"` to prevent redundant screen reader announcements.
**Action:** Always ensure icon-only buttons include an `aria-label` attribute on the button element and an `aria-hidden="true"` attribute on the child icon element.
