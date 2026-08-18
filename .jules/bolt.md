## 2026-06-17 - Optimize escapeHtml text replacements
**Learning:** Sequential  operations inside loops (e.g. O(N) replacements) create unnecessary memory reallocations and CPU overhead, especially when parsing or interpolating large templates during hot paths like PDF generation.
**Action:** Aggregate multiple static dictionary string replacements into a single pre-compiled `RegExp` object using the OR operator (e.g., `/[&<>"']/g`) and use a replacement map instead. This improves string manipulation performance to O(1) matching per character.
