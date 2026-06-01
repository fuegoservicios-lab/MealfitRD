/**
 * [P3-AUDIT-8 · 2026-05-10] Drift detection del wiring del helper
 * `_recalcShoppingListAfterPantryChange` en Pantry.jsx.
 *
 * Bug original (audit 2026-05-10):
 *   Solo `confirmDeleteAll` invocaba el flow de recalculate-shopping-list.
 *   Tras añadir o eliminar un item individual:
 *     - El PDF (Dashboard.handleDownloadShoppingList) sí lo refleja porque
 *       fetchea inventario fresh ANTES de renderizar (P1-PDF-1).
 *     - El display in-app del Dashboard usa la lista cacheada en planData
 *       hasta el próximo full refresh → el item recién comprado seguía
 *       apareciendo como "por comprar" durante minutos/horas.
 *
 * Fix:
 *   1. Helper SSOT `_recalcShoppingListAfterPantryChange({silentSuccess,
 *      clearRestockedFlag})` que llama a `/api/plans/recalculate-shopping-list`
 *      y propaga el resultado a localStorage + setPlanData.
 *   2. Invocado en 4 call sites: handleDeleteItem (después de delete),
 *      handleDeleteItem undo callback, handleAddNewItem (después de add),
 *      confirmDeleteAll (que ANTES inlineaba el flow).
 *   3. NO invocado en handleUpdateQuantity — los qty changes ya quedan
 *      reflejados por increment_inventory_quantity + el PDF fresh-fetch.
 *      Invocarlo dispararía N HTTP innecesarios por la ráfaga del turbo.
 *
 * Este test ancla:
 *   - Helper definido.
 *   - 4 invocaciones (def + 4 = 5 ocurrencias del nombre en total).
 *   - `confirmDeleteAll` ya NO contiene el bloque inline `recalculate-shopping-list`
 *     (cierre del refactor — un solo path).
 *   - `handleUpdateQuantity` NO invoca el helper (anti-regresión).
 */

import fs from 'fs';
import path from 'path';

const PANTRY_PATH = path.resolve(__dirname, '..', 'pages', 'Pantry.jsx');

function readPantry() {
    return fs.readFileSync(PANTRY_PATH, 'utf-8');
}

