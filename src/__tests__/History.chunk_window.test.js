// [P-HISTORY-CHUNK-WINDOW] Tests estáticos del day selector chunk-aware
// en History.jsx (modal "Detalles del Plan").
//
// Histórico:
//   1) Iteración inicial: selector mostraba TODOS los días "Opción A..N"
//      (rompía la regla "máximo 4 días visibles").
//   2) Iteración intermedia (P3-UI-HISTORY-MAX-4-DAYS · 2026-05-08):
//      eliminó la navegación por completo; el modal solo exponía el
//      primer chunk. Para revisar el resto del plan archivado el
//      usuario debía pulsar "Reactivar" — operación destructiva que
//      sobrescribe el plan activo (y, post-P0-HIST-1, también cancela
//      sus chunks pending). UX combo malo: "ver más = arriesgar plan".
//   3) Iteración actual (P1-HIST-1 · 2026-05-09): RE-INTRODUCE la
//      navegación entre chunks PERO 100% READ-ONLY — las flechas
//      prev/next saltan de chunk en chunk SIN reactivar nada. El cap
//      "≤4 días visibles a la vez" se mantiene.
//
// Contrato actual:
//   - state `activeChunkIdx` (re-introducido).
//   - splitWithAbsorb usado para enumerar todos los chunks del plan.
//   - flechas <ChevronLeft /> y <ChevronRight /> en el header del
//     selector cuando el plan tiene >1 chunk.
//   - Math.min(_chunkSize, _MAX_VISIBLE_DAYS=4) sigue capeando.
//   - El handler de open card setea activeChunkIdx=0 + selectedDay=0.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
    splitWithAbsorb,
    findChunkContaining,
} from '../utils/chunkWindow';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

