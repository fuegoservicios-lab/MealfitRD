/**
 * [P1-PENDING-STATUS-RETRY · 2026-07-31] Tests EJECUTABLES del guard que decide si
 * rebotar al usuario al formulario.
 *
 * El bug: el guard preguntaba a `/pending-status` UNA vez, y un reinicio del backend
 * mata el SSE y deja ese endpoint inalcanzable en el mismo instante — la consulta que
 * debía rescatar al usuario la disparaba el mismo evento que garantizaba su fallo.
 * Medido el 31 jul: 7s de indisponibilidad, con el plan ya persistido y aprobado.
 *
 * La distinción de la que depende todo es `null` ("no sé") frente a `'none'` ("no hay
 * nada"). Un test parser-based no puede demostrarla porque no ejecuta nada; por eso el
 * helper vive en `utils/` y estos tests lo llaman de verdad.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../utils/safeLocalStorage', () => ({ safeLocalStorageGet: vi.fn(() => null) }));

import { fetchWithAuth } from '../config/api';
import { peekPendingStatusWithRetry, PENDING_STATUS_RETRY_DELAYS_MS } from '../utils/pendingStatusRetry';

const SIN_ESPERA = [0, 0, 0, 0];
const ok = (status) => ({ ok: true, json: async () => ({ status }) });
const caido = () => { throw new TypeError('Failed to fetch'); };

beforeEach(() => { vi.mocked(fetchWithAuth).mockReset(); });

describe('[P1-PENDING-STATUS-RETRY] distinguir un reinicio de una caída real', () => {
    it('el caso del incidente: caído los primeros intentos, luego responde complete', () => {
        // 7s de reinicio ≈ los dos primeros intentos fallan y el tercero encuentra el plan.
        vi.mocked(fetchWithAuth)
            .mockImplementationOnce(caido)
            .mockImplementationOnce(caido)
            .mockResolvedValueOnce(ok('complete'));

        return expect(peekPendingStatusWithRetry(SIN_ESPERA)).resolves.toBe('complete');
    });

    it('inalcanzable siempre devuelve null, NUNCA "none"', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(caido);

        const fase = await peekPendingStatusWithRetry(SIN_ESPERA);
        expect(fase).toBeNull();
        expect(fase).not.toBe('none');   // colapsar los dos ES el bug
        expect(vi.mocked(fetchWithAuth)).toHaveBeenCalledTimes(SIN_ESPERA.length);
    });

    it('un "none" REAL del backend se devuelve tal cual y no se reintenta', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(ok('none'));

        await expect(peekPendingStatusWithRetry(SIN_ESPERA)).resolves.toBe('none');
        // Respuesta válida ⇒ un solo intento: reintentar aquí retrasaría al usuario
        // 18s para acabar en el mismo sitio.
        expect(vi.mocked(fetchWithAuth)).toHaveBeenCalledTimes(1);
    });

    it('si responde a la primera no reintenta', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue(ok('generating'));

        await expect(peekPendingStatusWithRetry(SIN_ESPERA)).resolves.toBe('generating');
        expect(vi.mocked(fetchWithAuth)).toHaveBeenCalledTimes(1);
    });

    it('un 5xx durante el arranque cuenta como inalcanzable, no como respuesta', async () => {
        // El backend acepta conexiones antes de estar listo: `ok:false` NO es un veredicto.
        vi.mocked(fetchWithAuth)
            .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
            .mockResolvedValueOnce(ok('complete'));

        await expect(peekPendingStatusWithRetry(SIN_ESPERA)).resolves.toBe('complete');
    });

    it('un body sin status tampoco es veredicto', async () => {
        vi.mocked(fetchWithAuth)
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
            .mockResolvedValueOnce(ok('complete'));

        await expect(peekPendingStatusWithRetry(SIN_ESPERA)).resolves.toBe('complete');
    });
});

describe('[P1-PENDING-STATUS-RETRY] la ventana cubre un reinicio medido', () => {
    it('los reintentos por defecto suman más que los ~7s que tarda el backend', () => {
        const total = PENDING_STATUS_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
        expect(total).toBeGreaterThan(7000);
        // Y no tanto como para que el usuario crea que se colgó.
        expect(total).toBeLessThanOrEqual(30000);
        expect(PENDING_STATUS_RETRY_DELAYS_MS[0]).toBe(0); // el primero, inmediato
    });
});
