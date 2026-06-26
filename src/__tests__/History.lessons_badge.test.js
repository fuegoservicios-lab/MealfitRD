// [P1-HIST-3 · 2026-05-09] Tests estáticos del chip de lecciones en
// History.jsx (badge "X lecciones" con icono Sparkles).
//
// Bug original (audit historial 2026-05-08):
//   El historial no exponía el conteo de lecciones acumuladas del
//   aprendizaje continuo (chunk_lesson_telemetry). El diferenciador
//   del producto era invisible en la biblioteca del usuario.
//
// Fix:
//   - Helper `getLessonsCounts()` en config/api.js → fetch a
//     /api/plans/lessons-counts (single roundtrip, devuelve dict).
//   - useEffect en History.jsx llama el endpoint al montar y guarda
//     en state local `lessonsCounts`.
//   - Render condicional: chip `<Sparkles /> N` cuando count > 0.
//   - CSS class .lessonsBadge con palette indigo (diferenciada de
//     status amber/red y caloriesBadge orange).
//
// Cobertura (regex sobre source — sin JSDOM):
//   - Import de getLessonsCounts y Sparkles.
//   - State lessonsCounts inicializado a {}.
//   - useEffect llama getLessonsCounts() y popula state via .then.
//   - Errores se silencian (.catch sin throw — feature opcional).
//   - Render usa lessonsCounts[plan.id] con guarda count > 0.
//   - CSS .lessonsBadge definida con indigo palette.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _API_PATH = join(__dirname, '..', 'config', 'api.js');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const apiSrc = readFileSync(_API_PATH, 'utf8');
const css = readFileSync(_CSS_PATH, 'utf8');

describe('[P1-HIST-3] api.js — getLessonsCounts helper', () => {
    it('exporta getLessonsCounts apuntando a /api/plans/lessons-counts', () => {
        // [P1-HISTORY-ABORT · 2026-05-23] Regex relajado: la firma evolucionó
        // a `(options = {})` para soportar { signal } desde History.jsx.
        // Backward-compat: getLessonsCounts() raw sigue funcionando.
        expect(apiSrc).toMatch(
            /export\s+const\s+getLessonsCounts\s*=\s*\([^)]*\)\s*=>/
        );
        expect(apiSrc).toMatch(
            /['"]\/api\/plans\/lessons-counts['"]/
        );
    });

    it('usa fetchWithAuth (auth header automático)', () => {
        const fnIdx = apiSrc.indexOf('export const getLessonsCounts');
        expect(fnIdx).toBeGreaterThan(-1);
        const around = apiSrc.slice(fnIdx, fnIdx + 200);
        expect(around).toMatch(/fetchWithAuth/);
    });
});

