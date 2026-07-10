import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// [P1-MOBILE-RECOVERY-RESUME · 2026-07-09] Ancla de regresión source-parse.
//
// Bug reportado (móvil, reincidente): tras completar un plan, la pantalla de carga quedaba COLGADA en
// "Diseñando tu plan" (cronómetro avanzando) al RE-ENTRAR a la app desde segundo plano — el user tenía
// que MATAR y reabrir la app. Causa raíz: en iOS el SSE muere en SILENCIO al mandar la app a background
// (el `await reader.read()` queda colgado sin rechazar) → ningún handler corre → la pantalla queda en
// 'generating' con streamPhase en su último valor (NO recovery_mode). El plan YA está persistido en el
// backend y su KV pudo limpiarse (ack) → pending-status devuelve 'none' o 'complete'.
//
// El reconciliador: gate por `status` (loading arriba, NO streamPhase), dispara en RESUME
// (visibilitychange/focus/pageshow) + watchdog por elapsed, y maneja 'complete' (→dashboard) Y 'none'
// (KV limpia = zombie → dashboard si hay flag + elapsed). El comportamiento runtime (timers + listeners de
// visibilidad + SSE muerto) es caro de renderizar fiable en jsdom; este test source-parse fija que el
// bloque exista con sus propiedades clave. tooltip-anchor emparejado: P1-MOBILE-RECOVERY-RESUME en Plan.jsx.

const _here = dirname(fileURLToPath(import.meta.url));
const _src = readFileSync(join(_here, '..', 'pages', 'Plan.jsx'), 'utf-8');

// Aísla el bloque del reconciliador para que los asserts no matcheen otras partes del archivo.
const _idx = _src.indexOf('P1-MOBILE-RECOVERY-RESUME');
const _block = _idx > -1 ? _src.slice(_idx, _idx + 8000) : '';

describe('P1-MOBILE-RECOVERY-RESUME — reconciliador de pantalla de carga', () => {
    it('el marker/tooltip-anchor está presente', () => {
        expect(_idx).toBeGreaterThan(-1);
    });

    it('gatea por `status` (loading arriba), NO por streamPhase=recovery_mode', () => {
        // El gate viejo (streamPhase !== 'recovery_mode') NO cubría la pantalla zombie.
        expect(_block).toContain("status === 'generating'");
        expect(_block).toContain("status === 'analyzing'");
    });

    it('pollea /api/plans/pending-status', () => {
        expect(_block).toMatch(/\/api\/plans\/pending-status/);
    });

    it('dispara en resume real: visibilitychange + focus + pageshow', () => {
        expect(_block).toContain("addEventListener('visibilitychange', onResume)");
        expect(_block).toContain("addEventListener('focus', onResume)");
        expect(_block).toContain("addEventListener('pageshow', onResume)");
    });

    it("maneja 'none' (KV limpia = zombie), no solo 'complete'", () => {
        expect(_block).toContain("pd?.status === 'complete'");
        expect(_block).toContain("pd?.status === 'none'");
    });

    it('tiene watchdog por elapsed (SSE muerto sin resume)', () => {
        expect(_block).toContain('watchdog');
        expect(_block).toMatch(/13 \* 60/);
    });

    it('navegación casi instantánea: ráfaga al volver + intervalo corto', () => {
        // Ráfaga: chequeo inmediato + rechequeos cortos (por si iOS despierta la red con lag).
        expect(_block).toContain('burstTimers');
        expect(_block).toMatch(/setTimeout\(\(\) => reconcile\('resume'\), 500\)/);
        // Intervalo corto (3s) para catch rápido si el evento de resume tarda.
        expect(_block).toMatch(/setInterval\(\(\) => reconcile\('interval'\), 3000\)/);
        // Una vez que hubo resume, el intervalo también navega al completar (no solo los eventos).
        expect(_block).toContain('resumed');
    });

    it('al reconciliar navega al /dashboard con replace', () => {
        expect(_block).toContain("navigate('/dashboard', { replace: true })");
    });

    it('limpia listeners + interval en el cleanup (sin fugas)', () => {
        expect(_block).toContain('clearInterval(interval)');
        expect(_block).toContain("removeEventListener('visibilitychange', onResume)");
        expect(_block).toContain("removeEventListener('focus', onResume)");
        expect(_block).toContain("removeEventListener('pageshow', onResume)");
    });
});
