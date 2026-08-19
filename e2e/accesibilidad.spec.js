// @ts-check
/**
 * [P2-A11Y-AXE · 2026-08-18] axe sobre las rutas públicas, en los tres motores.
 *
 * POR QUÉ. La accesibilidad se comprobaba leyendo el código y mirando capturas.
 * Eso encuentra lo que uno ya sospecha. axe recorre el árbol renderizado y aplica
 * ~90 reglas deterministas: contraste calculado sobre los píxeles que de verdad
 * salen, nombres accesibles resueltos como los resuelve un lector de pantalla,
 * orden de encabezados. Encuentra lo que uno NO sospecha, que es el punto.
 *
 * Sobre el alcance: `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` deja
 * fuera las reglas de «buenas prácticas» de axe, que no son criterios WCAG y
 * mezclan opinión con norma. Se comprueba lo que es exigible.
 *
 * Sobre las reglas desactivadas: cada una lleva su razón AQUÍ, no en un fichero
 * de configuración lejano. Una exclusión sin motivo escrito se vuelve permanente
 * en dos semanas porque nadie recuerda si protegía algo.
 */
import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

/**
 * Rutas PÚBLICAS: las que un desconocido puede abrir sin sesión. Las privadas
 * (dashboard, plan, nevera) necesitan un usuario autenticado y quedan fuera de
 * este smoke — cubrirlas exige fixtures de sesión, que es otro trabajo.
 */
const RUTAS = [
    ['/login', 'entrada de sesión'],
    ['/reset-password', 'recuperar contraseña'],
    ['/precios', 'planes y precios'],
    ['/como-funciona', 'cómo funciona'],
    ['/motor', 'el motor'],
    ['/supermercado', 'supermercados'],
    ['/novedades', 'novedades'],
    ['/privacy', 'privacidad'],
    ['/terms', 'términos'],
];

/**
 * Reglas apagadas, con su razón. NO es una lista de cosas que arreglar luego:
 * es una lista de decisiones ya tomadas.
 */
const REGLAS_APAGADAS = {
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

for (const [ruta, nombre] of RUTAS) {
    test(`axe sin violaciones en ${ruta} (${nombre})`, async ({ page }) => {
        const errores = [];
        page.on('pageerror', (e) => errores.push(String(e)));

        /* [P2-E2E-ESPERA-ACOTADA · 2026-08-19] `networkidle` fuera: es una espera SIN
           COTA. Se cumple cuando pasan 500 ms sin peticiones, asi que en una pagina
           que sondea la API —y aqui el backend no existe, luego cada sondeo falla y
           se reintenta— puede no cumplirse nunca. Medido: con los tres motores en
           paralelo, `/supermercado` agoto los 30 s del test en Firefox; aislada,
           navegar tarda 1,3 s y axe 0,9 s sobre 242 nodos. O sea que no era lentitud
           de axe ni de la pagina: era la condicion de espera, que no acotaba nada.

           Ahora se espera a hechos concretos y acotados: el documento cargado, la
           raiz de React con contenido, y las tipografias —que cambian la geometria
           y por tanto lo que axe mide de contraste y de tamaño—. */
        await page.goto(ruta, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#root')).toBeVisible({ timeout: 15_000 });
        await page.evaluate(() => document.fonts?.ready);
        /* Y la red, ACOTADA y sin castigar si no calla. `color-contrast` se calcula
           sobre los pixeles pintados, asi que medir antes de que aplique el CSS de la
           ruta —que llega en su propio trozo— produce violaciones que no existen:
           al quitar `networkidle` de golpe aparecieron tres, una por ruta, en dos
           motores distintos. El `networkidle` original acertaba por accidente en eso
           y a cambio no acotaba nada.

           Aqui se espera lo mismo pero con tope y con `catch`: si la red no calla
           —una pagina que sondea una API caida no callara nunca— se sigue adelante y
           lo que decide es axe, no el reloj. */
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

        const constructor = new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .disableRules(Object.keys(REGLAS_APAGADAS));

        const { violations } = await constructor.analyze();

        // El informe importa tanto como el veredicto: un fallo que solo dice
        // «1 violación» obliga a reproducir a mano para saber qué mirar.
        const informe = violations.map((v) => {
            const donde = v.nodes.slice(0, 3).map((n) => '        ' + n.target.join(' ')).join('\n');
            return `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.helpUrl}\n${donde}`;
        }).join('\n');

        expect(violations, `\n${violations.length} violaciones en ${ruta}:\n${informe}\n`).toEqual([]);

        // Una página que revienta en JS no es accesible por mucho que axe pase:
        // axe analiza lo que hay en el DOM, y si el render murió a la mitad hay
        // poco DOM que analizar y pocas reglas que romper. El silencio de axe
        // sobre una página rota parecería un aprobado.
        expect(errores, `errores de JS en ${ruta}:\n${errores.join('\n')}`).toEqual([]);
    });
}
