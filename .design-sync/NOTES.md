# design-sync NOTES — MealfitRD UI

Repo-specific gotchas for future syncs. The DS source is the **frontend app** (`frontend/`), not a separate library package.

## Shape & build
- This is a private Vite **app**, not a component library: no `dist/`, no library `exports`, JSX (not TS).
- We sync a **curated subset** via a hand-written barrel entry: `.design-sync/entry.jsx` (re-exports the 23 scoped components). The build is run with `--entry ./.design-sync/entry.jsx` (esbuild bundles from source — there is no dist).
- Scope is pinned in `cfg.componentSrcMap` (all 23 names → src paths). To add/remove a component, edit BOTH `entry.jsx` and `componentSrcMap`.
- `cfg.cssEntry = src/index.css` holds the design tokens (`:root` light + `html[data-theme="dark"]`). Component CSS-module styles get bundled into `_ds_bundle.css`; tokens are appended there too (reachable via `styles.css`'s `@import` closure).
- **Fonts**: self-hosted in `public/fonts/*.woff2`, referenced by absolute `/fonts/...` URLs the converter can't resolve → wired explicitly via `cfg.extraFonts` (the 6 woff2 files). If `[FONT_DANGLING]` returns, check those paths.

## Prop contracts are thin (JSX, no TS)
- `[DTS] parsed 0 .d.ts files` is expected — the emitted `<Name>.d.ts` are minimal. Components carry PropTypes in source, but those aren't read by the ts-morph extractor. The conventions header + previews carry the real usage guidance.

## Known render warns (benign — do NOT treat as new)
- `[RENDER_THIN]` on the 6 icons (`ProteinIcon`, `FlameMacroIcon`, `FatDropIcon`, `WheatFilledIcon`, `RecipesIcon`, `AgentIcon`) and `MinimalAvatar`: these cells are **SVG-only with no text**, which trips the "no text / paints little" heuristic. Verified visually in the review/contact sheets — they render correctly. Benign.

## Floor-card components (4) — animation-gated, not failures
- `Modal`, `OptionPickerModal` (built on Modal), `LogoutConfirmModal`, `RestockNudge` ship as **floor cards**.
- Root cause: they enter via framer-motion `<AnimatePresence>` with `initial={{opacity:0,…}}` and **no `initial={false}`**. The capture pins the browser clock (`page.clock.setFixedTime`), so the enter animation never advances → stuck at opacity 0 → blank capture. (MicronutrientPanel renders because its `AnimatePresence` uses `initial={false}`.)
- `cardMode:single`+`viewport` overrides do NOT help (it's an opacity freeze, not clipping). They were tried and removed.
- To enrich later: the capture harness would need to advance the clock after load (e.g. `page.clock.fastForward(800)` in `package-capture.mjs` after `goto`+`settle`). That's a staged-script edit that won't survive a re-sync `cp -r` — re-apply each time, or accept floor cards.

## Source fix made during this sync (committed to the app)
- `src/components/common/FormUI.module.css`: added a `.textarea` rule (marker `P3-FORM-TEXTAREA-STYLE`). The `TextArea` component referenced `styles.textarea` which **did not exist** → the real app's textarea was unstyled (browser-default). The fix mirrors `.input` + textarea extras. This improves the app, not just the DS preview.

## Re-sync risks (what can go stale)
- **Preview mock data is inlined** in `.design-sync/previews/*.tsx` (e.g. MicronutrientPanel's `report`/`advice` shapes). If a component's prop shape changes upstream, its preview may render wrong — re-grade from the fresh sheet.
- **MinimalAvatar** preview uses hardcoded avatar ids (the barrel exports only the `MinimalAvatar` component, not the `MINIMAL_AVATARS` array). If avatar ids change in source, update the preview's id list.
- **Floor-card set** is tied to upstream animation code — if a modal gains `initial={false}` (or the harness learns to settle animations), it becomes authorable.
- **guidelines/** swept in `frontend/docs/*.md` (e.g. `csp_enforcement_readiness.md`) via the default glob — not a real design guideline, harmless. Narrow `cfg.guidelinesGlob` if it becomes noise.
