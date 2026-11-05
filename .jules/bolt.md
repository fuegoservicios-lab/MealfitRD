## 2025-02-18 - HTML RegExp escaping dictionary mapping
**Learning:** For hot-path text manipulation (like HTML escaping during PDF generation) that uses multiple string characters replacements, multiple sequential `.replace()` chains result in string allocations scaling at O(M*N), impacting JS main thread processing on larger lists.
**Action:** Always map string replacement sequences to a dictionary map and compile them down to a single regex pass.
