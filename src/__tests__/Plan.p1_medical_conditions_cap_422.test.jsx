import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01 · IMPORTANT-3-FIX] Regresión de code
// review (verificado ejecutando): cuando el backend rechaza `/analyze` /
// `/analyze/stream` con HTTP 422 `{detail: {code: "too_many_medical_conditions",
// max: 3, message: "..."}}` (`_validate_medical_conditions_cap`, backend/
// routers/plans.py), el catch de `processPlan` en `Plan.jsx` NO tenía un branch
// para ese `error.code`. Caía por TODOS los `if` existentes (pipeline_already_
// running / plan_recently_created / critical_restriction / budget_insufficient
// / llm_unavailable / quota_exceeded / sse_eof_no_result / sse_idle / offline_
// unavailable / rate_limited) hasta el check genérico `_hasInProgressFlag` —
// que es SIEMPRE `true` en este punto porque el flag `mealfit_plan_in_progress`
// se setea ANTES de disparar el fetch. Resultado: toast FALSO "tu plan se
// sigue generando en segundo plano" + redirect a /dashboard SIN limpiar el
// flag → flag huérfano que `<PendingPipelineRecovery />` pollea indefinidamente
// sobre un pipeline que nunca arrancó. Trigger real: perfil legacy guardado
// con >3 condiciones (texto libre pre-P1-MEDICAL-CONDITIONS-CAP) dándole a
// "renovar".
//
// Cobertura en dos capas (mismo patrón que Plan.p1_budget_422.test.jsx /
// Plan.p1_quota_402.test.jsx):
//   1. Funcional: `generateAIPlanStream` (exportado, testable en aislamiento)
//      propaga `error.code === 'too_many_medical_conditions'` + el `message`
//      real del backend — NO hay harness para montar el componente `<Plan />`
//      completo y disparar su `useEffect` interno (el resto de branches del
//      catch tampoco lo tienen), así que la capa 2 cubre el catch en sí.
//   2. Parser-based sobre el source de Plan.jsx: el branch existe, corre
//      ANTES de `_hasInProgressFlag`, limpia el flag, muestra el mensaje del
//      backend, y (decisión explícita del coordinador) NO navega.

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
    getPlanChunkStatus: vi.fn(),
    retryPlanChunk: vi.fn(),
}));

