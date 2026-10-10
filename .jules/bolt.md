
## 2024-05-24 - Pre-compiled RegExp for String Manipulation
**Learning:** For hot-path text manipulation (like HTML escaping during PDF generation), aggregate multiple static dictionary string replacements into a single pre-compiled `RegExp` object mapped to a replacement dictionary, rather than running sequential `.replace()` operations. Sequential replaces result in O(M*N) passes, whereas a single pre-compiled RegExp pass reduces the time complexity to O(N).
**Action:** Use a single pre-compiled `RegExp` character class (e.g. `/[&<>"']/g`) combined with a mapping object `replace(re, (chr) => map[chr])` when replacing multiple individual characters in hot paths instead of chained `.replace()` calls.
