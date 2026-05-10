// [P2-HIST-3 · 2026-05-09] Tests del chip retroactivo de semanas
// simplificadas en cards del Historial.
//
// Bug original (audit historial 2026-05-08):
//   `plan_data._user_forced_simplified_weeks` (dict per-week
//   persistido en P3-2 cuando el usuario fuerza modo simplificado
//   tras chunk dead-lettered) era invisible en el Historial. Solo
//   el Dashboard del plan ACTIVO mostraba el banner sutil. Para
//   planes archivados la info se perdía.
//
// Fix:
//   - Helper `getSimplifiedWeeksLabel(plan)` produce label corto
//     ("S3 simplif." / "S2, S3 simplif." / "N sem. simplif.").
//   - Render chip lavender en cardActions cuando hay >=1 semana.
//
// Cobertura (regex sobre source — sin JSDOM):
//   - Helper definido como const arrow function.
//   - Lectura segura de _user_forced_simplified_weeks (typeof + array guard).
//   - Filtra keys no-numéricas / negativas (defensivo contra payload roto).
//   - Sort numérico ascendente (S2 antes que S3 en el label).
//   - 3 ramas: 1 semana / 2 semanas / 3+ semanas.
//   - Devuelve null cuando el flag falta o está vacío.
//   - Render condicional + className simplifiedWeeksBadge + title attribute.
//   - CSS: palette lavender (#F5F3FF / #5B21B6 / #DDD6FE).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const css = readFileSync(_CSS_PATH, 'utf8');

