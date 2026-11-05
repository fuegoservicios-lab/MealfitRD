## 2024-05-18 - Optimize HTML escaping performance

**Learning:** When performing string manipulation on the hot-path (e.g., HTML escaping during PDF generation or dynamic rendering), using sequential `.replace(/regex/g, 'string')` passes over the same input string creates severe performance degradation. It forces the JavaScript engine to allocate multiple intermediate strings and results in an O(M*N) time complexity, where M is the number of sequential replacements and N is string length.

**Action:** Consolidate sequential `.replace()` calls into a single pre-compiled `RegExp` object mapped to a constant replacement dictionary lookup. This reduces time complexity to O(N) and minimizes garbage collection overhead.
