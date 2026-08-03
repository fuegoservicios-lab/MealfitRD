# design-sync NOTES — MealfitRD UI

Repo-specific gotchas for future syncs. The DS source is the **frontend app** (`frontend/`), not a separate library package.

## Re-sync 2026-08-02 — what changed (read this first)

- **The old project was DELETED upstream.** `cfg.projectId` pointed at `98197eed-…`, which 404s. Re-synced into a **new** project `MealfitRD UI` = `8b06f890-e455-47ab-989a-9ac280ded7b1`, and repinned the config. Note the account also has a *different*, hand-built design system named **`MealfitRD` (`abacba03-…`)** — Badge/Button/Card/MacroBar/etc. plus a login template and exports. **That is NOT this repo's output — never sync into it**, a full-writes plan would overwrite its root files.
- **`HowItWorks` now needs a router** (drift: 10 commits since June). It renders `SeeMoreLink` → react-router `<Link>`, so outside a Router it throws `Cannot destructure property 'basename' of React.useContext(...)` and the card renders empty. Fixed with `cfg.provider = {component: "MemoryRouter"}`, wired by re-exporting `MemoryRouter` from `entry.jsx` (excluded from the component list via `componentSrcMap.MemoryRouter = null`, so it stays 23 components while living in the bundle). **Don't delete that export** — it looks unused but the provider resolves against the bundle's export list.
- **`[FONT_MISSING] "JetBrains Mono"`** appeared because `--font-mono` was added to `index.css`. It is only ever a *fallback* inside a complete stack (`ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace`) — the app never ships that woff2 and never intended to. Suppressed with `cfg.runtimeFontPrefixes: ["JetBrains Mono"]`. This is the honest resolution, not a rationalization: the first entry (`ui-monospace`) resolves on every platform.
- **`HowItWorks` card sizing**: it's a full landing section, so it first tripped `[GRID_OVERFLOW]` and then rendered clipped. `cardMode: "column"` did NOT fix the vertical crop. Final override is `{"cardMode":"single","primaryStory":"Default","viewport":"1040x920"}` — content measures ~860px tall, so 920 frames it with minimal slack. **Changing `cardMode`/`viewport` fails `preview-rebuild.mjs` with `[CONFIG_STALE]` — you must run the full `package-build.mjs` to re-stamp grade keys.**
- **A 4th theme value `data-theme="paper"`** now exists (marketing routes only, P2-PAPER-NO-INK). `conventions.md` was corrected for this and for the router exception; its old blanket claim "No React provider is required" was wrong for HowItWorks.
- All 19 authored previews were force-recaptured and re-graded `good` this run; the 4 floor cards are unchanged.

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

- **The DS source is the live app, so any app refactor is DS drift.** June→August produced 625 commits and two real breaks (router in `HowItWorks`, new mono token). Always run the render check; don't assume carried-forward grades mean carried-forward correctness — **grades key off the authored `.tsx` + preview config, NOT the component source**, so an upstream rewrite of a component leaves its grade untouched. On a re-sync after heavy app churn, prefer `package-capture.mjs --force` and actually look at the sheets (that is how the `HowItWorks` clipping was caught).
- **`cfg.provider` is now load-bearing.** It wraps *every* preview. If a future component needs a different context, nest it via `provider.inner` rather than replacing `MemoryRouter`.
- **`entry.jsx` and `componentSrcMap` must stay in sync** (23 components + the `MemoryRouter` provider export). Adding a component means editing both.
- **Preview mock data is inlined** in `.design-sync/previews/*.tsx` (e.g. MicronutrientPanel's `report`/`advice` shapes). If a component's prop shape changes upstream, its preview may render wrong — re-grade from the fresh sheet.
- **MinimalAvatar** preview uses hardcoded avatar ids (the barrel exports only the `MinimalAvatar` component, not the `MINIMAL_AVATARS` array). If avatar ids change in source, update the preview's id list.
- **Floor-card set** is tied to upstream animation code — if a modal gains `initial={false}` (or the harness learns to settle animations), it becomes authorable.
- **guidelines/** swept in `frontend/docs/*.md` (e.g. `csp_enforcement_readiness.md`) via the default glob — not a real design guideline, harmless. Narrow `cfg.guidelinesGlob` if it becomes noise.
