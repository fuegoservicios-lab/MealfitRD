## 2024-11-20 - [O(n) to O(1) Array to Set Lookup in Render]
**Learning:** Repeatedly calling `.includes()` on an array inside a `.filter()` or `.sort()` during rendering causes unnecessary O(n*m) complexity overhead.
**Action:** Always convert lookup arrays to a `Set` using `useMemo` to ensure O(1) lookups in performance-sensitive areas, especially inside JSX rendering logic.
