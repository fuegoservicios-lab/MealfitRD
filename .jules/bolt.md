## 2024-06-18 - RegExp replacing
**Learning:** For hot-path text manipulation (like HTML escaping), aggregate multiple static dictionary string replacements into a single pre-compiled `RegExp` object mapped to a replacement dictionary, rather than running sequential `.replace()` operations inside a loop. This improves performance from O(N) to O(1).
**Action:** Always refactor sequential string `.replace()` calls to use a single dictionary and pre-compiled regex.
