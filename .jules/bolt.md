## 2025-02-20 - HTML Escape Optimization
**Learning:** Found sequential string replace calls for `escapeHtml` (`src/utils/escapeHtml.js` and `src/utils/shoppingHelpers.js`) which require O(N*M) passes for M string replacements over N string lengths.
**Action:** Replaced sequential string replaces with a single pre-compiled regular expression using a lookup dictionary map (`/[&<>"']/g` -> `HTML_ESCAPE_MAP`) to reduce string parsing complexity to O(N).
