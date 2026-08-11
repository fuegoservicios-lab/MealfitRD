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

    it('las secciones del Plan la llevan puesta', () => {
        const puesta = (fuente, marca) => new RegExp(`${marca}[^\\n]*mf-flat-mobile|mf-flat-mobile[^\\n]*${marca}`)
            .test(fuente);
        expect(puesta(DASH, 'dashboard-header'), 'el saludo/créditos sigue enmarcado').toBe(true);
        expect(puesta(DASH, 'meals-container'), 'el cuaderno del plan sigue enmarcado').toBe(true);
        expect(DASH, 'el panel de Razonamiento sigue enmarcado')
            .toMatch(/className="mf-flat-mobile"/);

        for (const [fichero, clase] of [
            ['TrackingProgress.jsx', 'card'],
            ['MicronutrientMeter.jsx', 'panel'],
            ['WaterTracker.jsx', 'card'],
        ]) {
            const src = leer('components', 'dashboard', fichero);
            expect(
                new RegExp(`styles\\.${clase}[^\\n]*mf-flat-mobile`).test(src),
                `${fichero} no aplana su \`.${clase}\` en el teléfono`,
            ).toBe(true);
        }
    });

    it('la excepción de Hidratación va DESPUÉS del @container, o nace inerte', () => {
        // Su relleno vive en `.inner`, no en `.card`, así que el aplanado global no lo
        // alcanza y hace falta una regla local. Pero en el teléfono la tarjeta mide menos
        // de 540px, así que el `@container` también casa y devuelve `padding: 18px`: con
        // la misma especificidad desempata el ORDEN. Puesta antes, la regla es verde y no
        // hace nada — que es el peor resultado posible.
        const iContenedor = AGUA_CSS.indexOf('@container (max-width: 540px)');
        expect(iContenedor, 'desapareció el @container de Hidratación').toBeGreaterThan(0);

        // Se busca el `@media` que CONTIENE la regla, no el primero que aparezca: anclar
        // en la primera coincidencia haría que un `@media (max-width: 768px)` cualquiera
        // añadido más arriba pusiera esto en rojo sin que nada se hubiera roto.
        const telefonos = [...AGUA_CSS.matchAll(/@media\s*\(max-width:\s*768px\)/g)];
        const conLaRegla = telefonos.filter((m) => /padding-left:\s*0/.test(cuerpoDesde(AGUA_CSS, m.index) || ''));
        expect(conLaRegla.length, 'Hidratación no declara su excepción de teléfono').toBe(1);
        expect(conLaRegla[0].index).toBeGreaterThan(iContenedor);
    });
});
