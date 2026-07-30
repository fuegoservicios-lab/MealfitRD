## 2025-02-20 - Performance Optimization for string escaping
**Learning:** Sequential `.replace()` operations (e.g. `.replace(/&/g, '&amp;').replace(/</g, '&lt;')...`) are highly inefficient for processing large strings as they create O(M*N) passes and multiple intermediate string allocations.
**Action:** Always aggregate multiple static dictionary string replacements into a single pre-compiled `RegExp` object (using character classes like `/[&<>"']/g`) mapped to a replacement dictionary. This reduces the time complexity to O(N) and prevents intermediate memory allocations.
