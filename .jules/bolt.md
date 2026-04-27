## 2024-05-18 - Optimize Sequential RegExp Replacement
**Learning:** In highly nested iterations inside `useMemo` hooks (e.g. `normalizeNameAlt` in `Dashboard.jsx`), recreating an array of words and then iterating to perform `new RegExp()` 39 times per call caused huge GC overhead and massive execution times (171s vs 2s for 1M operations in ad-hoc testing).
**Action:** Always extract static dictionaries to module scope and precompile single multi-word Regular Expressions using `join('|')` when normalizing high-throughput data lists.
