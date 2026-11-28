// [P1-EATEN-DONUT-CONTRAST · 2026-07-28] Guard parser-based que ancla la
// severidad del grayscale que `.detail.eaten` aplica a `.macros`.
//
// Historia: P1-EATEN-RECIPE-DONE desaturó TODO el pane `.detail.eaten` con
// un solo `filter: grayscale(.92)` en el ancestro. Eso colapsaba los 3
// colores de MACROS (recipesData.js) — Carbos (#818CF8) y Grasas (#FB7185)
// difieren solo 1.69/255 en luma, así que a a=.92 ambos convergen al MISMO
// gris (separación RGB ~14 tras el filtro) y la dona pasaba de 3 segmentos
// legibles a 2. El primer fix excluyó `.macros` por completo del selector
// del ancestro (`> *:not(.macros)`) — correcto en la mecánica (un
// descendiente no puede opt-out de un `filter` de ancestro; el subárbol se
// rasteriza a un solo buffer, ver CSS Filter Effects), pero dejó `.macros`
// a color 100% dentro de un pane por lo demás gris: una "isla brillante"
// que lee como highlight o bug de render, no como "archivado". El fix
// final le da a `.macros` su PROPIO filtro más suave (a=.55).
//
// Este test protege AMBAS direcciones de regresión:
//   1. Que `.macros` no vuelva a colapsar Carbos/Grasas (a demasiado alto).
//   2. Que `.macros` no vuelva a quedar sin filtrar (a=0, la isla brillante).
//
// Los colores se LEEN de recipesData.js (nunca hardcodeados) — si el tema
// de MACROS cambia, este test recalcula la separación real contra los hex
// vigentes en vez de pinchar en un snapshot de colores viejos.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RECIPES_DIR = path.resolve(__dirname, '..', 'components', 'recipes');
const DESKTOP_CSS_PATH = path.join(RECIPES_DIR, 'RecipesView.module.css');
const MOBILE_CSS_PATH = path.join(RECIPES_DIR, 'MobileRecipes.module.css');
const RECIPES_DATA_PATH = path.join(RECIPES_DIR, 'recipesData.js');

const recipesDataSrc = fs.readFileSync(RECIPES_DATA_PATH, 'utf-8');

// --- 1. [P1-MACRO-BARS-SEMAFORO · 2026-11-27] La dona ya no lleva colores: tres TONOS de la tinta ----------
// (`--macro-tono-p/c/g`, index.css). Se distinguen por luminosidad, y `grayscale()` conserva la luminosidad: el colapso
// Carbos/Grasas que originó este test ya no puede ocurrir por construcción. Lo que se ancla ahora es esa premisa.
const INDEX_CSS = fs.readFileSync(path.resolve(__dirname, '..', 'index.css'), 'utf-8');
const tonoDe = (slot) => (recipesDataSrc.match(new RegExp(`key:\\s*'${slot}'[^}]*?c:\\s*'(var\\(--macro-tono-[pcg]\\))'`)) || [])[1];
const mezclaDe = (letra) => {
    const m = INDEX_CSS.match(new RegExp(`--macro-tono-${letra}:\\s*(?:var\\(--text-main\\)|color-mix\\(in srgb, var\\(--text-main\\) (\\d+)%, transparent\\));`));
    if (!m) return null;
    return m[1] ? Number(m[1]) : 100;
};

// --- 3. Alpha efectivo aplicado a `.macros` en el estado eaten -------------
// Dos formas legítimas en que `.macros` podría terminar con un grayscale
// efectivo: (a) una regla propia (`.detail.eaten .macros { filter:
// grayscale(N) }`), o (b) heredado de un ancestro que NO lo excluya (p.ej.
// si alguien retira `:not(.macros)` del selector del ancestro, el subárbol
// entero — incluido `.macros` — se rasteriza junto, ver comentario largo en
// el CSS). Si el ancestro SÍ excluye `.macros` (`:not(.macros)`) y no hay
// regla propia, `.macros` queda sin ningún filter — alpha efectivo = 0.
function effectiveMacrosAlpha(css) {
    const ownRule = css.match(/\.detail\.eaten\s+\.macros\s*\{\s*filter:\s*grayscale\(([\d.]+)\)/);
    if (ownRule) {
        return { alpha: parseFloat(ownRule[1]), source: 'own-rule' };
    }

    const ancestorExcludesMacros = /\.detail\.eaten\s*>\s*\*\s*:not\(\.macros\)\s*\{\s*filter:\s*grayscale\(/.test(css);
    if (ancestorExcludesMacros) {
        // `.macros` está fuera del selector del ancestro y no tiene regla
        // propia => ningún filter le aplica. Isla brillante.
        return { alpha: 0, source: 'excluded-unfiltered' };
    }

    // El ancestro no excluye `.macros` explícitamente — heredaría su alpha
    // vía rasterización del subárbol.
    const ancestorBare = css.match(/\.detail\.eaten(?:\s*>\s*\*)?\s*\{\s*filter:\s*grayscale\(([\d.]+)\)/);
    if (ancestorBare) {
        return { alpha: parseFloat(ancestorBare[1]), source: 'inherited-ancestor' };
    }

    return { alpha: 0, source: 'no-filter-found' };
}

describe('P1-EATEN-DONUT-CONTRAST — `.macros` archivado, ni colapsado ni isla brillante', () => {
    it('la dona usa tres tonos distintos de la tinta (separados en luminosidad, inmunes a grayscale)', () => {
        expect(tonoDe('protein')).toBe('var(--macro-tono-p)');
        expect(tonoDe('carbs')).toBe('var(--macro-tono-c)');
        expect(tonoDe('fats')).toBe('var(--macro-tono-g)');
        const [p, c, g] = ['p', 'c', 'g'].map(mezclaDe);
        expect([p, c, g].every((x) => x !== null)).toBe(true);
        // al menos 20 puntos de tinta entre tonos vecinos: legibles como tres segmentos con o sin filtro
        expect(p - c).toBeGreaterThanOrEqual(20);
        expect(c - g).toBeGreaterThanOrEqual(20);
    });

    it.each([
        ['desktop (RecipesView.module.css)', DESKTOP_CSS_PATH],
        ['mobile (MobileRecipes.module.css)', MOBILE_CSS_PATH],
    ])('%s: `.macros` sigue atenuado con el resto del plato comido (no queda como isla)', (_label, cssPath) => {
        const css = fs.readFileSync(cssPath, 'utf-8');
        const { alpha, source } = effectiveMacrosAlpha(css);
        expect(alpha, `esperaba un filter grayscale > 0 en .macros (fuente detectada: ${source})`).toBeGreaterThan(0);
    });
});
