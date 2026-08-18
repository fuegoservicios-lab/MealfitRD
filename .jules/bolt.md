## 2024-05-24 - Single pre-compiled RegExp for hot-path text manipulation
**Learning:** For hot-path text manipulation, aggregating multiple static dictionary string replacements into a single pre-compiled `RegExp` object rather than running sequential `.replace()` operations improves performance.
**Action:** When encountering sequential `.replace()` calls on a string, use a pre-compiled `RegExp` with a replacement dictionary object.
