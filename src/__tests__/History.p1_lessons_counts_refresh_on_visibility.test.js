// [P1-HIST-NEW-3 · 2026-05-09] Tests del refresh de `lessonsCounts` y
// `lessonsCountsByQuality` cuando la pestaña vuelve a estar visible
// tras >60s dormida.
//
// Bug original (audit profundo Historial 2026-05-09):
//   El listener de `visibilitychange` (P0-HIST-VIS-REFRESH)
//   re-llamaba `fetchHistory()` para refrescar el listado y los
//   counters embedded del queue (chunk_*_count tras P1-AUDIT-HIST-4),
//   pero NO refrescaba `getLessonsCounts()`. El chip "X lecciones"
//   en cada card lee de `lessonsCounts` populado en el mount —
//   un chunk que completaba en background y persistía lecciones
//   nuevas vía T2 dejaba el conteo viejo hasta navegar fuera y
//   volver al Historial.
//
// Fix:
//   Helper `_fetchLessonsCounts` extraído del mount useEffect para
//   que el visibilitychange handler pueda re-disparar la misma
//   lógica. Mismo patrón Promise.race + timeout 12s + best-effort
//   silent (no parpadeos en los chips si el endpoint falla).
//
// Cobertura:
//   1. Anchor del marker.
//   2. Helper `_fetchLessonsCounts` declarado en el componente.
//   3. Mount useEffect llama al helper (no inline duplicate).
//   4. Visibilitychange handler llama al helper.
//   5. Comentario load-bearing cita el bug del background T2.
//   6. El helper preserva el patrón Promise.race + timeout.
//   7. Best-effort silent: failure NO borra state previo.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P1-HIST-NEW-3] anchor + helper extraído', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-NEW-3\s*·\s*2026-05-09\]/);
    });

    it('declara helper _fetchLessonsCounts a nivel componente', () => {
        // El helper debe ser una función declarada en el componente,
        // accesible desde mount Y visibilitychange. Inline en cada
        // useEffect duplicaría la lógica + diverge silently.
        expect(src).toMatch(/const\s+_fetchLessonsCounts\s*=\s*\(\s*\)\s*=>/);
    });

    it('helper invoca getLessonsCounts dentro de Promise.race', () => {
        const idx = src.indexOf('const _fetchLessonsCounts');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 2500);
        expect(block).toMatch(/Promise\.race\(/);
        expect(block).toMatch(/getLessonsCounts\(\)/);
    });

    it('helper preserva timeout 12s + reject pattern', () => {
        // Mismo patrón Promise.race + setTimeout(reject) que los
        // otros endpoints (history-list, status-summary). Sin esto,
        // un getSession() colgado dejaría el helper bloqueado para
        // siempre.
        const idx = src.indexOf('const _fetchLessonsCounts');
        const block = src.slice(idx, idx + 2500);
        // Regex tolerante al patrón `setTimeout(() => reject(new
        // Error('TIMEOUT_LESSONS_COUNTS')), 12000)` — con paréntesis
        // anidados.
        expect(block).toMatch(/setTimeout\([\s\S]*?TIMEOUT_LESSONS_COUNTS/);
        expect(block).toMatch(/12000/);
    });

    it('helper preserva el set de counts_by_quality (P2-HIST-AUDIT-D)', () => {
        // El response del endpoint trae `counts` y `counts_by_quality`
        // en el mismo body. Ambos setters deben estar dentro del .then.
        const idx = src.indexOf('const _fetchLessonsCounts');
        const block = src.slice(idx, idx + 3000);
        expect(block).toMatch(/setLessonsCounts\(/);
        expect(block).toMatch(/setLessonsCountsByQuality\(/);
    });
});


describe('[P1-HIST-NEW-3] mount useEffect llama al helper', () => {
    it('useEffect de mount invoca _fetchLessonsCounts en lugar de inline', () => {
        // El mount useEffect ya no debe tener Promise.race(getLessonsCounts())
        // duplicado — solo la llamada al helper.
        // Pattern tolerante a CRLF (Windows) y LF (Unix).
        const mountIdx = src.search(/useEffect\(\(\)\s*=>\s*\{[\s\r\n]+fetchHistory\(\);/);
        expect(mountIdx).toBeGreaterThan(-1);
        const block = src.slice(mountIdx, mountIdx + 3000);
        expect(block).toMatch(/_fetchLessonsCounts\(\s*\)/);
    });

    it('mount NO duplica el Promise.race de getLessonsCounts inline', () => {
        // Drift detection: si alguien re-inline el fetch en el mount,
        // un cambio en el helper se desincroniza con el inline.
        // Buscamos `Promise.race([\s+getLessonsCounts` (raw) en el mount.
        const mountIdx = src.search(/useEffect\(\(\)\s*=>\s*\{[\s\r\n]+fetchHistory\(\);/);
        const block = src.slice(mountIdx, mountIdx + 1500);
        // Mount NO debe contener Promise.race con getLessonsCounts directamente
        // (debe pasar por el helper). El helper sí lo tiene.
        const inlineRace = block.match(
            /Promise\.race\(\s*\[\s*getLessonsCounts/
        );
        expect(inlineRace).toBeNull();
    });
});


describe('[P1-HIST-NEW-3] visibilitychange handler refresca lessons counts', () => {
    it('handler de visibilitychange llama _fetchLessonsCounts', () => {
        const visIdx = src.indexOf('const _onVisibilityChange');
        expect(visIdx).toBeGreaterThan(-1);
        // Slice hasta el cierre del listener.
        const block = src.slice(visIdx, visIdx + 4500);
        expect(block).toMatch(/_fetchLessonsCounts\(\s*\)/);
    });

    it('llamada al helper ocurre DESPUÉS de fetchHistory', () => {
        // Orden: 1) listado (que populates counters embedded), 2) lessons.
        // El listado es la señal más visible — refrescar primero
        // permite que el chip de status se actualice antes que los
        // chips de lecciones.
        const visIdx = src.indexOf('const _onVisibilityChange');
        const block = src.slice(visIdx, visIdx + 4500);
        const fetchHistoryIdx = block.indexOf('fetchHistory();');
        const lessonsIdx = block.indexOf('_fetchLessonsCounts(');
        expect(fetchHistoryIdx).toBeGreaterThan(-1);
        expect(lessonsIdx).toBeGreaterThan(-1);
        expect(lessonsIdx).toBeGreaterThan(fetchHistoryIdx);
    });

    it('comentario load-bearing cita el bug T2 / chunk_lesson_telemetry', () => {
        // El refresh de fetchHistory cubre `chunk_*_count` (queue) pero
        // NO `chunk_lesson_telemetry`. El comentario debe explicar la
        // distinción para que un revisor no borre el `_fetchLessonsCounts`
        // creyendo que `fetchHistory` lo cubre.
        const visIdx = src.indexOf('Re-fetchea el listado del');
        const block = src.slice(visIdx, visIdx + 3000);
        expect(block).toMatch(/chunk_lesson_telemetry/);
    });
});


describe('[P1-HIST-NEW-3] best-effort silent', () => {
    it('helper tiene .catch silent', () => {
        // Si el endpoint falla (network, timeout, 401), no queremos
        // toast de error ni borrar `lessonsCounts` previo a {}.
        const idx = src.indexOf('const _fetchLessonsCounts');
        const block = src.slice(idx, idx + 2500);
        expect(block).toMatch(/\.catch\(\s*\(\s*\)\s*=>\s*\{[^}]*\}\s*\)/);
    });

    it('helper NO setea {} en caso de error', () => {
        // El bloque .catch debe ser silent — sin setLessonsCounts({}).
        // Eso parpadearía los chips a 0 cuando el conteo real no cambió.
        const idx = src.indexOf('const _fetchLessonsCounts');
        const endIdx = src.indexOf(';', src.indexOf('.catch(', idx)) + 1;
        const block = src.slice(idx, endIdx);
        // El catch NO debe llamar setLessonsCounts({}) ni similar.
        expect(block).not.toMatch(/\.catch\([\s\S]*setLessonsCounts/);
    });
});
