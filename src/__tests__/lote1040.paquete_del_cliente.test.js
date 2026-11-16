// [P1-PLAN-LOTE-1040 · A-33 · 2026-11-16] El chat le dice al servidor qué paquete de la app lo está usando.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { paqueteDelCliente } from '../utils/chatPerf';

describe('[P1-PLAN-LOTE-1040] paquete del cliente', () => {
    it('en la web es el sello del build (ordenable, como el de la OTA)', () => {
        expect(paqueteDelCliente()).toMatch(/^web:\d{8}-\d{6}$/);
    });

    it('viaja en el cuerpo de /api/chat/stream, no en una cabecera (nada de preflight nuevo en nativo)', () => {
        const agente = readFileSync(resolve(__dirname, '../pages/AgentPage.jsx'), 'utf8');
        expect(agente).toContain('bundle: paqueteDelCliente(),');
        const api = readFileSync(resolve(__dirname, '../config/api.ts'), 'utf8');
        expect(api).not.toMatch(/X-[A-Za-z-]*Bundle/);
    });
});
