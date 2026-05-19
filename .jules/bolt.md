## 2024-05-19 - [Hoisting RegEx from Render Loop in Dashboard.jsx]
**Learning:** O(N) regex instantiation within loop iterators (like the normalizeName functionality looping over stop words) inside dynamic React components incurs a high CPU and GC penalty, specifically for operations mapped over the entire frontend inventory matching.
**Action:** Always extract and combine "stop words" or static dictionaries into a single pre-compiled RegExp object via join('|') at the module level (outside the component) to turn O(N) operations into O(1).
