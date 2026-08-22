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

// [P2-I18N-E2E-MONOLINGUE · 2026-08-21] Las reglas de axe apagadas viven AQUI y no en
// `accesibilidad.spec.js`, porque desde hoy hay DOS specs que corren axe (el otro mide
// las rutas traducidas). Dos listas con las mismas exclusiones y los motivos en una sola
// es exactamente el drift que este repo cierra a mano una y otra vez.
/**
 * Reglas apagadas, con su razón. NO es una lista de cosas que arreglar luego:
 * es una lista de decisiones ya tomadas.
 */
export const REGLAS_APAGADAS = {
    // [P1-VIEWPORT-ZOOM-LOCK] `user-scalable=no` es DECISIÓN DEL DUEÑO, y ya se
    // revirtió una vez (`P2-A11Y-VIEWPORT-ZOOM` la quitó por accesibilidad y se
    // volvió a poner: se quiere el tacto de app nativa). El coste WCAG 1.4.4 está
    // aceptado por escrito y la vía real es la escala de fuente del sistema
    // operativo. Si esta regla se enciende, el gate se pondría rojo en TODAS las
    // rutas por una decisión de producto — y un gate que siempre está rojo por
    // algo que no vas a cambiar es un gate que se acaba ignorando entero.
    // Cambiar esto exige reabrir la decisión, no editar esta línea.
    'meta-viewport': 'decisión de producto P1-VIEWPORT-ZOOM-LOCK, documentada en CLAUDE.md',
};

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

/**
 * [P2-I18N-E2E-MONOLINGUE · 2026-08-21] Una variante de `test` que arranca el navegador
 * con un idioma ya elegido.
 *
 * MEDIDO antes de esto: `grep -rniE "locale|lang|i18n|fr-FR" e2e/` daba UN hit, y era la
 * palabra «franja» en un comentario. Los dos únicos instrumentos de este repo con motor
 * de render —axe sobre 9 rutas, y el medidor de desbordes— corrían en CI midiendo SOLO
 * español. O sea: la app se despliega en cinco idiomas y ninguna prueba de navegador ha
 * cargado nunca ninguno de los otros cuatro.
 *
 * Y es justo el instrumento que hace falta: los guards del repo son parsers de código y
 * ninguno puede ver que «Garde-manger» no cabe donde cabía «Nevera». Eso solo lo sabe un
 * motor de render con la fuente cargada.
 *
 * POR QUÉ `addInitScript` Y NO NAVEGAR Y CAMBIAR EL SELECTOR: el script corre ANTES de
 * cualquier código de la página, así que el primer paint ya sale en el idioma pedido. Ir
 * al selector mediría la app DESPUÉS de un cambio de idioma, que es otro caso —y además
 * añadiría una dependencia de la UI de Configuración a pruebas que no van de eso.
 *
 * UNA CORRECCIÓN, porque cuesta creerla: esto SÍ funciona en las rutas de marketing. El
 * motor fuerza `es-DO` ahí, pero sólo para la AUTODETECCIÓN — `getStoredLocale()`
 * devuelve lo guardado antes de consultar el guard de superficie («lo guardado gana sobre
 * lo detectado, siempre», P1-AUTO-LOCALE). Sembrar la preferencia gana en todas partes.
 *
 * @param {string} locale p.ej. 'fr-FR'
 */
export function conIdioma(locale) {
    return test.extend({
        page: async ({ page }, use) => {
            await page.addInitScript(
                ([clave, valor]) => {
                    try { window.localStorage.setItem(clave, valor); } catch { /* modo privado */ }
                },
                ['mealfit_locale', locale],
            );
            await use(page);
        },
    });
}

export { expect };
