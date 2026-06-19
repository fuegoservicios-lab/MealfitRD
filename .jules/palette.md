## 2026-06-13 - Icon-only button accessibility in ChatWidget
**Learning:** Found an icon-only "Send" button in `ChatWidget.jsx` without an `aria-label`. When adding `aria-label` to the button, it's also crucial to add `aria-hidden="true"` to the internal Lucide React icon (`<Send />`) to prevent screen readers from announcing redundant or confusing information.
**Action:** Always pair `aria-label` on icon-only buttons with `aria-hidden="true"` on the child icon component across the application.
