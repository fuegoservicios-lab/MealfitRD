## 2026-05-17 - App-wide Icon Button Accessibility
**Learning:** The application has a systemic pattern of using icon-only buttons with `lucide-react` SVGs without providing accessible text or hiding the SVGs. SVGs in this app don't automatically receive `aria-hidden`, so screen readers will read the SVG node natively or announce a blank button.
**Action:** Always add `aria-label="[Descriptive Spanish Text]"` to the `<button>` and `aria-hidden="true"` to the nested `lucide-react` `<Icon />` component to ensure a clean accessibility tree.
