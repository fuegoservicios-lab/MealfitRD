## 2024-06-01 - Optimize multiple string replacements

**Learning:** When performing multiple sequential string replacements against static dictionaries or "stop words" in an array (like cleaning up strings), executing `String.replace` repeatedly with newly instantiated `RegExp` objects inside a loop is slow and creates unnecessary GC pressure.

**Action:** Aggregate static dictionaries/stop words into a single pre-compiled `RegExp` object (e.g., using `.join('|')`) outside of the component or loop. This changes the regex compilation overhead from O(N) per invocation to O(1) across the entire component lifecycle.
