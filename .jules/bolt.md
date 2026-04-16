## 2023-10-27 - Memoize ProgressBar in TrackingProgress
**Learning:** Found a component (`ProgressBar`) that was being repeatedly re-rendered due to a `setInterval` in the parent component (`TrackingProgress`), causing unnecessary React reconciliation overhead.
**Action:** Use `React.memo` to memoize child components that take pure props when their parent frequently updates its state but doesn't change the props passed to the child. This prevents wasteful renders.
