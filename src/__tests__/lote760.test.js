// [P1-PLAN-LOTE-760 · 2026-09-28] El coach termina su respuesta aunque salgas de la app; «Detener» la corta de verdad.
// Caso vivo: «Cómo estás?» → el dueño salió de la app → «No llegó la respuesta del coach». La generación vivía dentro de
// la conexión; ahora corre en su propio hilo del servidor y cortar el fetch ya no la para: lo hace `/api/chat/stop`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const AP = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8').split(String.fromCharCode(13)).join('');

describe('[760] «Detener» avisa al servidor', () => {
    it('llama a /api/chat/stop con el chat vigente antes de cortar el fetch', () => {
        const h = AP.indexOf('const _avisarStopAlServidor = () => {');
        expect(h).toBeGreaterThan(-1);
        const helper = AP.slice(h, h + 500);
        expect(helper).toContain("fetchWithAuth('/api/chat/stop'");
        expect(helper).toContain('body: JSON.stringify({ session_id: currentSessionIdRef.current }),');
        expect(helper).toContain('.catch(() => {');   // sin red no rompe la UI
        const i = AP.indexOf('const handleStopGeneration = () => {');
        const t = AP.slice(i, i + 1600);
        const stop = t.indexOf('if (_ctrl || isTurnActiveRef.current) _avisarStopAlServidor();');
        expect(stop).toBeGreaterThan(-1);
        expect(stop).toBeLessThan(t.indexOf('_ctrl.abort();'));
    });
});
