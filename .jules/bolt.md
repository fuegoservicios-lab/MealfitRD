## 2026-05-27 - Optimize ingredient name normalization performance
**Learning:** Recreating `new RegExp` objects in a loop for static string replacements and redefining static dictionary objects inside `.map()` callbacks within frequently called utility functions like `normalizeNameAlt` causes significant overhead (O(N) replacements and constant object reallocation).
**Action:** Hoist static dictionaries and pre-compile `RegExp` objects containing aggregated strings (e.g., using `.join('|')`) outside of component bodies to reduce instantiation overhead to O(1).