describe('[P1-HIST-3] History.jsx — fetch + state', () => {
    it('importa getLessonsCounts desde config/api', () => {
        expect(src).toMatch(/getLessonsCounts/);
        // Debe venir del config/api (no inline fetch).
        const importLine = src.match(/import\s*\{[^}]+\}\s*from\s*['"]\.\.\/config\/api['"]/);
        expect(importLine).toBeTruthy();
        expect(importLine[0]).toMatch(/getLessonsCounts/);
    });

    it('importa Sparkles desde lucide-react', () => {
        // Icono que refuerza "aprendizaje" — diferenciador del producto.
        expect(src).toMatch(/Sparkles/);
        const lucideImport = src.match(
            /import\s*\{[^}]+\}\s*from\s*['"]lucide-react['"]/
        );
        expect(lucideImport).toBeTruthy();
        expect(lucideImport[0]).toMatch(/Sparkles/);
    });

    it('declara state lessonsCounts inicializado a {}', () => {
        expect(src).toMatch(
            /const\s*\[\s*lessonsCounts\s*,\s*setLessonsCounts\s*\]\s*=\s*useState\(\s*\{\s*\}\s*\)/
        );
    });

    it('useEffect llama getLessonsCounts() junto a fetchHistory()', () => {
        // Mismo useEffect que dispara fetchHistory: una pasada al
        // montar el componente.
        // [P1-HISTORY-ABORT · 2026-05-23] El mount ahora invoca
        // `fetchHistory({ signal })` — anchor cambia, pero el helper
        // _fetchLessonsCounts sigue siendo el siguiente sibling.
        const useEffectIdx = src.indexOf('fetchHistory({ signal });');
        expect(useEffectIdx).toBeGreaterThan(-1);
        const around = src.slice(useEffectIdx, useEffectIdx + 800);
        expect(around).toMatch(/_fetchLessonsCounts\s*\(/);
    });

    it('procesa response.ok y popula state via setLessonsCounts', () => {
        // [P1-HISTORY-ABORT · 2026-05-23] El call site del helper ahora
        // es `_fetchLessonsCounts({ signal })`. Buscamos la declaración
        // del helper para anclar el bloque del .then.
        const helperIdx = src.indexOf('const _fetchLessonsCounts');
        expect(helperIdx).toBeGreaterThan(-1);
        const around = src.slice(helperIdx, helperIdx + 1500);
        expect(around).toMatch(/res\.ok/);
        expect(around).toMatch(/setLessonsCounts/);
        // Defensa: el body debe ser objeto (no array, no null).
        expect(around).toMatch(/typeof\s+body\.counts\s*===\s*['"]object['"]/);
    });

    it('errores del endpoint son silenciosos (feature opcional)', () => {
        // Si el endpoint falla, lessonsCounts queda en {} y los chips
        // simplemente no aparecen. NO toast, NO throw.
        const helperIdx = src.indexOf('const _fetchLessonsCounts');
        const around = src.slice(helperIdx, helperIdx + 1500);
        expect(around).toMatch(/\.catch\(/);
        // El catch debe ser noop o solo log — no toast.error ni throw.
        expect(around).not.toMatch(/toast\.error/);
    });
});

describe('[P1-HIST-3] History.jsx — render del chip', () => {
    it('consume lessonsCounts en render (no dead state)', () => {
        // [removed: tras refactor P3-HIST-DESKTOP-REDESIGN / P3-HIST-MOBILE-
        // REDESIGN · 2026-06-24] El chip "N lecciones" con icono Sparkles
        // de la card se eliminó: la lista ahora la renderizan
        // components/history/HistoryDesktopPanel.jsx + HistoryMobilePanel.jsx
        // (diseño sin ese badge). El conteo NO es dead state: el modal de
        // detalle lo consume como `lessonsCounts[selectedPlan.id]` para el
        // tab "Lecciones (N)" (icono Sparkles size={16}, siempre plural).
        expect(src).toMatch(/lessonsCounts\[\s*selectedPlan\.id\s*\]/);
    });

    // [removed: tras refactor] Se eliminaron los 3 it-blocks que
    // verificaban el render del chip de lecciones en la card (guarda
    // _lessonsCount<=0; span lessonsBadge con <Sparkles size={11}>; title
    // singular/plural lección/lecciones). Ese chip ya no existe en
    // History.jsx. El fetch+state sigue cubierto por el describe
    // 'fetch + state' y la paleta por 'CSS module — palette indigo'.
});

describe('[P1-HIST-3] CSS module — palette indigo diferenciada', () => {
    it('CSS define .lessonsBadge', () => {
        expect(css).toMatch(/\.lessonsBadge\b/);
    });

    it('lessonsBadge usa indigo (#EEF2FF / #4338CA / #C7D2FE)', () => {
        // Palette indigo separa este chip de los status (amber/red) y
        // de caloriesBadge (orange). El icono usa #6366F1 (indigo-500).
        const block = css.match(/\.lessonsBadge\s*\{[^}]+\}/);
        expect(block).toBeTruthy();
        expect(block[0]).toMatch(/#EEF2FF/);
        expect(block[0]).toMatch(/#4338CA/);
        expect(block[0]).toMatch(/#C7D2FE/);
    });

    it('lessonsBadge svg tiene color indigo-500', () => {
        // El svg interno (Sparkles) tiene su propio color para
        // contraste sobre el fondo indigo claro.
        expect(css).toMatch(/\.lessonsBadge\s+svg\s*\{[^}]*#6366F1[^}]*\}/);
    });
});
