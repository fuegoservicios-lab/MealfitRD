## 2024-05-19 - Dashboard.jsx Optimization
**Learning:** Found multiple instances of O(n) `.includes()` checks inside `.filter()` and `.sort()` array iterations based on the `disabledIngredients` state variable.
**Action:** Always memoize array lookups into a `Set` using `useMemo` for React state variables that are used as exclusion/inclusion lists inside map/filter/sort array methods, reducing time complexity from O(n*m) to O(n+m).
