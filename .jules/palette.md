
## 2024-06-20 - Adding ARIA labels to SVG icon buttons
**Learning:** Adding `aria-label`s to `<button>` elements with icon-only content helps screen reader users understand their functionality. Adding `aria-hidden="true"` to the internal SVG element is an important companion step so that screen readers don't announce "button, [SVG element]" redundantly or poorly.
**Action:** Always include `aria-hidden="true"` on inner SVG icons when the parent button relies solely on an `aria-label` for its accessible name.
