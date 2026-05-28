## 2026-05-24 - Precompiled Regular Expressions and Constant Object Hoisting
**Learning:** Instantiating `new RegExp` objects in an inner loop for sequential string replacement causes severe O(N) performance overhead. Using `.map()` with large static mapping objects reallocates memory inside each iteration.
**Action:** Always pre-compile regular expressions representing multiple patterns into a single `RegExp` object via `join('|')` outside the execution loop, and hoist static dictionaries/maps out of the component or loop closures.