describe('[P1-HIST-1] History.jsx — selector con navegación read-only entre chunks', () => {
    const src = readFileSync(_HISTORY_PATH, 'utf8');

    it('importa splitWithAbsorb, findChunkContaining y parseStartLocal', () => {
        expect(src).toMatch(
            /from\s+['"]\.\.\/utils\/chunkWindow['"]/
        );
        expect(src).toMatch(/splitWithAbsorb/);
        expect(src).toMatch(/findChunkContaining/);
        expect(src).toMatch(/parseStartLocal/);
    });

    it('declara state activeChunkIdx + setActiveChunkIdx (re-introducido)', () => {
        // Pre-P1-HIST-1 este state estaba prohibido (cap rígido al primer
        // chunk). Post-P1-HIST-1 es la fuente de verdad de qué chunk se
        // muestra. Si alguien lo elimina, la nav prev/next deja de
        // funcionar — este test alerta.
        expect(src).toMatch(/\bactiveChunkIdx\b/);
        expect(src).toMatch(/\bsetActiveChunkIdx\b/);
        expect(src).toMatch(
            /useState\(\s*0\s*\)/
        );
    });

    it('renderiza ChevronLeft y ChevronRight para nav inter-chunks', () => {
        // Importados desde lucide-react.
        expect(src).toMatch(/ChevronLeft/);
        expect(src).toMatch(/ChevronRight/);
        // Ambos en JSX (con tamaño 16, dentro de chunkNavBtn).
        expect(src).toMatch(/<ChevronLeft\s+size=\{16\}/);
        expect(src).toMatch(/<ChevronRight\s+size=\{16\}/);
    });

    it('day selector usa splitWithAbsorb(_totalDays) para enumerar chunks', () => {
        // splitWithAbsorb devuelve la lista completa de tamaños; el
        // selector calcula _chunkStart sumando previos. Si el código
        // vuelve a `findChunkContaining(_totalDays, 0)` (siempre primer
        // chunk), la nav prev/next deja de funcionar para idx>0.
        expect(src).toMatch(
            /splitWithAbsorb\(\s*_totalDays\s*\)/
        );
        expect(src).toMatch(
            /_allChunks\s*\.\s*slice\(\s*0\s*,\s*_safeChunkIdx\s*\)\s*\.\s*reduce/
        );
    });

    it('handler de open card setea selectedDay=0 Y activeChunkIdx=0', () => {
        // Sin esto, abrir un plan archivado de 30d después de haber
        // visitado el chunk 6 mostraría días 22-25 (estado stale).
        //
        // [P1-HIST-AUDIT-4 · 2026-05-09] El handler ahora hace lazy
        // load del plan_data antes de setSelectedPlan; buscamos la
        // forma con spread `setSelectedPlan({ ...plan,` en lugar del
        // literal `setSelectedPlan(plan)`.
        const setSelectedPlanIdx = src.indexOf('setSelectedPlan({ ...plan');
        expect(setSelectedPlanIdx).toBeGreaterThan(-1);
        // Ventana grande para capturar setSelectedDay+setActiveChunkIdx
        // que ahora viven antes del lazy-load + setActiveModalTab + el
        // docstring de P1-HIST-AUDIT-4 y P2-HIST-AUDIT-2 (~30 líneas).
        const around = src.slice(Math.max(0, setSelectedPlanIdx - 2500), setSelectedPlanIdx + 100);
        expect(around).toMatch(/setSelectedDay\s*\(\s*0\s*\)/);
        expect(around).toMatch(/setActiveChunkIdx\s*\(\s*0\s*\)/);
    });

    it('flechas prev/next saltan al chunk anterior/siguiente y resetean selectedDay', () => {
        // Cada handler debe (a) cambiar activeChunkIdx, (b) actualizar
        // selectedDay al primer día del nuevo chunk para que el título
        // y la lista de meals sigan coherentes.
        expect(src).toMatch(/_goPrevChunk/);
        expect(src).toMatch(/_goNextChunk/);
        // Ambos llaman setActiveChunkIdx + setSelectedDay.
        const goPrevIdx = src.indexOf('_goPrevChunk');
        const around = src.slice(goPrevIdx, goPrevIdx + 800);
        expect(around).toMatch(/setActiveChunkIdx/);
        expect(around).toMatch(/setSelectedDay/);
    });

    it('disabled state en flechas: respeta _hasPrev/_hasNext', () => {
        // Sin esto, el usuario click-ea la flecha en el primer/último
        // chunk y el handler intenta saltar a idx=-1 o idx=N+1 →
        // fuera de rango.
        expect(src).toMatch(/_hasPrev\s*=\s*_safeChunkIdx\s*>\s*0/);
        expect(src).toMatch(/_hasNext\s*=\s*_safeChunkIdx\s*<\s*_allChunks\.length\s*-\s*1/);
        expect(src).toMatch(/disabled=\{!_hasPrev\}/);
        expect(src).toMatch(/disabled=\{!_hasNext\}/);
    });

    it('label "Días X–Y de N" muestra rango actual + total absoluto', () => {
        // El usuario debe poder orientarse en planes de 30d. El label
        // se compone con _chunkStart+1, _chunkEnd, _totalDays.
        expect(src).toMatch(/D[ií]as\s+\$\{_chunkStart\s*\+\s*1\}/);
        expect(src).toMatch(/de\s+\$\{_totalDays\}/);
    });

    it('label del día usa nombre de semana via _dayNameForGlobalIdx', () => {
        // Re-validación del contrato P-HISTORY-DAY-LABELS (no toca con P1-HIST-1).
        expect(src).toMatch(
            /_dayNameForGlobalIdx\s*\(\s*_startMid\s*,\s*globalIdx\s*\)/
        );
        expect(src).toMatch(/Domingo['"]\s*,\s*['"]Lunes['"]\s*,\s*['"]Martes/);
    });

    it('título "Menú — <Día>" usa el chunk QUE CONTIENE selectedDay', () => {
        // Pre-P1-HIST-1 el título usaba findChunkContaining(_, 0) (siempre
        // primer chunk). Ahora debe usar selectedDay para que al saltar
        // al chunk 6 el título refleje "Menú — Lunes" del día 22, no del
        // día 1. El test detecta el cambio.
        expect(src).toMatch(
            /findChunkContaining\(\s*_planDaysLen\s*,\s*selectedDay\s*\)/
        );
    });

    it('clamp defensivo: _visibleSelectedDay restaura selectedDay al chunk activo', () => {
        expect(src).toMatch(/_visibleSelectedDay/);
    });
});


describe('[P1-HIST-1] integración: max 4 días visibles a la vez (cap conservado)', () => {
    it('plan 30d → splitWithAbsorb devuelve 8 chunks; cada uno ≤4 días', () => {
        const chunks = splitWithAbsorb(30);
        expect(chunks).toEqual([3, 4, 4, 4, 4, 4, 4, 3]);
        for (const sz of chunks) {
            expect(sz).toBeGreaterThanOrEqual(3);
            expect(sz).toBeLessThanOrEqual(4);
        }
    });

    it('plan 7d → 2 chunks (3+4); ambos navegables', () => {
        const chunks = splitWithAbsorb(7);
        expect(chunks).toEqual([3, 4]);
        // findChunkContaining para selectedDay del 2º chunk debe
        // devolver el chunk correcto.
        const fc = findChunkContaining(7, 4);
        expect(fc.start).toBe(3);
        expect(fc.size).toBe(4);
    });

    it('plan 4d → 1 chunk; nav inter-chunks no debe renderizar', () => {
        // _allChunks.length === 1 → la condición `_allChunks.length > 1`
        // hace que el div chunkNav NO se monte. Verificamos que el
        // código fuente expone esa guarda explícita.
        const src = readFileSync(_HISTORY_PATH, 'utf8');
        expect(src).toMatch(/_allChunks\.length\s*>\s*1/);
    });

    it('plan 1d → no muestra selector ni nav (length <= 1)', () => {
        const src = readFileSync(_HISTORY_PATH, 'utf8');
        expect(src).toMatch(/_totalDays\s*<=\s*1/);
    });

    it('invariante: visibleSize = min(chunkSize, 4) — cap se mantiene', () => {
        // splitWithAbsorb puede devolver chunks de hasta 6 en edge cases
        // documentados (`splitWithAbsorb(21)`, `splitWithAbsorb(5)=[5]`).
        // El modal aplica Math.min(chunkSize, 4) para no romper el cap.
        const _MAX_VISIBLE = 4;
        for (const total of [3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 18, 21, 25, 29, 30]) {
            const chunks = splitWithAbsorb(total);
            for (const sz of chunks) {
                const visible = Math.min(sz, _MAX_VISIBLE);
                expect(visible).toBeLessThanOrEqual(_MAX_VISIBLE);
                expect(visible).toBeGreaterThanOrEqual(3);
            }
        }
    });

    it('History.jsx aplica cap _MAX_VISIBLE_DAYS=4 al slice', () => {
        const src = readFileSync(_HISTORY_PATH, 'utf8');
        expect(src).toMatch(/_MAX_VISIBLE_DAYS\s*=\s*4/);
        expect(src).toMatch(
            /Math\.min\s*\(\s*_chunkSize\s*,\s*_MAX_VISIBLE_DAYS\s*\)/
        );
    });
});
