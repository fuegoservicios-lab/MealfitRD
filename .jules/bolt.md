## 2024-05-24 - Optimize sequential String.prototype.replace
**Learning:** For hot-path text manipulation (like HTML escaping), running multiple sequential `.replace()` operations results in O(M*N) time complexity (where M is the number of replacements and N is the string length).
**Action:** Aggregate multiple static dictionary string replacements into a single pre-compiled `RegExp` object mapped to a replacement dictionary. This reduces the time complexity to O(N) since the string is processed in a single pass.
