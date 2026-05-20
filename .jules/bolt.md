## 2026-05-20 - [Optimize ingredient stop-word replacement in normalization]
**Learning:** O(N) regular expression re-instantiation per loop item inside map functions causes massive performance degradation on loops inside components.
**Action:** Lift static array conversions into global static Regular Expression instances outside of React components.
