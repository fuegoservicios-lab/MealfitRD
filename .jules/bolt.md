## 2024-04-24 - [O(n) Array Includes in Render Cycles]
**Learning:** React component render cycles with large lists (e.g. ingredient tracking arrays) suffer from significant performance degradation when array methods like `.includes()` are used inside `filter()`, `map()`, or `sort()` loops, converting otherwise straightforward linear logic into quadratic complexity.
**Action:** Always convert lookup arrays into `Set` data structures inside a `useMemo` block prior to using them within iterative methods during render, guaranteeing O(1) performance and scaling smoothly.
