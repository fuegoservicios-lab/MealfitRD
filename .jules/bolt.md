## 2024-05-24 - First Entry\n**Learning:** Started journal\n**Action:** Follow guidelines

## 2024-05-24 - HTML escaping optimization with lookup map
**Learning:** For functions performing sequential `.replace()` operations on strings with multiple characters (like HTML escaping), compiling a single Regular Expression paired with a lookup map avoids creating multiple iterations over the entire string, significantly optimizing the process from O(M*N) to O(N).
**Action:** When finding hot-path text manipulations replacing multiple fixed strings sequentially, use `replace(regex, m => map[m])` pattern instead.
