## 2026-05-24 - Accessible Icon-Only Buttons
**Learning:** Icon-only buttons (like Plus/Minus/Delete) in this app require explicit `type="button"`, descriptive `aria-label`, and `aria-hidden="true"` on the internal SVG to prevent screen readers from redundantly announcing the icon, ensuring a clean and accessible user experience without visual changes.
**Action:** Always add `type="button"`, `aria-label`, and `aria-hidden="true"` to SVGs within icon-only buttons across all components.
