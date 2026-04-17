## 2024-05-24 - [O(1) lookups in performance-sensitive React logic]
**Learning:** Using `Array.prototype.includes` inside render-cycle `.sort()` and `.filter()` operations can be slow for large arrays, as it makes the lookup O(N), bringing sorting to O(N^2 log N).
**Action:** Convert lookup arrays to `Set` instances using `useMemo` to ensure O(1) lookup time and prevent unnecessary re-computations.