describe('[P2-HIST-3] History.jsx — getSimplifiedWeeksLabel helper', () => {
    it('marca el helper con anchor [P2-HIST-3 · 2026-05-09]', () => {
        expect(src).toMatch(/\[P2-HIST-3\s*·\s*2026-05-09\]/);
    });

    it('define getSimplifiedWeeksLabel como const arrow function', () => {
        expect(src).toMatch(
            /const\s+getSimplifiedWeeksLabel\s*=\s*\(\s*plan\s*\)\s*=>/
        );
    });

    it('lee _user_forced_simplified_weeks (key con underscore prefix)', () => {
        // El backend usa la key con underscore (`_user_forced_simplified_weeks`)
        // — sin underscore es un alias del Dashboard pre-P3-2 que ya no existe.
        // Si alguien deletea el underscore por accidente, este test alerta.
        const helperIdx = src.indexOf('const getSimplifiedWeeksLabel');
        expect(helperIdx).toBeGreaterThan(-1);
        const block = src.slice(helperIdx, helperIdx + 1500);
        expect(block).toMatch(/data\._user_forced_simplified_weeks/);
    });

    it('valida tipo de raw: typeof object Y NO array', () => {
        // El payload viene como dict `{ "<week>": "<iso>" }`. Si el
        // backend serializa mal y manda un array, debe rechazar
        // (Object.keys de un array da indices "0","1",... que serían
        // tratados como week_numbers absurdos).
        const helperIdx = src.indexOf('const getSimplifiedWeeksLabel');
        const block = src.slice(helperIdx, helperIdx + 1500);
        expect(block).toMatch(/typeof\s+raw\s*!==\s*['"]object['"]/);
        expect(block).toMatch(/Array\.isArray\(\s*raw\s*\)/);
    });

    it('parsea keys con parseInt y filtra > 0 + Number.isFinite', () => {
        // Filtros defensivos: keys malformadas ("abc", "0", "-3", "")
        // se descartan en lugar de aparecer como "S0 simplif." o
        // "SNaN simplif."
        const helperIdx = src.indexOf('const getSimplifiedWeeksLabel');
        const block = src.slice(helperIdx, helperIdx + 1500);
        expect(block).toMatch(/parseInt\(\s*k\s*,\s*10\s*\)/);
        expect(block).toMatch(/Number\.isFinite/);
        expect(block).toMatch(/n\s*>\s*0/);
    });

    it('sort numérico ascendente (S2 antes de S3, no string sort)', () => {
        // String sort daría ["10", "2", "3"]; numeric sort da [2, 3, 10].
        // Crítico para planes de 30d donde puede haber S10+ simplif.
        const helperIdx = src.indexOf('const getSimplifiedWeeksLabel');
        const block = src.slice(helperIdx, helperIdx + 1500);
        expect(block).toMatch(/\.sort\(\s*\(\s*a\s*,\s*b\s*\)\s*=>\s*a\s*-\s*b\s*\)/);
    });

    it('3 ramas de label: 1, 2, 3+ semanas', () => {
        const helperIdx = src.indexOf('const getSimplifiedWeeksLabel');
        const block = src.slice(helperIdx, helperIdx + 1500);
        // 1 semana → "S3 simplif."
        expect(block).toMatch(/weeks\.length\s*===\s*1/);
        expect(block).toMatch(/S\$\{weeks\[0\]\}\s+simplif\./);
        // 2 semanas → "S2, S3 simplif."
        expect(block).toMatch(/weeks\.length\s*===\s*2/);
        // 3+ semanas → "N sem. simplif." (count agregado)
        expect(block).toMatch(/sem\.\s*simplif\./);
    });
});

describe('[P2-HIST-3] integración: helper produce labels esperados', () => {
    // Reproducimos la lógica del helper inline para tests semánticos
    // (no podemos importar el helper porque vive dentro del componente).
    function _label(weeksDict) {
        if (!weeksDict || typeof weeksDict !== 'object' || Array.isArray(weeksDict)) return null;
        const weeks = Object.keys(weeksDict)
            .map((k) => parseInt(k, 10))
            .filter((n) => Number.isFinite(n) && n > 0)
            .sort((a, b) => a - b);
        if (weeks.length === 0) return null;
        if (weeks.length === 1) return `S${weeks[0]} simplif.`;
        if (weeks.length === 2) return `S${weeks[0]}, S${weeks[1]} simplif.`;
        return `${weeks.length} sem. simplif.`;
    }

    it('1 semana → "S3 simplif."', () => {
        expect(_label({ '3': '2026-05-08T10:00:00Z' })).toBe('S3 simplif.');
    });

    it('2 semanas no contiguas → "S2, S5 simplif." (orden numérico)', () => {
        expect(_label({ '5': 'x', '2': 'y' })).toBe('S2, S5 simplif.');
    });

    it('3 semanas → "3 sem. simplif." (count agregado)', () => {
        expect(_label({ '1': 'a', '2': 'b', '3': 'c' })).toBe('3 sem. simplif.');
    });

    it('5 semanas → "5 sem. simplif."', () => {
        expect(_label({ '1': 'a', '2': 'b', '3': 'c', '4': 'd', '5': 'e' }))
            .toBe('5 sem. simplif.');
    });

    it('null / undefined / array → null (defensivo)', () => {
        expect(_label(null)).toBe(null);
        expect(_label(undefined)).toBe(null);
        expect(_label([])).toBe(null);
        expect(_label(['week-3'])).toBe(null);
    });

    it('keys no-numéricas / negativas / 0 / "" se filtran', () => {
        expect(_label({ 'abc': 'x', '0': 'y', '-3': 'z', '': 'w' })).toBe(null);
        // Mezcla: solo S5 sobrevive el filter.
        expect(_label({ 'abc': 'x', '5': 'y', '-1': 'z' })).toBe('S5 simplif.');
    });

    it('orden numérico (no string) — S10 después de S2', () => {
        // String sort daría "S10, S2 simplif." (incorrecto).
        const r = _label({ '10': 'a', '2': 'b' });
        expect(r).toBe('S2, S10 simplif.');
    });
});

describe('[P2-HIST-3] History.jsx — render del chip', () => {
    it('llama getSimplifiedWeeksLabel(plan) dentro de cardActions', () => {
        expect(src).toMatch(/getSimplifiedWeeksLabel\(\s*plan\s*\)/);
    });

    it('NO renderiza cuando el helper devuelve null', () => {
        const callIdx = src.indexOf('getSimplifiedWeeksLabel(plan)');
        expect(callIdx).toBeGreaterThan(-1);
        const block = src.slice(callIdx, callIdx + 200);
        expect(block).toMatch(/if\s*\(\s*!_label\s*\)\s*return\s+null/);
    });

    it('renderiza span con className simplifiedWeeksBadge y title attribute', () => {
        expect(src).toMatch(/className=\{styles\.simplifiedWeeksBadge\}/);
        // Title da contexto a usuarios sobre por qué está esa semana
        // como "simplif".
        const badgeIdx = src.indexOf('className={styles.simplifiedWeeksBadge}');
        const around = src.slice(Math.max(0, badgeIdx - 100), badgeIdx + 400);
        expect(around).toMatch(/title=/);
        expect(around).toMatch(/simplificad/);
    });
});

describe('[P2-HIST-3] CSS module — simplifiedWeeksBadge palette lavender', () => {
    it('CSS define .simplifiedWeeksBadge', () => {
        expect(css).toMatch(/\.simplifiedWeeksBadge\b/);
    });

    it('palette lavender (#F5F3FF / #5B21B6 / #DDD6FE)', () => {
        // Diferencia clave con .lessonsBadge (indigo): ambos son
        // "metadata del plan" pero con semánticas distintas. Mismo
        // espectro de la familia (azul-violeta) para coherencia
        // visual, pero shade más violeta para el simplif.
        const block = css.match(/\.simplifiedWeeksBadge\s*\{[^}]+\}/);
        expect(block).toBeTruthy();
        expect(block[0]).toMatch(/#F5F3FF/);
        expect(block[0]).toMatch(/#5B21B6/);
        expect(block[0]).toMatch(/#DDD6FE/);
    });

    it('comparte shape con otros chips (border-radius 99px, font-weight 800)', () => {
        const block = css.match(/\.simplifiedWeeksBadge\s*\{[^}]+\}/);
        expect(block[0]).toMatch(/border-radius:\s*99px/);
        expect(block[0]).toMatch(/font-weight:\s*800/);
    });
});
