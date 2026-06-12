## 2024-06-12 - AssessmentContext Local Storage Lazy Init
**Learning:** The memory mentions 'In `AssessmentProvider`, initialize state from `localStorage` using the function form of `useState` (lazy initialization) to ensure synchronous `localStorage.getItem` and `JSON.parse` operations only execute once during initial mount, rather than on every re-render.'
**Action:** Hoist `safeLocalStorageGet` calls into the lazy initializer function of `useState`.
