
## $(date +%Y-%m-%d) - [Password Toggle Keyboard Accessibility]
**Learning:** Found a recurring pattern in the authentication forms (`Login.jsx`, `Register.jsx`, `ResetPassword.jsx`) where password visibility toggles were explicitly removed from the tab order (`tabIndex="-1"`). This completely breaks keyboard navigation for a critical security/usability feature.
**Action:** When auditing forms, specifically check custom input adornments (like eye icons) to ensure they haven't been artificially removed from the document flow via `tabIndex`, and always ensure they have explicit `:focus-visible` styling to guide keyboard users.
