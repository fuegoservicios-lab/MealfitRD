## 2025-06-25 - Single-Pass RegExp Replacement for Hot-Path Text Manipulation
**Learning:** For hot-path text manipulation (like HTML escaping during PDF generation), sequential `.replace()` operations result in O(M*N) passes over the string.
**Action:** Use a single pre-compiled `RegExp` object mapped to a replacement dictionary instead. This reduces the time complexity to O(N).
