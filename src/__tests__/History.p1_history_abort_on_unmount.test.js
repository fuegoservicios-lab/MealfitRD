// [P1-HISTORY-ABORT · 2026-05-23] Tests parser-based del fix
// "AbortController on unmount" para History.jsx.
//
// Bug original (audit production-readiness 2026-05-23):
//   `fetchHistory()` + `_fetchLessonsCounts()` + el inline
//   `getHistoryStatusSummary()` del mount useEffect corren con
//   Promise.race + timeout 12s. Si el usuario navega fuera de
//   /history mientras las 3 fetches están en flight, las .then
//   resuelven post-unmount y disparan:
//     1. React warning "Can't perform a state update on an
//        unmounted component" (visible en console + ruido Sentry).
//     2. Memory leak suave: body parseado + closures retenidos
//        ~hasta que GC limpia el resolved promise (~ms a s).
//     3. Wasted bandwidth: el server sigue enviando la response
//        de history-list (typ. ~1KB × N planes) que nadie lee.
//
// Fix:
//   AbortController component-scoped (`_abortControllerRef`),
//   creado en el mount useEffect y `.abort()` en el cleanup.
//   Las 3 fetches pasan `{ signal }` a las helpers de config/api.js
//   (que ahora forwardean options.signal a fetchWithAuth → fetch).
//   El visibilitychange handler re-fetcha pasando el MISMO signal,
//   así un abort en unmount cancela también los re-fetches en flight.
//   Catch silencioso para AbortError. Guards `signal.aborted` antes
//   de cada setter previenen state-on-unmounted aunque la fetch ya
//   haya recibido el body parcial.
//
// Cobertura:
//   1. Anchor del marker.
//   2. Ref `_abortControllerRef` declarado con useRef(null).
//   3. Mount useEffect crea `new AbortController()`.
//   4. Cleanup return llama `.abort()` sobre el controller.
//   5. fetchHistory acepta `({ signal } = {})` y pasa signal a
//      getHistoryList.
//   6. _fetchLessonsCounts acepta `({ signal } = {})` y pasa
//      signal a getLessonsCounts.
//   7. Mount pasa signal al inline `getHistoryStatusSummary({signal})`.
//   8. Visibilitychange handler reutiliza el signal del ref para
//      re-fetches.
//   9. fetchHistory catch silencia AbortError (no toast).
//  10. config/api.js: 3 helpers aceptan options y forwardean a
//      fetchWithAuth.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _API_PATH = join(__dirname, '..', 'config', 'api.js');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const apiSrc = readFileSync(_API_PATH, 'utf8');


describe('[P1-HISTORY-ABORT] anchor + ref declaration', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HISTORY-ABORT\s*·\s*2026-05-23\]/);
    });

    it('declara _abortControllerRef con useRef(null)', () => {
        expect(src).toMatch(/_abortControllerRef\s*=\s*useRef\s*\(\s*null\s*\)/);
    });

    it('marker presente en config/api.js (forwarding de options)', () => {
        expect(apiSrc).toMatch(/\[P1-HISTORY-ABORT\s*·\s*2026-05-23\]/);
    });
});


