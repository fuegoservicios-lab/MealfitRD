## 2026-06-24 - Pre-compiled Regex for string escaping
**Learning:** For hot-path text manipulation (like HTML escaping during PDF generation), pre-compiling a single `RegExp` mapped to a replacement dictionary is ~20% faster than chaining multiple `.replace()` calls, bypassing the O(M*N) problem and simplifying logic.
**Action:** Always prefer a single `RegExp` with a dictionary for multi-character replacements in hot paths.
