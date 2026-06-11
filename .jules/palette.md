## 2026-06-11 - Adding ARIA labels to icon-only buttons
**Learning:** Found that many interactive icon-only buttons in the chat components (, ) lacked s, relying solely on . While  provides tooltips,  +  on the inner SVG is the robust WAI-ARIA standard for screen readers.
**Action:** When adding icon buttons, always include  on the `<button>` and  on the inner `<Icon>` component.
## 2026-06-11 - Adding ARIA labels to icon-only buttons
**Learning:** Found that many interactive icon-only buttons in the chat components (`MessageBubble`, `ChatWidget`) lacked `aria-label`s, relying solely on `title`. While `title` provides tooltips, `aria-label` + `aria-hidden="true"` on the inner SVG is the robust WAI-ARIA standard for screen readers.
**Action:** When adding icon buttons, always include `aria-label` on the `<button>` and `aria-hidden="true"` on the inner `<Icon>` component.
