/**
 * [P1-PLAN-FLAT-MOBILE · 2026-08-11] «El diseño en tarjetas hace ver el contenido más
 * encogido en móviles — eliminemos las tarjetas».
 *
 * EL DEFECTO. Cada sección del Plan traía su propia tarjeta: fondo, borde, radio, sombra
 * y relleno. En una pantalla ancha eso separa; en una de 390px el marco cuesta el doble
 * de su grosor (izquierda y derecha) y encima se ANIDA, porque dentro hay más cajas con
 * borde propio. Medido en Chrome a 390px con el CSS de producción enlazado:
 *
 *   sección          interior antes → después
 *   macros                329px  →  363   (+34)
 *   micronutrientes       325px  →  363   (+38)
 *   razonamiento          305px  →  363   (+58, un 16% del ancho útil)
 *
 * Razonamiento era el peor y es texto corrido — justo lo que peor lleva perder ancho.
 * A 1440px, con la clase puesta, bordes y radios siguen intactos: el `@media` contiene.
 *
 * Este guard afirma la DECISIÓN y su alcance: que el aplanado exista, que esté encerrado
 * en el bloque del teléfono, que lleve `!important` (sin él no gana a los estilos INLINE
 * del panel de Razonamiento) y que las secciones lo lleven puesto. No afirma píxeles.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, '..');
const leer = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const INDEX = leer('index.css');
const DASH = leer('pages', 'Dashboard.jsx');
const AGUA_CSS = leer('components', 'dashboard', 'WaterTracker.module.css');

/** Cuerpo de un bloque contando llaves, desde una posición dada. Nunca una ventana de N
 *  caracteres: se queda corta en cuanto alguien escribe un comentario largo dentro. */
function cuerpoDesde(fuente, i) {
    const abre = fuente.indexOf('{', i);
    if (abre < 0) return null;
    let nivel = 0;
    for (let j = abre; j < fuente.length; j++) {
        if (fuente[j] === '{') nivel++;
        else if (fuente[j] === '}') {
            nivel--;
            if (nivel === 0) return fuente.slice(abre + 1, j);
        }
    }
    return null;
}

/** El `@media` del teléfono que CONTIENE la regla de aplanado. Se busca la regla primero
 *  y se sube al media que la envuelve, en vez de buscar el media y confiar en que sea el
 *  correcto: hay varios `@media (max-width: 768px)` en el fichero. */
function mediaQueContieneElAplanado() {
    const iRegla = INDEX.search(/^\s*\.mf-flat-mobile\s*\{/m);
    if (iRegla < 0) return null;
    const medias = [...INDEX.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)]
        .filter((m) => m.index < iRegla);
    for (let k = medias.length - 1; k >= 0; k--) {
        const cuerpo = cuerpoDesde(INDEX, medias[k].index);
        const inicio = INDEX.indexOf(cuerpo);
        if (cuerpo && inicio <= iRegla && iRegla < inicio + cuerpo.length) {
            return { ancho: Number(medias[k][1]), cuerpo };
        }
    }
    return null;
}

