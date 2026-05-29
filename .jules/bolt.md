
## 2026-05-29 - AssessmentProvider LocalStorage reads on render
**Learning:** `safeLocalStorageGet` and `JSON.parse` were invoked outside `useState` initialization functions inside the `AssessmentProvider`, causing synchronous reading of localStorage and parsing on every single re-render of the root React Context provider.
**Action:** Always place side effects, storage reads, and expensive initial operations inside the lazy initialization callback of `useState` (e.g. `useState(() => { return initValue; })`) to ensure they run only on mount.
