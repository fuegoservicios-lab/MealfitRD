
## 2026-07-04 - Programmatic Accessibility in Expandable UI
**Learning:** Found multiple instances where interactive toggles (like account menus and mobile "more info" lists) lacked `aria-controls` linkage to their dynamic DOM containers, causing screen readers to miss structural context when expanding elements.
**Action:** Always map toggle buttons dynamically expanding UI structures with corresponding `aria-controls` matched to the expanded element's `id` for comprehensive screen reader support.
