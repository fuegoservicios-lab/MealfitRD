## 2024-06-23 - ARIA Labels on Navigation Icons
**Learning:** Icon-only navigation buttons like `ChevronLeft` in the assessment layout lacked accessible labels and hid the decorative icons, which means screen readers would only announce "button" without context.
**Action:** Always add `aria-label` to icon-only interactive elements and `aria-hidden="true"` to the inner SVG icons across the design system to ensure screen readers provide correct navigation context.
