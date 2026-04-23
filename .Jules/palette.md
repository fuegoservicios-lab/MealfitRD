## 2024-05-18 - Missing ARIA Labels on Icon-Only Buttons
**Learning:** Icon-only buttons used for actions like "Edit", "Cancel", "Rename", "Delete", and "Close" throughout `src/pages/History.jsx` were lacking `aria-label`s, making them inaccessible to screen readers. The application is in Spanish.
**Action:** Added descriptive Spanish `aria-label` attributes to these buttons to improve accessibility while maintaining the existing design.