vi.mock('../authClient', () => ({
    authClient: {
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
        from: vi.fn(),
    },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

import { fetchWithAuth } from '../config/api';
import { generateAIPlanStream } from '../pages/Plan';

// Response-like del backend: 422 con el contrato exacto de
// `_validate_medical_conditions_cap` (routers/plans.py).
const make422TooManyConditions = () => ({
    ok: false,
    status: 422,
    headers: { get: () => 'application/json' },
    json: async () => ({
        detail: {
            code: 'too_many_medical_conditions',
            max: 3,
            message: 'Para garantizar la calidad clínica del plan, selecciona máximo 3 condiciones prioritarias.',
        },
    }),
    text: async () => 'too_many_medical_conditions',
});

describe('P1-MEDICAL-CONDITIONS-CAP (IMPORTANT-3-FIX) — generateAIPlanStream propagation', () => {
    beforeEach(() => { vi.mocked(fetchWithAuth).mockReset(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('rechaza con code="too_many_medical_conditions" (NO "offline_unavailable") en 422 del cap', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(make422TooManyConditions());
        await expect(generateAIPlanStream({})).rejects.toMatchObject({ code: 'too_many_medical_conditions' });
    });

    it('preserva el message real del backend (el que el usuario debe leer)', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(make422TooManyConditions());
        try {
            await generateAIPlanStream({});
            throw new Error('debería haber rechazado');
        } catch (err) {
            expect(err.code).toBe('too_many_medical_conditions');
            expect(err.message).toBe(
                'Para garantizar la calidad clínica del plan, selecciona máximo 3 condiciones prioritarias.'
            );
            // El bug original degradaba a "Sin conexión con la IA" — ausente aquí.
            expect(err.message.toLowerCase()).not.toContain('conexión');
        }
    });

    it('NO reintenta el endpoint síncrono ante este 422 (validación determinista)', async () => {
        const mock = vi.mocked(fetchWithAuth).mockResolvedValue(make422TooManyConditions());
        await expect(generateAIPlanStream({})).rejects.toMatchObject({ code: 'too_many_medical_conditions' });
        expect(mock).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// Parser-based: el catch de `processPlan` (dentro del componente `Plan`, sin
// harness de montaje disponible) cablea el branch correctamente.
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _PLAN_JSX = join(__dirname, '..', 'pages', 'Plan.jsx');
const src = readFileSync(_PLAN_JSX, 'utf8');

const stripComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const codeOnly = stripComments(src);

describe('[P1-MEDICAL-CONDITIONS-CAP IMPORTANT-3-FIX] parser: catch de Plan.jsx', () => {
    it("declara el branch `error.code === 'too_many_medical_conditions'`", () => {
        expect(codeOnly).toMatch(/error\.code\s*===\s*'too_many_medical_conditions'/);
    });

    it('el branch corre ANTES del check `_hasInProgressFlag` (mismo motivo que los demás 422/402/409/429)', () => {
        const branchIdx = codeOnly.indexOf("error.code === 'too_many_medical_conditions'");
        const flagCheckIdx = codeOnly.indexOf('if (_hasInProgressFlag)');
        expect(branchIdx).toBeGreaterThan(-1);
        expect(flagCheckIdx).toBeGreaterThan(-1);
        expect(branchIdx).toBeLessThan(flagCheckIdx);
    });

    it('el body del branch limpia `mealfit_plan_in_progress` (evita el flag huérfano)', () => {
        const branchIdx = codeOnly.indexOf("error.code === 'too_many_medical_conditions'");
        const nextIfIdx = codeOnly.indexOf('if (error.code ===', branchIdx + 1);
        const body = codeOnly.slice(branchIdx, nextIfIdx > -1 ? nextIfIdx : branchIdx + 2000);
        // [P2-LOCALSTORAGE-SSOT · 2026-08-19] Via el envoltorio unico. Lo que este
        // ancla vigila no cambia: que el branch del 422 LIMPIE el flag, para no dejar
        // un `mealfit_plan_in_progress` huerfano que resucite una generacion muerta.
        expect(body).toMatch(/safeLocalStorageRemove\('mealfit_plan_in_progress'\)/);
    });

    it('el body del branch muestra un toast.error con `error.message` (el mensaje real del backend)', () => {
        const branchIdx = codeOnly.indexOf("error.code === 'too_many_medical_conditions'");
        const nextIfIdx = codeOnly.indexOf('if (error.code ===', branchIdx + 1);
        const body = codeOnly.slice(branchIdx, nextIfIdx > -1 ? nextIfIdx : branchIdx + 2000);
        expect(body).toMatch(/toast\.error\(/);
        expect(body).toMatch(/error\.message/);
    });

    it('el body del branch termina con `return` (no cae al fallthrough del flag huérfano)', () => {
        const branchIdx = codeOnly.indexOf("error.code === 'too_many_medical_conditions'");
        const nextIfIdx = codeOnly.indexOf('if (error.code ===', branchIdx + 1);
        const body = codeOnly.slice(branchIdx, nextIfIdx > -1 ? nextIfIdx : branchIdx + 2000);
        expect(body).toMatch(/\breturn\s*;/);
    });

    it('[decisión explícita del coordinador] el body del branch NO llama a navigate(...)', () => {
        const branchIdx = codeOnly.indexOf("error.code === 'too_many_medical_conditions'");
        const nextIfIdx = codeOnly.indexOf('if (error.code ===', branchIdx + 1);
        const body = codeOnly.slice(branchIdx, nextIfIdx > -1 ? nextIfIdx : branchIdx + 2000);
        expect(body).not.toMatch(/navigate\(/);
    });
});
