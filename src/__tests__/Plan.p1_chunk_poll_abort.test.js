// [P1-PLAN-CHUNK-POLL-ABORT · 2026-05-24] Tests parser-based.
//
// Bug original (audit production-readiness 2026-05-24):
//   Plan.jsx polling cada 5s a `getPlanChunkStatus(planId)` NO usaba
//   AbortController. El cleanup solo limpiaba clearInterval, pero la fetch
//   en-vuelo al desmontar seguía ejecutando + llamaba
//   `setFailedChunks` / `setUserActionRequired` / `setRecoveryExhausted`
//   sobre componente desmontado → warning React + memory retention.
//   Mismo bug exacto que P1-PROD-FINAL-1 cerró en Dashboard.jsx y
//   P1-HISTORY-ABORT en History.jsx; Plan.jsx era el último polling sin
//   abort.
//
// Fix:
//   - `new AbortController()` scoped al useEffect del setInterval.
//   - `getPlanChunkStatus(newPlan.id, { signal })` forwardea el signal
//     (helper ya acepta options desde P1-PROD-FINAL-1).
//   - Guards `if (signal.aborted) return` antes y después de cada setter.
//   - Catch silencioso para AbortError (no es bug — cleanup esperado).
//   - Cleanup: `controller.abort()` + `clearInterval(intervalId)`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _PATH = join(__dirname, '..', 'pages', 'Plan.jsx');
const src = readFileSync(_PATH, 'utf8');


describe('[P1-PLAN-CHUNK-POLL-ABORT] anchor + setup', () => {
    it('marker presente en Plan.jsx', () => {
        expect(src).toMatch(/\[P1-PLAN-CHUNK-POLL-ABORT\s*·\s*2026-05-24\]/);
    });

    it('declara new AbortController() dentro del useEffect del polling', () => {
        // Encontramos el bloque del polling (busca el setInterval con 5000).
        const intervalIdx = src.indexOf('}, 5000);');
        expect(intervalIdx).toBeGreaterThan(-1);
        // El bloque anterior debe contener new AbortController.
        const before = src.slice(Math.max(0, intervalIdx - 2500), intervalIdx);
        expect(before).toMatch(/new\s+AbortController\s*\(\s*\)/);
        expect(before).toMatch(/const\s+signal\s*=\s*controller\.signal/);
    });
});


describe('[P1-PLAN-CHUNK-POLL-ABORT] signal forwarded a getPlanChunkStatus', () => {
    it('getPlanChunkStatus recibe { signal } en la llamada del interval', () => {
        // Verifica que el call se hace con el signal del controller del useEffect.
        expect(src).toMatch(/getPlanChunkStatus\s*\(\s*newPlan\.id\s*,\s*\{\s*signal\s*\}\s*\)/);
    });
});


describe('[P1-PLAN-CHUNK-POLL-ABORT] guards signal.aborted antes de setters', () => {
    it('al menos 2 checks de signal.aborted en el body del polling', () => {
        // El polling tiene multiple setters (setFailedChunks, setUserActionRequired,
        // setRecoveryExhausted). Requiere al menos 2 guards aborted alrededor.
        const intervalIdx = src.indexOf('}, 5000);');
        const block = src.slice(Math.max(0, intervalIdx - 2500), intervalIdx);
        const matches = block.match(/signal\.aborted/g) || [];
        expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('catch silencia AbortError (no console.error spam)', () => {
        // Después del catch debe haber un early-return para AbortError o signal.aborted.
        const errorIdx = src.indexOf("Error polling chunk status:");
        expect(errorIdx).toBeGreaterThan(-1);
        const before = src.slice(Math.max(0, errorIdx - 300), errorIdx);
        expect(before).toMatch(/AbortError|signal\.aborted/);
    });
});


describe('[P1-PLAN-CHUNK-POLL-ABORT] cleanup llama controller.abort()', () => {
    it('return de cleanup contiene controller.abort() y clearInterval', () => {
        // El cleanup debe llamar AMBOS: abort + clearInterval.
        const abortIdx = src.indexOf('controller.abort()');
        expect(abortIdx).toBeGreaterThan(-1);
        const around = src.slice(Math.max(0, abortIdx - 200), abortIdx + 200);
        expect(around).toMatch(/return\s*\(\s*\)\s*=>\s*\{/);
        expect(around).toMatch(/clearInterval\s*\(\s*intervalId\s*\)/);
    });
});