describe('P3-AUDIT-8 · Pantry recalc helper wiring', () => {
    test('helper `_recalcShoppingListAfterPantryChange` está definido', () => {
        const src = readPantry();
        expect(src).toMatch(/const\s+_recalcShoppingListAfterPantryChange\s*=\s*async/);
    });

    test('helper firma acepta `silentSuccess` y `clearRestockedFlag`', () => {
        const src = readPantry();
        // Las dos opciones aparecen en la firma del helper.
        expect(src).toMatch(/silentSuccess\s*=\s*true/);
        expect(src).toMatch(/clearRestockedFlag\s*=\s*false/);
    });

    test('helper invoca el endpoint /api/plans/recalculate-shopping-list', () => {
        const src = readPantry();
        // Busca la URL dentro del cuerpo del helper. Acepta backticks (template
        // string) o comillas literales.
        expect(src).toMatch(/recalculate-shopping-list/);
    });

    test('recalc wired: helper directo (wrapper interno + deleteAll) + wrapper debounced (delete/undo/add)', () => {
        // [P2-NEW-12 · 2026-05-11] El refactor de debounce coalescente movió las
        // invocaciones de delete/undo/add del helper DIRECTO al wrapper debounced
        // `_scheduleRecalcShoppingList` (evita N HTTP por ráfaga). El helper
        // directo (`_recalcShoppingListAfterPantryChange(`) queda solo en 2 sitios:
        //   1. dentro de `_scheduleRecalcShoppingList` (el wrapper lo invoca), y
        //   2. `confirmDeleteAll` (await directo, semántica toast post-éxito).
        // Pre-fix este test esperaba 4 llamadas directas — quedó stale tras
        // P2-NEW-12 (actualizado en P1-RESTOCK-LOSTUPDATE audit · 2026-05-30).
        const src = readPantry();
        const helperRe = /_recalcShoppingListAfterPantryChange\s*\(/g;
        const helperCalls = src.match(helperRe) || [];
        expect(helperCalls).toHaveLength(2);
        // El wrapper debounced se invoca desde delete (post) + undo + add
        // (+ re-schedule trailing) — al menos 3 sitios.
        const scheduleRe = /_scheduleRecalcShoppingList\s*\(/g;
        const scheduleCalls = src.match(scheduleRe) || [];
        expect(scheduleCalls.length).toBeGreaterThanOrEqual(3);
    });

    test('confirmDeleteAll ya NO contiene `recalculate-shopping-list` inline (delegated al helper)', () => {
        const src = readPantry();
        // Aísla el cuerpo de `confirmDeleteAll` (cierra al siguiente
        // `const ` top-level del componente o al final del fichero — pero
        // heurístico aquí: la sub-string entre `confirmDeleteAll = async` y
        // el próximo `const ` top-level).
        const start = src.indexOf('confirmDeleteAll = async');
        expect(start).toBeGreaterThan(-1);
        const rest = src.slice(start);
        // El cuerpo termina cuando aparece otra declaración `const X = async` o `const X =`
        // a nivel de método del componente. Toma el segmento hasta la próxima
        // function-method del componente (`const handleAddNewItem`).
        const endRel = rest.indexOf('const handleAddNewItem');
        expect(endRel).toBeGreaterThan(-1);
        const body = rest.slice(0, endRel);
        // Verifica que la URL inline ya NO esté en confirmDeleteAll (debe ir
        // por el helper). La URL solo debe aparecer DENTRO del helper.
        expect(body).not.toMatch(/recalculate-shopping-list/);
        // Pero confirmDeleteAll SÍ debe llamar al helper.
        expect(body).toMatch(/_recalcShoppingListAfterPantryChange\s*\(/);
    });

    test('handleUpdateQuantity NO invoca el helper (anti-regresión qty-burst)', () => {
        const src = readPantry();
        const start = src.indexOf('handleUpdateQuantity = async');
        expect(start).toBeGreaterThan(-1);
        const rest = src.slice(start);
        // El cuerpo de handleUpdateQuantity termina en el próximo `const ` o
        // `// Activación del "Velocímetro"` que precede a `startHolding`.
        const endRel = rest.indexOf('// Activación del');
        expect(endRel).toBeGreaterThan(-1);
        const body = rest.slice(0, endRel);
        // El helper NO debe ser invocado dentro de handleUpdateQuantity para
        // no disparar N HTTP por la ráfaga del velocímetro turbo.
        expect(body).not.toMatch(/_recalcShoppingListAfterPantryChange\s*\(/);
    });

    test('handleDeleteItem invoca el helper (delete path) Y la undo callback', () => {
        const src = readPantry();
        const start = src.indexOf('handleDeleteItem = async');
        expect(start).toBeGreaterThan(-1);
        const rest = src.slice(start);
        // Cuerpo de handleDeleteItem hasta la próxima declaración (`const confirmDeleteAll`).
        const endRel = rest.indexOf('const confirmDeleteAll');
        expect(endRel).toBeGreaterThan(-1);
        const body = rest.slice(0, endRel);
        // [P2-NEW-12] handleDeleteItem dispara el recalc vía el wrapper debounced
        // `_scheduleRecalcShoppingList` (NO el helper directo): una en el path
        // principal (post-delete) y otra en la undo callback (post-restore).
        const callRe = /_scheduleRecalcShoppingList\s*\(/g;
        const matches = body.match(callRe) || [];
        expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    test('handleAddNewItem invoca el helper (post-insert path)', () => {
        const src = readPantry();
        const start = src.indexOf('handleAddNewItem = async');
        expect(start).toBeGreaterThan(-1);
        const rest = src.slice(start);
        // Cuerpo termina cuando empieza la próxima declaración del componente
        // (cualquier `const X` top-level posterior). Use heurística: hasta el
        // próximo `// 3. Computed Views` (delimitador conocido en este componente)
        // o `} catch (error)` final.
        const endRel = rest.indexOf('// 3. Computed Views');
        // Defensivo: si el comentario se renombra, usar fallback (próximo `const filteredInventory`).
        const fallbackEnd = rest.indexOf('const filteredInventory');
        const end = endRel > -1 ? endRel : fallbackEnd;
        expect(end).toBeGreaterThan(-1);
        const body = rest.slice(0, end);
        // [P2-NEW-12] handleAddNewItem dispara el recalc vía el wrapper debounced.
        expect(body).toMatch(/_scheduleRecalcShoppingList\s*\(/);
    });
});
