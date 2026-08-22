## 2025-03-04 - Pre-compile RegExp for HTML escaping
**Learning:** Sequential string replacement with `.replace()` chaining for HTML escaping (`&`, `<`, `>`, `"`, `'`) creates multiple passes and memory allocations, resulting in O(M*N) time complexity. This is especially impactful in hot paths like PDF generation string processing.
**Action:** Always pre-compile a regex pattern representing the target characters (e.g., `/[&<>"']/g`) and use a replacement dictionary mapper to reduce string manipulations to a single O(N) pass.
