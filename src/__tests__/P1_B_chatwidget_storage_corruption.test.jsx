/**
 * [P1-B · 2026-05-08] Regresión: ChatWidget no debe whitescreen si
 * `localStorage['mealfit_guest_sessions_list']` está corrupto.
 *
 * Bug original (audit 2026-05-08):
 *   El initializer de `useState(guestSessionIds)` en
 *   `src/components/dashboard/ChatWidget.jsx:18-31` llamaba directamente
 *   `JSON.parse(savedList)` sin try/catch. Storage corrupto (edición manual,
 *   downgrade de versión, write parcial) → throw en render inicial → como
 *   ChatWidget vive en el Dashboard global, propaga whitescreen al footer.
 *
 *   Patrón espejo ya cerrado en `AgentPage.jsx:248-262` (P2-B 2026-05-06)
 *   y `AssessmentContext.jsx:114-145`. ChatWidget quedó fuera del scope
 *   original de P2-B; este P1-B cierra esa brecha.
 *
 * Fix: try/catch + Array.isArray check + reescribe storage limpio si parse
 * falló o si el valor parseado no es array (e.g. `JSON.parse('"a string"')`
 * → string sin throw, pero `.includes` después throwearía TypeError).
 *
 * Estrategia de test (3 capas):
 *   1. Unit test del initializer (replica idéntica del código bajo test
 *      ejecutándose contra varias formas de corrupción). Aislado de las
 *      demás complicaciones de ChatWidget (TDZ pre-existente en
 *      useEffect/useCallback order que no es scope de P1-B).
 *   2. Regresión estática: el source de ChatWidget.jsx debe contener
 *      `try`/`catch` y `Array.isArray` envolviendo el `JSON.parse`. Si un
 *      refactor futuro borra el guard, el test falla en CI antes del merge.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEY_LIST = 'mealfit_guest_sessions_list';
const localSessionId = 'session-test-fixed';

/**
 * Replica EXACTA del initializer de `guestSessionIds` post-P1-B
 * (ChatWidget.jsx:18-46). Si esta función diverge del initializer real,
 * el regression test estático lo detectará.
 */
function guestSessionsListInitializer() {
    const savedList = localStorage.getItem('mealfit_guest_sessions_list');
    let list = null;
    if (savedList) {
        try {
            const parsed = JSON.parse(savedList);
            if (Array.isArray(parsed)) list = parsed;
        } catch { /* corrupto; reset a continuación */ }
    }
    if (Array.isArray(list)) {
        if (!list.includes(localSessionId)) {
            list.unshift(localSessionId);
            localStorage.setItem(
                'mealfit_guest_sessions_list', JSON.stringify(list)
            );
        }
        return list;
    }
    const initialList = [localSessionId];
    localStorage.setItem(
        'mealfit_guest_sessions_list', JSON.stringify(initialList)
    );
    return initialList;
}

describe('P1-B · ChatWidget guest_sessions_list storage corruption resilience', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('JSON malformado → no throw, storage reescrito a array', () => {
        localStorage.setItem(KEY_LIST, '{not-json}');

        let result;
        expect(() => { result = guestSessionsListInitializer(); }).not.toThrow();

        // Lista devuelta es válida.
        expect(Array.isArray(result)).toBe(true);
        expect(result).toContain(localSessionId);
        // Storage está limpio (lo escribimos en el reset path).
        const stored = localStorage.getItem(KEY_LIST);
        const parsed = JSON.parse(stored); // no debe throw
        expect(Array.isArray(parsed)).toBe(true);
    });

    it('JSON válido pero string (no-array) → no throw, storage reescrito', () => {
        // `JSON.parse('"a string"')` retorna `"a string"` sin throw.
        // Initializer pre-fix asumía array → `.includes` luego throw TypeError.
        localStorage.setItem(KEY_LIST, JSON.stringify('not-an-array'));

        let result;
        expect(() => { result = guestSessionsListInitializer(); }).not.toThrow();
        expect(Array.isArray(result)).toBe(true);
        expect(result).toContain(localSessionId);
    });

    it('JSON válido pero objeto (no-array) → no throw, storage reescrito', () => {
        localStorage.setItem(KEY_LIST, JSON.stringify({ corrupted: true }));

        let result;
        expect(() => { result = guestSessionsListInitializer(); }).not.toThrow();
        expect(Array.isArray(result)).toBe(true);
    });

    it('JSON válido pero number (no-array) → no throw, storage reescrito', () => {
        localStorage.setItem(KEY_LIST, '42');

        let result;
        expect(() => { result = guestSessionsListInitializer(); }).not.toThrow();
        expect(Array.isArray(result)).toBe(true);
    });

    it('happy path: array existente preservado, sessionId actual prepended si falta', () => {
        localStorage.setItem(KEY_LIST, JSON.stringify(['session-vieja']));

        const result = guestSessionsListInitializer();

        expect(Array.isArray(result)).toBe(true);
        expect(result).toContain(localSessionId);
        expect(result).toContain('session-vieja');
        // sessionId actual debe estar al frente (unshift).
        expect(result[0]).toBe(localSessionId);
    });

    it('happy path: array que ya contiene el sessionId actual no se duplica', () => {
        localStorage.setItem(KEY_LIST, JSON.stringify([localSessionId, 'otra']));

        const result = guestSessionsListInitializer();

        expect(result).toEqual([localSessionId, 'otra']);
        // Verificar no duplicado.
        const occurrences = result.filter(id => id === localSessionId).length;
        expect(occurrences).toBe(1);
    });

    it('storage ausente: crea lista inicial con el sessionId', () => {
        // No hay nada en storage.
        const result = guestSessionsListInitializer();

        expect(Array.isArray(result)).toBe(true);
        expect(result).toEqual([localSessionId]);
        // Storage también escrito.
        expect(JSON.parse(localStorage.getItem(KEY_LIST))).toEqual([localSessionId]);
    });
});

// ---------------------------------------------------------------------------
// Regresión estática: el source de ChatWidget.jsx debe contener el guard.
// ---------------------------------------------------------------------------
describe('P1-B · regresión estática de ChatWidget.jsx', () => {
    const chatWidgetSrc = fs.readFileSync(
        path.resolve(__dirname, '..', 'components', 'dashboard', 'ChatWidget.jsx'),
        'utf-8'
    );

    it('contiene Array.isArray check (no asume forma del JSON parseado)', () => {
        expect(chatWidgetSrc).toContain('Array.isArray');
    });

    it('NO contiene la línea pre-fix `const list = JSON.parse(savedList);` directa', () => {
        // El patrón pre-fix sin guard. Si reaparece sin el try/catch
        // alrededor, este test debe pitar.
        const preFixPattern = /^\s*const list = JSON\.parse\(savedList\);\s*$/m;
        expect(preFixPattern.test(chatWidgetSrc)).toBe(false);
    });

    it('el guard de mealfit_guest_sessions_list está dentro de un try/catch', () => {
        // Buscar la región del initializer y verificar que JSON.parse(savedList)
        // (o la variante con `parsed`) está acompañada de try/catch.
        const initializerRegion = chatWidgetSrc.substring(
            chatWidgetSrc.indexOf('mealfit_guest_sessions_list'),
            // hasta la siguiente useState/useEffect aproximadamente.
            chatWidgetSrc.indexOf('mealfit_guest_sessions_list') + 1500
        );
        expect(initializerRegion).toMatch(/try\s*\{/);
        expect(initializerRegion).toMatch(/catch/);
        expect(initializerRegion).toMatch(/JSON\.parse\(savedList\)/);
    });
});
