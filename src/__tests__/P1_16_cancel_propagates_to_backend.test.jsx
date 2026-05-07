/**
 * Tests P1-16: `cancelGeneration` envía POST a `/api/plans/cancel` para
 * propagar el cancel al backend antes de abortar el SSE local.
 *
 * Bug original (audit P1-16):
 *   `cancelGeneration` solo llamaba `globalAbortController.abort('UserCancelled')`
 *   y reseteaba el controller. El backend NO recibía señal de cancel — el
 *   pipeline LLM seguía corriendo hasta terminar el día actual y persistía
 *   el plan en DB. Resultado: el usuario "canceló" pero a los 30s aparecía
 *   un plan en su dashboard vía Realtime UPDATE de `meal_plans`. Cuota de
 *   LLM consumida innecesariamente + UX confuso.
 *
 * Fix:
 *   1. Variable módulo `globalCancelSessionId` retiene el session_id de la
 *      generación en vuelo (seteado al inicio de `generateAIPlanStream`,
 *      cleared en el finally).
 *   2. `cancelGeneration` hace `fetch('/api/plans/cancel', POST)` con
 *      `session_id` antes de abortar el SSE local. Fire-and-forget para
 *      no bloquear el cancel del cliente si la red está lenta.
 *   3. Backend (P1-16 backend) registra el session_id; el SSE handler
 *      verifica cooperativamente y cancela el `_pipeline_task`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PLAN_PATH = path.resolve(__dirname, '..', 'pages', 'Plan.jsx');
const src = fs.readFileSync(PLAN_PATH, 'utf-8');
const codeOnly = src
    .split('\n')
    .filter((ln) => !ln.trim().startsWith('//'))
    .join('\n');


describe('P1-16 — Plan.jsx declara globalCancelSessionId', () => {
    it('Variable global `globalCancelSessionId` declarada con default null', () => {
        expect(codeOnly).toMatch(/let\s+globalCancelSessionId\s*=\s*null/);
    });

    it('Comentario [P1-16] documenta el rationale', () => {
        expect(src).toMatch(/\[P1-16\]/);
    });
});


describe('P1-16 — cancelGeneration hace POST al backend', () => {
    // Extraer cuerpo de cancelGeneration.
    const cancelMatch = codeOnly.match(
        /export\s+const\s+cancelGeneration\s*=\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\};/
    );
    const body = cancelMatch ? cancelMatch[1] : '';

    it('Cuerpo del handler extraído correctamente', () => {
        expect(body).toBeTruthy();
        expect(body.length).toBeGreaterThan(50);
    });

    it('Hace POST a /api/plans/cancel', () => {
        // Patrón canónico: `fetch('/api/plans/cancel', { method: 'POST', ... })`.
        const fetchPattern = /fetch\(\s*['"]\/api\/plans\/cancel['"]/;
        expect(body).toMatch(fetchPattern);
    });

    it('Envía session_id en el body del POST', () => {
        expect(body).toMatch(/session_id\s*:\s*sessionToCancel/);
    });

    it('El POST es fire-and-forget (no await ni bloqueo del cancel local)', () => {
        // Patrón: `fetch(...).catch(...)` SIN `await` que precediera al fetch.
        // Verificación: el `globalAbortController.abort(...)` ocurre DESPUÉS
        // del fetch SIN un await en medio.
        const fetchIdx = body.indexOf('fetch(');
        const abortIdx = body.indexOf('globalAbortController.abort');
        expect(fetchIdx).toBeGreaterThan(-1);
        expect(abortIdx).toBeGreaterThan(-1);
        // Buscamos `await` ANTES del abort que no esté entre comentarios.
        const between = body.slice(fetchIdx, abortIdx);
        expect(between).not.toMatch(/\bawait\s+fetch/);
    });

    it('El abort SSE local se ejecuta SIEMPRE (incluso si fetch falla)', () => {
        // Estructuralmente el abort debe estar después del try/catch del fetch
        // para garantizar fire-and-forget. Verificamos que el abort no esté
        // dentro del try/catch del fetch.
        const tryMatch = body.match(/try\s*\{\s*[\s\S]*?\}\s*catch\s*\{[\s\S]*?\}/);
        if (tryMatch) {
            const tryBlock = tryMatch[0];
            expect(tryBlock).not.toMatch(/globalAbortController\.abort/);
        }
        // Y el abort sí está presente fuera del try.
        expect(body).toMatch(/globalAbortController\.abort\(\s*['"]UserCancelled['"]\s*\)/);
    });

    it('Limpia globalCancelSessionId al final', () => {
        expect(body).toMatch(/globalCancelSessionId\s*=\s*null/);
    });
});


describe('P1-16 — generateAIPlanStream registra session_id activo', () => {
    it('Setea globalCancelSessionId al inicio del flujo', () => {
        // Patrón canónico: `globalCancelSessionId = userId || guestSessionId`
        // o vía const intermedio.
        expect(codeOnly).toMatch(/globalCancelSessionId\s*=\s*[A-Za-z_$][\w$]*/);
    });

    it('Limpia globalCancelSessionId en el finally', () => {
        // Patrón: `globalCancelSessionId = null` dentro del bloque finally
        // junto con globalGenerationPromise = null y globalAbortController = null.
        const finallyMatch = codeOnly.match(/finally\s*\{([\s\S]*?)\n\s*\}/);
        expect(finallyMatch).toBeTruthy();
        const finallyBody = finallyMatch[1];
        expect(finallyBody).toMatch(/globalCancelSessionId\s*=\s*null/);
    });
});


describe('P1-16 — keepalive flag para sobrevivir teardown del page', () => {
    // El POST debe tener `keepalive: true` para que el navegador NO aborte
    // la request si el usuario navega a otra página inmediatamente después
    // de clickear "Cancelar" (caso típico: cancelar + dashboard).
    const cancelMatch = codeOnly.match(
        /export\s+const\s+cancelGeneration\s*=\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\};/
    );
    const body = cancelMatch[1];

    it('fetch options incluye keepalive: true', () => {
        expect(body).toMatch(/keepalive\s*:\s*true/);
    });
});
