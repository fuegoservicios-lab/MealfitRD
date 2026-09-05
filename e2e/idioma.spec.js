// @ts-check
/**
 * [P2-I18N-E2E-MONOLINGUE · 2026-08-21] Ninguna prueba de navegador había cargado nunca
 * la app en otro idioma.
 *
 * MEDIDO antes de esto: `grep -rniE "locale|lang|i18n|fr-FR" e2e/` daba UN hit, y era la
 * palabra «franja» en un comentario. Los dos únicos instrumentos de este repo con motor
 * de render —axe sobre 9 rutas y el medidor de desbordes— corren en CI midiendo SOLO
 * español, mientras la app se despliega en cinco idiomas.
 *
 * Y es justo el instrumento que falta: todos los guards del repo son parsers de código
 * fuente, y ninguno puede ver que «Garde-manger» no cabe donde cabía «Nevera». El ancho
 * intrínseco de un texto sólo lo sabe un motor de render con la fuente cargada.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ SE MIDE, Y POR QUÉ NO ES «LAS MISMAS RUTAS QUE EL RESTO»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La tentación era parametrizar por idioma los dos specs que ya existen. Sería teatro:
 * sus rutas son las de MARKETING, y el landing **no está traducido** (14 páginas
 * estáticas, fuera del alcance declarado en `backend/docs/i18n_dashboard.md`). Cargarlas
 * en francés mediría español con otro `<html lang>` — un test que no puede fallar.
 *
 * Las rutas que SÍ están traducidas y no piden sesión son dos: `/login` y
 * `/reset-password`, cuyo copy pasó por `t()` en `P1-I18N-AUTH-COPY`. Son pocas, y son
 * las correctas: son además la PRIMERA pantalla que ve alguien que no lee español, así
 * que un desborde ahí se lo encuentra antes que nada de la app.
 *
 * LO QUE ESTO NO CUBRE, y conviene decirlo en vez de que parezca cubierto: el dashboard
 * —donde vive la barra de pestañas de `P2-I18N-NAV-DESBORDE` y el 95 % del copy
 * traducido— necesita sesión, y este repo no tiene fixture de autenticación. Ese es el
 * trabajo que desbloquearía medir de verdad el desborde de «Garde-manger».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CORRECCIÓN AL PLAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * El plan avisaba de que el fixture «solo surte efecto en rutas de dashboard, porque
 * `i18n/index.js` fuerza es-DO en las de marketing». Es cierto para la AUTODETECCIÓN y
 * sólo para ella: `getStoredLocale()` devuelve lo GUARDADO antes de consultar el guard de
 * superficie («lo guardado gana sobre lo detectado, siempre», P1-AUTO-LOCALE). Sembrar
 * `mealfit_locale` gana en todas las rutas. La trampa existe, pero no donde se decía.
 */
import { conIdioma, expect, REGLAS_APAGADAS } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

/** Los cuatro traducidos. `es-DO` ya lo cubren los otros dos specs. */
const IDIOMAS = ['en-US', 'pt-BR', 'fr-FR', 'it-IT'];

/** Públicas Y traducidas. Ver el bloque de arriba sobre por qué son sólo dos. */
const RUTAS = [
    ['/login', 'entrada de sesión'],
    ['/reset-password', 'recuperar contraseña'],
];

/**
 * 320px es el suelo del contrato del repo (un iPhone con Display Zoom), y es donde un
 * idioma más largo rompe primero. Se mide sólo ahí y no en los cuatro anchos: si cabe a
 * 320 cabe en los demás, y 4 idiomas × 2 rutas × 4 anchos serían 32 cargas por motor.
 */
const ANCHO_SUELO = 320;

