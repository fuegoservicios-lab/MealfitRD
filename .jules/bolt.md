## 2024-05-15 - [O(1) Set Lookups in Render Logic]
**Learning:** In React functional components, repeatedly calling `.includes()` on arrays like `disabledIngredients` within loops (`.filter()`, `.map()`, `.sort()`) causes hidden O(N^2) or O(N*M) time complexity during render, especially bad when handling larger lists like inventories or recipe plans.
**Action:** Convert small lookup arrays into `Set` instances using `useMemo` so that the loop iterations perform O(1) `.has()` checks instead of O(N) `.includes()` scans. Apply this pattern consistently across all heavy rendering iterations.
