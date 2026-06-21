## 2026-06-01 - Replace Regex Object creation with static constants to improve performance
**Learning:** Compiling regex patterns in loop operations and hot-paths can incur high overhead (O(M*N)).
**Action:** Extract pre-compiled regex objects or static mappings outside of functions/render cycles to avoid memory reallocation overhead and optimize string replacement performance.
