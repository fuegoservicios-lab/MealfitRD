
## 2023-10-27 - [Precompiling regex to improve performance]
**Learning:** Instantiating `RegExp` objects inside a loop that runs multiple times per render (in this case, string normalization) allocates memory pointlessly. We must aggregate sequence replacements into pre-compiled regex objects stored outside the component.
**Action:** When evaluating sequential string replacements (`.replace`) against a static dictionary of words or a regular expression pattern, always combine them into a single `RegExp` using `.join('|')` or similar techniques, and hoist the instantiation outside the function or component. This converts O(N) regex creations into O(1).