describe('[P1-PLAN-FLAT-MOBILE] en el teléfono las secciones del Plan no son tarjetas', () => {
    it('la regla de aplanado existe y vive dentro del bloque del teléfono', () => {
        const m = mediaQueContieneElAplanado();
        expect(m, 'no existe `.mf-flat-mobile`, o está FUERA de un @media: aplanaría también el escritorio')
            .toBeTruthy();
        expect(m.ancho).toBeLessThanOrEqual(768);
    });

    it('quita el marco entero, no media tarjeta', () => {
        const { cuerpo } = mediaQueContieneElAplanado();
        const regla = cuerpoDesde(cuerpo, cuerpo.search(/\.mf-flat-mobile\s*\{/));
        for (const prop of ['background', 'border', 'border-radius', 'box-shadow', 'padding-left', 'padding-right']) {
            expect(regla, `el aplanado no neutraliza \`${prop}\``).toMatch(new RegExp(`${prop}:`));
        }
        // Un marco a medias es peor que ninguno: sin borde pero con el mismo ancho, se
        // pierde la separación Y no se gana espacio.
        const conImportante = (regla.match(/!important/g) || []).length;
        expect(
            conImportante,
            'faltan `!important`: el panel de Razonamiento declara su marco en estilos INLINE, '
            + 'y a un inline solo lo gana una declaración de autor `!important`',
        ).toBeGreaterThanOrEqual(6);
    });

    it('el relleno VERTICAL se conserva — es lo único que separa ya las secciones', () => {
        const { cuerpo } = mediaQueContieneElAplanado();
        const regla = cuerpoDesde(cuerpo, cuerpo.search(/\.mf-flat-mobile\s*\{/));
        expect(regla, 'un `padding: 0` a secas juntaría las secciones sin nada que las separe')
            .not.toMatch(/^\s*padding:\s/m);
        expect(regla).not.toMatch(/padding-top:/);
        expect(regla).not.toMatch(/padding-bottom:/);
    });

    /* ---------------------------------------------------------------------------
       LAS DOS LISTAS. El aplanado NO es universal, y esa mezcla es una decisión del
       dueño: pidió el cambio, vio el resultado y devolvió la tarjeta a tres de las seis
       secciones (Razonamiento, Hidratación y Progreso en Tiempo Real).

       Por eso el guard afirma también la lista NEGATIVA. Una excepción de gusto no deja
       rastro en el código —solo se ve una clase que a unos sitios se les puso y a otros
       no—, y eso se lee como trabajo a medio hacer: el siguiente que pase «unifica» y
       deshace lo que el dueño pidió. Afirmarla la convierte en contrato.
       --------------------------------------------------------------------------- */

    const enDashboard = (marca) =>
        new RegExp(`${marca}[^\\n]*mf-flat-mobile|mf-flat-mobile[^\\n]*${marca}`).test(DASH);
    const enComponente = (fichero, clase) =>
        new RegExp(`styles\\.${clase}[^\\n]*mf-flat-mobile`)
            .test(leer('components', 'dashboard', fichero));

    it('SÍ se aplanan: saludo/créditos, micronutrientes y el cuaderno del plan', () => {
        expect(enDashboard('dashboard-header'), 'el saludo/créditos volvió a enmarcarse').toBe(true);
        expect(enDashboard('meals-container'), 'el cuaderno del plan volvió a enmarcarse').toBe(true);
        expect(
            enComponente('MicronutrientMeter.jsx', 'panel'),
            'micronutrientes volvió a enmarcarse',
        ).toBe(true);
    });

    it('NO se aplanan, por decisión del dueño: razonamiento, hidratación y progreso', () => {
        expect(
            enComponente('TrackingProgress.jsx', 'card'),
            'Progreso en Tiempo Real volvió a aplanarse: el dueño pidió su tarjeta de vuelta',
        ).toBe(false);
        expect(
            enComponente('WaterTracker.jsx', 'card'),
            'Hidratación volvió a aplanarse: el dueño pidió su tarjeta de vuelta',
        ).toBe(false);
        // Razonamiento es el único `div` del Dashboard cuyo marco es inline; se afirma
        // por la ausencia de la clase suelta, que es como se le aplicaba.
        expect(
            /className="mf-flat-mobile"/.test(DASH),
            'Razonamiento volvió a aplanarse: el dueño pidió su tarjeta de vuelta',
        ).toBe(false);
    });

    it('Hidratación no conserva la excepción que solo servía al aplanado', () => {
        // Su relleno lateral vive en `.inner`, no en `.card`. Mientras estuvo aplanada
        // hubo una regla que lo ponía a cero; con el marco de vuelta, ese relleno es lo
        // que separa el contenido del borde. Dejarla habría dado el peor resultado:
        // tarjeta con borde y texto pegado a él.
        const telefonos = [...AGUA_CSS.matchAll(/@media\s*\(max-width:\s*768px\)/g)];
        const conCeros = telefonos.filter((m) => /padding-left:\s*0/.test(cuerpoDesde(AGUA_CSS, m.index) || ''));
        expect(
            conCeros.length,
            'quedó la regla que ponía a cero el relleno de Hidratación, pero su tarjeta ya volvió: '
            + 'el contenido queda pegado al borde',
        ).toBe(0);
        expect(AGUA_CSS.indexOf('@container (max-width: 540px)'), 'desapareció el @container de Hidratación')
            .toBeGreaterThan(0);
    });
});
