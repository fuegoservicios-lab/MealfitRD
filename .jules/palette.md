## 2023-10-27 - Icon Accessibility in Buttons
**Learning:** For icon-only buttons, applying `aria-label` to the `<button>` element is not sufficient alone; screen readers may redundantly announce the SVG unless it is explicitly marked with `aria-hidden="true"`.
**Action:** When adding `aria-label` to a button that solely contains an SVG (like a Lucide react icon), always pass `aria-hidden="true"` as a prop to the icon component.