async function desbordes(page) {
    return page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const fuera = [];
        document.querySelectorAll('body *').forEach((el) => {
            const b = el.getBoundingClientRect();
            if (b.width === 0 || b.height === 0) return;
            // La caja de 1px de `srOnly` desborda a propósito, para lectores de pantalla.
            if (b.width <= 2 && b.height <= 2) return;
            // [P2-I18N-E2E-MONOLINGUE · 2026-08-21] Los DECORATIVOS también desbordan a
            // propósito. En `/login` hay dos `.mf-glow`: degradados radiales de 560px
            // con `left: -160px`, más anchos que cualquier móvil por diseño.
            //
            // Se excluyen por FIRMA y no por clase, igual que `srOnly` justo arriba: sin
            // texto, sin interacción y detrás de todo. Una exclusión por nombre de clase
            // deja de proteger en cuanto alguien renombra.
            //
            // Y esto no era solo ruido: los glows están ANIMADOS (`mfGlowDrift`), así que
            // el desborde aparecía o no según el instante de la medición. En la primera
            // corrida en-US pasó y pt/fr/it fallaron — parecía un defecto de idioma y era
            // una carrera. Un test intermitente en CI se acaba desactivando.
            const cs = window.getComputedStyle(el);
            const decorativo = cs.pointerEvents === 'none'
                && (el.textContent || '').trim() === ''
                && el.getAttribute('aria-hidden') !== 'false';
            if (decorativo) return;
            if (b.right > vw + 0.5 || b.left < -0.5) {
                fuera.push({
                    tag: el.tagName.toLowerCase(),
                    cls: String(el.className?.baseVal ?? el.className ?? '').slice(0, 60),
                    left: Math.round(b.left),
                    right: Math.round(b.right),
                    vw,
                    txt: (el.textContent || '').trim().slice(0, 48),
                });
            }
        });
        return fuera;
    });
}

for (const locale of IDIOMAS) {
    const test = conIdioma(locale);

    test.describe(`La app en ${locale}`, () => {
        for (const [ruta, nombre] of RUTAS) {
            test(`${nombre} arranca en ${locale}`, async ({ page }) => {
                await page.goto(ruta);
                await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });
                // El motor fija `<html lang>` al aplicar el idioma. Si esto falla, el
                // fixture no está surtiendo efecto y TODO lo demás de este fichero está
                // midiendo español — el modo de fallo que haría inútil el resto.
                await expect
                    .poll(() => page.evaluate(() => document.documentElement.lang), {
                        timeout: 10_000,
                    })
                    .toBe(locale);
            });

            test(`${nombre} no desborda a ${ANCHO_SUELO}px en ${locale}`, async ({ page }) => {
                await page.setViewportSize({ width: ANCHO_SUELO, height: 844 });
                await page.goto(ruta);
                await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });
                // Las tipografías ANTES de medir anchos: con la fuente de reserva, más
                // ancha, un elemento desborda de forma transitoria (P2-CROSS-BROWSER).
                //
                // `.then(() => true)` no es adorno: `document.fonts.ready` resuelve a un
                // `FontFaceSet`, que no es serializable, así que devolverlo tal cual deja
                // la espera en el aire. La primera versión de este fichero lo hacía —
                // como su hermano del landing— y WebKit acusó un desborde intermitente
                // que en tres corridas seguidas no se reprodujo: era la carrera, no un
                // defecto de idioma. Un test que parpadea en CI se acaba desactivando, y
                // este acababa de nacer.
                await page.evaluate(() => document.fonts?.ready.then(() => true));
                await page.waitForTimeout(1200);

                const fuera = await desbordes(page);
                expect(
                    fuera,
                    `P2-I18N-E2E-MONOLINGUE: ${fuera.length} elemento(s) fuera del `
                    + `viewport en ${locale} a ${ANCHO_SUELO}px. Con overflow-x: clip `
                    + `esto NO se ve como scroll: se ve como texto cortado. `
                    + JSON.stringify(fuera, null, 1),
                ).toEqual([]);
            });
        }

        test(`la entrada de sesión pasa axe en ${locale}`, async ({ page }) => {
            // [P2-E2E-AXE-REDUCED-MOTION · 2026-09-05] El escaparate del login (PlanShowcase) rota
            // escenas con fundidos de 0,55 s; axe mide el contraste en el instante que le toca y a
            // mitad de fundido el CTA decorativo (`.mf-demo-cta`, aria-hidden) sale a 2,07:1 —
            // 1 fallo + 3 «flaky» en un mismo run, sin cambio alguno en el login. El escaparate
            // respeta prefers-reduced-motion (se queda en la escena «plan», estática): con la
            // preferencia emulada, axe ve colores finales, no mezclas de una animación.
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.goto('/login');
            await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });
            const r = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
                // El MISMO SSOT que `accesibilidad.spec.js` — con sus motivos escritos
                // una sola vez, en `fixtures.js`. Dos listas iguales y los porqués en una
                // es el drift que este repo cierra a mano una y otra vez.
                .disableRules(Object.keys(REGLAS_APAGADAS))
                .analyze();
            expect(
                r.violations,
                `axe encontró ${r.violations.length} violación(es) en /login con la app `
                + `en ${locale}. Un texto más largo puede romper contraste o `
                + `solapamientos que en español no aparecen.\n`
                + r.violations.map((v) => `  · ${v.id}: ${v.help}`).join('\n'),
            ).toEqual([]);
        });
    });
}
