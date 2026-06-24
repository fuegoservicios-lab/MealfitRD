# MealfitRD UI — how to build with these components

MealfitRD is a Dominican-Spanish (es-DO) nutrition app. This library is a **curated subset** of its production React components: icons, form primitives, common widgets, and a few dashboard/marketing pieces. All copy should be Spanish (es-DO).

## Setup & theming

- **No React provider is required.** These components are prop-driven and style themselves from **global CSS custom properties** (design tokens) and `@font-face` rules shipped in `styles.css`. As long as `styles.css` is loaded, components render on-brand. There is no ThemeProvider/context to wrap.
- **Theme** is switched by setting `data-theme="dark"` on the `<html>` element. The default (no attribute) is the **light** theme. Tokens remap automatically — never hardcode hex colors; use the token variables below so a component works in both themes.
- **Fonts**: headings use **Outfit** (`var(--font-heading)`), body uses **Plus Jakarta Sans** (`var(--font-body)`). Both ship in the bundle.

## Styling idiom — CSS custom properties (tokens)

Components are styled internally with CSS Modules; for **your own layout glue around them, style with the design tokens** (`var(--token)`), never raw colors. The real token vocabulary (defined in the shipped CSS):

| Group | Tokens |
|---|---|
| Surfaces | `--bg-page`, `--bg-card`, `--bg-muted`, `--bg-glass` |
| Text | `--text-main`, `--text-muted`, `--text-light` |
| Borders | `--border`, `--border-light` |
| Brand | `--primary`, `--primary-dark`, `--primary-light`, `--secondary`, `--accent` |
| Status | `--danger` / `--danger-bg` / `--danger-text`, `--warning` / `--warning-bg` / `--warning-text` |
| Radius | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-full` |
| Shadow | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-glow-primary` |
| Fonts | `--font-heading` (Outfit), `--font-body` (Plus Jakarta Sans) |

**Icons** (`ProteinIcon`, `FlameMacroIcon`, `FatDropIcon`, `WheatFilledIcon`, `RecipesIcon`, `AgentIcon`) are SVGs sized with a `size` (px) prop and **filled via `currentColor`** — set `color` on a parent to tint them.

**Form primitives** (`Input`, `Select`, `TextArea`, `Label`, `Checkbox`, `RadioCard`) carry the DS styling on their own root — render them directly; for `Checkbox`/`RadioCard` pass `checked` + `onChange`, with `label`/`desc`; `RadioCard` also takes an `icon` (any of the icons).

## Where the truth lives

- Tokens & fonts: read `styles.css` and its `@import` closure (it pulls `_ds_bundle.css`, where the `:root` token values live, and `fonts/fonts.css`).
- Per-component API: `<Name>.d.ts`. Usage notes: `<Name>.prompt.md`. (This is JSX, not TypeScript, so prop typings are minimal — lean on the prompt docs and previews.)

## Idiomatic example

```jsx
import { RadioCard, ProteinIcon, MicronutrientPanel } from 'mealfit-rd-ia';

function GoalStep() {
  return (
    <div style={{ display: 'grid', gap: 'var(--radius-md)', maxWidth: 360,
                  fontFamily: 'var(--font-body)', color: 'var(--text-main)' }}>
      <RadioCard name="goal" value="muscle" label="Ganar músculo"
                 desc="Superávit + alta proteína" icon={ProteinIcon}
                 checked onChange={() => {}} />
      <RadioCard name="goal" value="lose" label="Bajar grasa"
                 desc="Déficit calórico controlado" icon={ProteinIcon}
                 checked={false} onChange={() => {}} />
    </div>
  );
}
```
