
## 2024-05-18 - [Optimizing array mapping using pre-compiled regex]
**Learning:** Pre-compiling `RegExp` objects outside of the component body prevents excessive object instantiation, garbage collection pressure, and CPU overhead during re-renders, especially when iterating over arrays or large chunks of strings continuously. The specific learning here is that the loop over 39 stop words with `new RegExp` executed per iteration per ingredient was significantly unoptimized.
**Action:** When a React component processes a large list of string replacements dynamically, aggregate replacements (e.g., using `join('|')`) into a single, pre-compiled `RegExp` constant outside of the component definition.
