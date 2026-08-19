// @ts-check
/**
 * [P1-E2E-SIN-RED-EXTERNA · 2026-08-18] La suite deja de hablar con producción.
 *
 * LO QUE PASÓ, medido. Al añadir Firefox y WebKit, dos pruebas empezaron a
 * fallar sólo cuando corrían los tres motores a la vez. El mensaje, sacado del
 * informe en JSON en vez de adivinado:
 *
 *     Failed to load resource: the server responded with a status of 429 ()
 *       @ https://ep-…-.neonauth.…aws.neon.tech/…
 *
 * O sea: cada carga de página de cada test estaba llamando al servicio de
 * autenticación REAL, el de producción, y con tres motores en paralelo se pasó
 * del cupo y nos limitó. No era un fallo de la página; era la suite pegándole a
 * un servicio vivo. Con un solo motor cabía bajo el límite, así que llevaba
 * meses ocurriendo sin que nada lo dijera —el rate limit fue el mensajero, no la
 * enfermedad—.
 *
 * Y cablear esto a CI sin arreglarlo habría multiplicado el problema: los
 * runners de GitHub, en cada push, contra el auth de producción. Este proyecto
 * ya se comió una vez la versión cara de esta lección, cuando el 92,8% de la
 * telemetría de producción resultó ser su propia suite de tests escribiendo.
 *
 * CÓMO. Todo lo que no sea el servidor de la prueba se responde localmente. No
 * se ABORTA a propósito: una petición abortada deja su propio `console.error` en
 * el navegador, y hay tests cuya aserción es justamente que no haya ninguno —el
 * remedio habría fabricado el síntoma—.
 *
 * Qué NO rompe esto: ningún spec depende de un recurso externo. Los que hablan
 * de dominios de fuera lo hacen para exigir que NO se contacten (P3-SELF-HOST-
 * FONTS), y eso sigue cumpliéndose: no salir es más fuerte que no salir a ese.
 */
import { test as base, expect } from '@playwright/test';

const ES_LOCAL = (host) => host === '127.0.0.1' || host === 'localhost' || host === '[::1]';

export const test = base.extend({
    page: async ({ page }, use) => {
        await page.route('**/*', async (route) => {
            let host = '';
            try { host = new URL(route.request().url()).hostname; } catch { /* data:, blob: */ }
            if (!host || ES_LOCAL(host)) return route.continue();
            // Respuesta local, vacía y válida. Para el cliente de auth equivale a
            // «no hay sesión», que es el estado de un visitante anónimo y el que
            // estas pruebas ejercitan de todos modos.
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: '{}',
            });
        });
        await use(page);
    },
});

export { expect };
