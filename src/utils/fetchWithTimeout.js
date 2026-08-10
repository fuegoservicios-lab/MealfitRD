// [P1-AUTH-TIMEOUT · 2026-08-10] Tiempo límite para las peticiones del flujo de
// autenticación.
//
// EL FALLO QUE CIERRA: en una conexión colgada-pero-abierta (portal cautivo, celda
// saturada, salto de wifi a datos — el pan de cada día en móvil dominicano) `fetch`
// NO resuelve ni rechaza. Nunca. El `await` no vuelve, el `setLoading(false)` de
// después no se ejecuta jamás, y el botón queda deshabilitado con «Enviando código…»
// para siempre. La única salida es matar la app. En una app de tienda eso es un
// usuario perdido, y si le toca al revisor, un rechazo.
//
// POR QUÉ NO SE REUSA EL DE `config/api.ts`: ese módulo ya tiene esta defensa
// (marcador P1-5 · REQUEST-TIMEOUT), pero importa `getBackendToken` de `authClient`,
// así que hacer que `authClient` importe de él cerraría un ciclo. Este helper es la
// misma idea sin dependencias — y vive suelto a propósito para que el flujo de auth,
// que corre ANTES de que haya sesión, no dependa de la capa que necesita una.
//
// Los plazos son cortos a propósito, al revés que los 60 s de `api.ts`: allí el
// riesgo es abortar una generación legítimamente lenta; aquí el usuario está
// mirando la pantalla con el dedo encima del botón, y 60 s son una eternidad.

/** Plazo por defecto: el usuario está esperando, mirando. */
export const AUTH_TIMEOUT_MS = 20000;

/** Plazo corto para lo que es «mejor esfuerzo» y no debe retener al usuario. */
export const AUTH_BEST_EFFORT_TIMEOUT_MS = 8000;

/**
 * `fetch` que SIEMPRE termina. Al vencer el plazo rechaza con un error cuyo
 * `code` es `request_timeout`, para que quien llame pueda distinguirlo de un
 * fallo de red y dar un mensaje honesto.
 *
 * Respeta un `signal` que ya venga en `init`: si el llamador cancela, se cancela.
 */
export async function fetchWithTimeout(url, init = {}, timeoutMs = AUTH_TIMEOUT_MS) {
    // 0 desactiva el plazo — kill switch por si algún día abortara algo legítimo.
    if (!timeoutMs || timeoutMs <= 0) return fetch(url, init);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Si el llamador trae su propio signal, encadenarlo: cualquiera de los dos aborta.
    const externo = init.signal;
    const alAbortar = () => controller.abort();
    if (externo) {
        if (externo.aborted) controller.abort();
        else externo.addEventListener('abort', alAbortar, { once: true });
    }

    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
        // Distinguir «venció el plazo» de «el llamador canceló»: solo lo primero
        // es un problema de red que merece mensaje al usuario.
        if (err?.name === 'AbortError' && !externo?.aborted) {
            const e = new Error('La petición tardó demasiado.');
            e.code = 'request_timeout';
            e.name = 'TimeoutError';
            throw e;
        }
        throw err;
    } finally {
        clearTimeout(timer);
        if (externo) externo.removeEventListener('abort', alAbortar);
    }
}
