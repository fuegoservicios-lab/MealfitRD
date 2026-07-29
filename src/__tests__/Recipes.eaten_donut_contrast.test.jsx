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

// --- 1. Colores reales de MACROS, leídos de recipesData.js -----------------
// Cada entrada del array `MACROS` vive en una sola línea con la forma
// `{ k: '...', key: '<slot>', c: '#RRGGBB', kcal: N }` — capturamos `key` y
// `c` de la MISMA línea para no cruzar entradas. Si alguien re-temiza los
// colores (o reordena kcal/k), esta extracción sigue funcionando mientras
// `key` preceda a `c` dentro de la misma entrada.
function macroHexFor(slotKey) {
    const re = new RegExp(`key:\\s*'${slotKey}'[^}]*?c:\\s*'(#[0-9A-Fa-f]{6})'`);
    const match = recipesDataSrc.match(re);
    if (!match) {
        throw new Error(`No se encontró el color de MACROS para key='${slotKey}' en recipesData.js — ¿cambió el shape del array?`);
    }
    return match[1];
}

const CARBS_HEX = macroHexFor('carbs');
const FATS_HEX = macroHexFor('fats');

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// --- 2. Matemática del filtro CSS -------------------------------------------
// `filter: grayscale(a)` por spec (CSS Filter Effects §grayscale):
//   out = (1 − a)·C + a·L,  L = 0.2126R + 0.7152G + 0.0722B
// Implementación independiente de producción (no existe equivalente en JS —
// es puro comportamiento de compositing del navegador) para poder derivar
// la separación RGB real post-filtro a partir de cualquier a.
function luma([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function applyGrayscale([r, g, b], alpha) {
    const l = luma([r, g, b]);
    return [(1 - alpha) * r + alpha * l, (1 - alpha) * g + alpha * l, (1 - alpha) * b + alpha * l];
}
function rgbDistance(a, b) {
    return Math.sqrt(a.reduce((sum, x, i) => sum + (x - b[i]) ** 2, 0));
}

function separationAtAlpha(alpha) {
    const carbs = applyGrayscale(hexToRgb(CARBS_HEX), alpha);
    const fats = applyGrayscale(hexToRgb(FATS_HEX), alpha);
    return rgbDistance(carbs, fats);
}

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

// --- 4. Piso de separación --------------------------------------------------
// A a=0 (sin filtrar) la separación real es ~170; a a=.55 (valor vigente)
// cae a ~77 (~45% de lo original); a a=.92 (el defecto original) colapsa a
// ~14. 50 se eligió como piso porque dentro del rango legítimo de "mudado
// pero perceptible" (α hasta ~.70 con estos hex, ver tabla abajo) sigue
// pasando, pero deja de pasar bastante antes de llegar a la zona de colapso
// real de estos colores concretos (~.85-.92) — headroom para futuros
// ajustes de α sin acoplar el test al valor exacto .55.
//   α    separación
//   .00  169.8
//   .55   76.5  (valor vigente)
//   .70   51.1  (empieza a acercarse al piso)
//   .92   14.0  (el defecto original — colapso real)
const MIN_SEPARATION = 50;

describe('P1-EATEN-DONUT-CONTRAST — `.macros` archivado, ni colapsado ni isla brillante', () => {
    it('recipesData.js: Carbos y Grasas difieren realmente en RGB sin filtrar (premisa del test)', () => {
        const [cr, cg, cb] = hexToRgb(CARBS_HEX);
        const [fr, fg, fb] = hexToRgb(FATS_HEX);
        expect([cr, cg, cb]).not.toEqual([fr, fg, fb]);
        expect(separationAtAlpha(0)).toBeGreaterThan(MIN_SEPARATION);
    });

    it.each([
        ['desktop (RecipesView.module.css)', DESKTOP_CSS_PATH],
        ['mobile (MobileRecipes.module.css)', MOBILE_CSS_PATH],
    ])('%s: `.macros` tiene un filtro propio, no colapsado y no ausente', (_label, cssPath) => {
        const css = fs.readFileSync(cssPath, 'utf-8');
        const { alpha, source } = effectiveMacrosAlpha(css);

        // (4) `.macros` no puede quedar sin filtrar mientras sus hermanos sí
        // lo están — la isla brillante. Esta aserción es la ÚNICA que
        // detecta esa regresión: a alpha=0 la separación RGB es MÁXIMA
        // (~170), así que el piso de separación de abajo NO la atraparía.
        expect(alpha, `esperaba un filter grayscale > 0 en .macros (fuente detectada: ${source})`).toBeGreaterThan(0);

        // (3) La separación post-filtro real (derivada de los hex vigentes
        // de recipesData.js, no hardcodeada) se mantiene arriba del piso —
        // detecta un alpha demasiado agresivo (p.ej. volver a .92).
        const separation = separationAtAlpha(alpha);
        expect(separation, `alpha=${alpha} (${source}) da separación RGB=${separation.toFixed(1)}, por debajo del piso ${MIN_SEPARATION}`).toBeGreaterThan(MIN_SEPARATION);
    });
});
