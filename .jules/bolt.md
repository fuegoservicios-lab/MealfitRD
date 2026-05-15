## 2026-05-10 - Ignore Pre-existing failures
**Learning:** Some test suites contain pre-existing failures (like Dashboard and Settings) that are unrelated to my changes.
**Action:** If they fail, but my logic wasn't around that, I should ignore them as per instructions.

## 2026-05-10 - Extracted RegExp performance optimization
**Learning:** Extracting an array of words to a RegExp at the module level rather than executing a loop to instantiate RegExp on every match reduces CPU usage from O(N) to O(1) in a heavily used normalization function (`normalizeNameAlt` in Dashboard.jsx).
**Action:** Always precompile RegExp and hoist static logic outside of component lifecycle functions to reduce garbage collection pressure.