describe('[P1-HISTORY-ABORT] mount useEffect crea controller + cleanup', () => {
    it('mount useEffect instancia new AbortController()', () => {
        // Buscamos el primer useEffect (mount, deps=[]). Antes del
        // siguiente useEffect debe aparecer new AbortController().
        const mountIdx = src.indexOf('fetchHistory({ signal });');
        expect(mountIdx).toBeGreaterThan(-1);
        const before = src.slice(Math.max(0, mountIdx - 800), mountIdx);
        expect(before).toMatch(/new\s+AbortController\s*\(\s*\)/);
        expect(before).toMatch(/_abortControllerRef\.current\s*=\s*controller/);
    });

    it('cleanup return llama controller.abort()', () => {
        // El return del mount useEffect debe contener controller.abort().
        const returnIdx = src.indexOf('controller.abort()');
        expect(returnIdx).toBeGreaterThan(-1);
        const around = src.slice(Math.max(0, returnIdx - 400), returnIdx + 100);
        expect(around).toMatch(/return\s*\(\s*\)\s*=>\s*\{/);
    });
});


describe('[P1-HISTORY-ABORT] fetchHistory signature + signal usage', () => {
    it('fetchHistory firma acepta ({ signal } = {})', () => {
        expect(src).toMatch(
            /const\s+fetchHistory\s*=\s*async\s*\(\s*\{\s*signal\s*\}\s*=\s*\{\s*\}\s*\)\s*=>/
        );
    });

    it('fetchHistory pasa signal a getHistoryList', () => {
        expect(src).toMatch(/getHistoryList\s*\(\s*\{\s*signal\s*\}\s*\)/);
    });

    it('fetchHistory catch silencia AbortError sin toast', () => {
        // El catch debe tener early-return para AbortError ANTES del toast.
        const catchIdx = src.indexOf('Error fetching history:');
        expect(catchIdx).toBeGreaterThan(-1);
        const before = src.slice(Math.max(0, catchIdx - 600), catchIdx);
        // El early-return AbortError debe estar antes del console.error.
        expect(before).toMatch(/error\.name\s*===\s*['"]AbortError['"]/);
    });

    it('finally guard evita setLoading post-abort', () => {
        const finallyIdx = src.indexOf('setLoading(false)');
        expect(finallyIdx).toBeGreaterThan(-1);
        // Antes del setLoading(false) debe haber un check de signal.aborted.
        const around = src.slice(Math.max(0, finallyIdx - 200), finallyIdx + 50);
        expect(around).toMatch(/signal\s*\.aborted|!\s*signal\s*\|\|/);
    });
});


describe('[P1-HISTORY-ABORT] _fetchLessonsCounts signature + signal usage', () => {
    it('_fetchLessonsCounts firma acepta ({ signal } = {})', () => {
        expect(src).toMatch(
            /const\s+_fetchLessonsCounts\s*=\s*\(\s*\{\s*signal\s*\}\s*=\s*\{\s*\}\s*\)\s*=>/
        );
    });

    it('_fetchLessonsCounts pasa signal a getLessonsCounts', () => {
        // Buscamos el bloque del helper y verificamos que getLessonsCounts
        // se invoca con { signal }.
        const helperIdx = src.indexOf('const _fetchLessonsCounts');
        expect(helperIdx).toBeGreaterThan(-1);
        const block = src.slice(helperIdx, helperIdx + 1200);
        expect(block).toMatch(/getLessonsCounts\s*\(\s*\{\s*signal\s*\}\s*\)/);
    });
});


describe('[P1-HISTORY-ABORT] visibilitychange reutiliza el signal', () => {
    it('visibilitychange handler lee _abortControllerRef.current.signal', () => {
        // El handler de visibilitychange debe leer el signal del ref
        // para que el abort cubra también los re-fetches.
        const vBlockIdx = src.indexOf('_onVisibilityChange');
        expect(vBlockIdx).toBeGreaterThan(-1);
        const block = src.slice(vBlockIdx, vBlockIdx + 3000);
        expect(block).toMatch(/_abortControllerRef\.current\?\.signal/);
        // Tanto fetchHistory como _fetchLessonsCounts en el handler
        // deben recibir el signal.
        expect(block).toMatch(/fetchHistory\s*\(\s*\{\s*signal:/);
        expect(block).toMatch(/_fetchLessonsCounts\s*\(\s*\{\s*signal:/);
    });
});


describe('[P1-HISTORY-ABORT] inline getHistoryStatusSummary del mount pasa signal', () => {
    it('mount inline Promise.race envuelve getHistoryStatusSummary({signal})', () => {
        expect(src).toMatch(/getHistoryStatusSummary\s*\(\s*\{\s*signal\s*\}\s*\)/);
    });
});


describe('[P1-HISTORY-ABORT] config/api.js forwarding de options', () => {
    it('getHistoryList acepta options y forwardea a fetchWithAuth', () => {
        expect(apiSrc).toMatch(
            /export\s+const\s+getHistoryList\s*=\s*\(\s*options\s*=\s*\{\s*\}\s*\)\s*=>\s*fetchWithAuth\(\s*['"]\/api\/plans\/history-list['"]\s*,\s*options\s*\)/
        );
    });

    it('getLessonsCounts acepta options y forwardea a fetchWithAuth', () => {
        expect(apiSrc).toMatch(
            /export\s+const\s+getLessonsCounts\s*=\s*\(\s*options\s*=\s*\{\s*\}\s*\)\s*=>\s*fetchWithAuth\(\s*['"]\/api\/plans\/lessons-counts['"]\s*,\s*options\s*\)/
        );
    });

    it('getHistoryStatusSummary acepta options y forwardea a fetchWithAuth', () => {
        expect(apiSrc).toMatch(
            /export\s+const\s+getHistoryStatusSummary\s*=\s*\(\s*options\s*=\s*\{\s*\}\s*\)\s*=>\s*fetchWithAuth\(\s*['"]\/api\/plans\/history-status-summary['"]\s*,\s*options\s*\)/
        );
    });
});
