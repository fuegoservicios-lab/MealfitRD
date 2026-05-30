## 2024-05-30 - ARIA Labels on Icon-only Buttons
**Learning:** Found an icon-only button without an `aria-label` attribute and lacking `aria-hidden` on its interior icon component. While simple, screen-readers fail to announce context-less icon buttons properly.
**Action:** Added `aria-label="Ver paso a paso para la receta"` to the outer button and `aria-hidden="true"` to the inner Lucide icon (`<BookOpen />`). We must consistently apply both properties (`aria-label` on the wrapper, `aria-hidden` on the SVG/icon) across the design system for standard WAI-ARIA compliance.
