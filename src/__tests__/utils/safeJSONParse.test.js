/**
 * [P2-A · 2026-05-08] Tests del helper SSOT `safeJSONParse`.
 *
 * El helper centraliza el patrón de parseo defensivo de localStorage tras los
 * incidentes P1-B (whitescreen ChatWidget) y P2-B (initializers raw). API:
 *   - safeJSONParse(raw, fallback, opts?)
 *   - safeJSONParseArray(raw, opts?)
 *   - safeJSONParseObject(raw, opts?)
 *
 * Cobertura:
 *   - Casos triviales (null/undefined/no-string/empty) → fallback sin tocar storage.
 *   - JSON malformado → fallback + onCorrupt + self-heal storage opcional.
 *   - JSON válido + validator → respeta el validator (Array.isArray, isObject).
 *   - JSON válido sin validator → retorna parsed.
 *   - Self-heal: storageKey reescribe storage al fallback.
 *   - onCorrupt: callback invocado en SyntaxError y validator-fail; throws del
 *     callback no propagan al caller.
 *   - Atajos `safeJSONParseArray` / `safeJSONParseObject`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    safeJSONParse,
    safeJSONParseArray,
    safeJSONParseObject,
} from '../../utils/safeJSONParse';

describe('safeJSONParse · casos triviales (no consideramos corrupción)', () => {
    it('null → fallback sin tocar storage ni onCorrupt', () => {
        const onCorrupt = vi.fn();
        const result = safeJSONParse(null, [1, 2], { onCorrupt });
        expect(result).toEqual([1, 2]);
        expect(onCorrupt).not.toHaveBeenCalled();
    });

    it('undefined → fallback', () => {
        expect(safeJSONParse(undefined, 'fb')).toBe('fb');
    });

    it('no-string (number/bool/array) → fallback', () => {
        expect(safeJSONParse(42, 'fb')).toBe('fb');
        expect(safeJSONParse(true, 'fb')).toBe('fb');
        expect(safeJSONParse([], 'fb')).toBe('fb');
    });

    it('string vacío → fallback', () => {
        expect(safeJSONParse('', { x: 1 })).toEqual({ x: 1 });
    });
});

describe('safeJSONParse · JSON malformado', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('parse falla → fallback retornado', () => {
        const result = safeJSONParse('{not-json}', [9]);
        expect(result).toEqual([9]);
    });

    it('parse falla + storageKey → reescribe storage al fallback', () => {
        localStorage.setItem('k', '{not-json}');
        safeJSONParse('{not-json}', ['heal'], { storageKey: 'k' });
        expect(JSON.parse(localStorage.getItem('k'))).toEqual(['heal']);
    });

    it('parse falla + onCorrupt → callback invocado con (raw, err)', () => {
        const onCorrupt = vi.fn();
        safeJSONParse('xx{', 'fb', { onCorrupt });
        expect(onCorrupt).toHaveBeenCalledTimes(1);
        const [raw, err] = onCorrupt.mock.calls[0];
        expect(raw).toBe('xx{');
        expect(err).toBeInstanceOf(SyntaxError);
    });

    it('onCorrupt que throw NO propaga al caller', () => {
        const onCorrupt = vi.fn(() => { throw new Error('boom'); });
        const result = safeJSONParse('bad{', 'fb', { onCorrupt });
        expect(result).toBe('fb'); // función completó normalmente
        expect(onCorrupt).toHaveBeenCalled();
    });
});

describe('safeJSONParse · validator', () => {
    it('parse OK + Array.isArray validator → array preservado', () => {
        const result = safeJSONParse('[1,2,3]', [], { validator: Array.isArray });
        expect(result).toEqual([1, 2, 3]);
    });

    it('parse OK + Array.isArray validator pero string → fallback', () => {
        // `JSON.parse('"a string"')` → 'a string' (no array).
        const result = safeJSONParse('"hola"', ['fb'], { validator: Array.isArray });
        expect(result).toEqual(['fb']);
    });

    it('parse OK + Array.isArray validator pero objeto → fallback', () => {
        const result = safeJSONParse('{"a":1}', ['fb'], { validator: Array.isArray });
        expect(result).toEqual(['fb']);
    });

    it('parse OK + Array.isArray validator + storageKey → self-heal', () => {
        localStorage.setItem('k', '"not-array"');
        safeJSONParse('"not-array"', ['heal'], {
            validator: Array.isArray,
            storageKey: 'k',
        });
        expect(JSON.parse(localStorage.getItem('k'))).toEqual(['heal']);
    });

    it('validator que throw → trata como invalid → fallback', () => {
        const validator = () => { throw new Error('bad'); };
        const result = safeJSONParse('[1]', 'fb', { validator });
        expect(result).toBe('fb');
    });

    it('validator-fail invoca onCorrupt con err=null', () => {
        const onCorrupt = vi.fn();
        safeJSONParse('"str"', [], {
            validator: Array.isArray,
            onCorrupt,
        });
        expect(onCorrupt).toHaveBeenCalledTimes(1);
        const [raw, err] = onCorrupt.mock.calls[0];
        expect(raw).toBe('"str"');
        expect(err).toBeNull();
    });

    it('sin validator → cualquier parse OK retorna el valor', () => {
        expect(safeJSONParse('"foo"', 'fb')).toBe('foo');
        expect(safeJSONParse('null', 'fb')).toBeNull();
        expect(safeJSONParse('42', 'fb')).toBe(42);
    });
});

describe('safeJSONParseArray · atajo', () => {
    it('default fallback es []', () => {
        expect(safeJSONParseArray(null)).toEqual([]);
        expect(safeJSONParseArray('{not-json}')).toEqual([]);
        expect(safeJSONParseArray('"string"')).toEqual([]);
    });

    it('respeta valid array', () => {
        expect(safeJSONParseArray('[1,2]')).toEqual([1, 2]);
    });

    it('opts.storageKey funciona', () => {
        localStorage.setItem('k', '"bad"');
        safeJSONParseArray('"bad"', { storageKey: 'k' });
        expect(JSON.parse(localStorage.getItem('k'))).toEqual([]);
    });
});

describe('safeJSONParseObject · atajo', () => {
    it('default fallback es {}', () => {
        expect(safeJSONParseObject(null)).toEqual({});
        expect(safeJSONParseObject('{not-json}')).toEqual({});
    });

    it('rechaza array (no es objeto plain)', () => {
        expect(safeJSONParseObject('[1,2]')).toEqual({});
    });

    it('rechaza null (no es objeto plain)', () => {
        expect(safeJSONParseObject('null')).toEqual({});
    });

    it('acepta objeto plain', () => {
        expect(safeJSONParseObject('{"a":1}')).toEqual({ a: 1 });
    });
});

// ---------------------------------------------------------------------------
// Regresión estática: confirmar que los 6 sites P2-A migraron.
// Si un refactor revierte uno, el test falla en CI.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '..', '..');

const _read = (rel) =>
    fs.readFileSync(path.join(SRC_DIR, rel), 'utf-8');

describe('P2-A · regresión estática de los sites migrados', () => {
    const cases = [
        {
            file: 'components/dashboard/ChatWidget.jsx',
            label: 'ChatWidget',
            mustImport: 'safeJSONParse',
        },
        {
            file: 'pages/AgentPage.jsx',
            label: 'AgentPage',
            mustImport: 'safeJSONParse',
        },
        {
            file: 'pages/Pantry.jsx',
            label: 'Pantry',
            mustImport: 'safeJSONParseObject',
        },
        {
            file: 'pages/Plan.jsx',
            label: 'Plan',
            mustImport: 'safeJSONParseObject',
        },
        {
            file: 'pages/Dashboard.jsx',
            label: 'Dashboard',
            mustImport: 'safeJSONParse',
        },
    ];

    for (const c of cases) {
        it(`${c.label} importa ${c.mustImport} desde utils/safeJSONParse`, () => {
            const src = _read(c.file);
            const importPattern = new RegExp(
                `import\\s*\\{[^}]*\\b${c.mustImport}\\b[^}]*\\}\\s*from\\s*['"][^'"]*safeJSONParse['"]`
            );
            expect(importPattern.test(src)).toBe(true);
        });
    }

    it('ChatWidget.jsx no contiene `JSON.parse(savedListStr)` raw fuera de comentarios', () => {
        const src = _read('components/dashboard/ChatWidget.jsx');
        // Quitar comentarios single-line para reducir ruido.
        const stripped = src.replace(/\/\/[^\n]*/g, '');
        // Permitido: `JSON.parse(savedList)` solo dentro de un try (P1-B initializer).
        // Buscar el patrón `savedListStr ? JSON.parse(savedListStr)` que era el
        // patrón pre-fix runtime; debe estar 100% migrado a safeJSONParse.
        const preFixPattern = /savedListStr\s*\?\s*JSON\.parse\(\s*savedListStr\s*\)/;
        expect(preFixPattern.test(stripped)).toBe(false);
    });

    it('AgentPage.jsx no contiene `JSON.parse(savedListStr)` raw runtime', () => {
        const src = _read('pages/AgentPage.jsx');
        const stripped = src.replace(/\/\/[^\n]*/g, '');
        const preFixPattern = /savedListStr\s*\?\s*JSON\.parse\(\s*savedListStr\s*\)/;
        expect(preFixPattern.test(stripped)).toBe(false);
    });

    it('Plan.jsx no contiene `oldPlanStr ? JSON.parse(oldPlanStr) : {}` raw', () => {
        const src = _read('pages/Plan.jsx');
        const stripped = src.replace(/\/\/[^\n]*/g, '');
        const preFixPattern = /oldPlanStr\s*\?\s*JSON\.parse\(\s*oldPlanStr\s*\)/;
        expect(preFixPattern.test(stripped)).toBe(false);
    });

    it('Pantry.jsx no contiene `const planData = JSON.parse(savedPlan)` raw', () => {
        const src = _read('pages/Pantry.jsx');
        const stripped = src.replace(/\/\/[^\n]*/g, '');
        const preFixPattern = /const\s+planData\s*=\s*JSON\.parse\(\s*savedPlan\s*\)/;
        expect(preFixPattern.test(stripped)).toBe(false);
    });
});
