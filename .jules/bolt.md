## 2024-05-13 - [Optimize Array Includes to Set Has in Render Loops]
**Learning:** Found an anti-pattern in `Dashboard.jsx` where an array (`disabledIngredients`) was repeatedly queried using `.includes()` within JSX rendering cycles (`.sort()`, `.map()`, and `.filter()`). This caused O(N) lookup overhead in tight loops.
**Action:** When filtering or sorting large lists in React using a lookup array, wrap the array in a `Set` using `useMemo` to reduce lookup complexity to O(1).
