/**
 * [P1-MACRO-ROW-MOBILE · 2026-08-11] «El problema visual es más algo estructural que de
 * colores» — tercera vuelta sobre el contador de macros, y tenía razón: las dos
 * anteriores toqué densidad y forma, no ESTRUCTURA.
 *
 * EL DEFECTO. En el escritorio calorías es la barra grande y proteína/carbos/grasas son
 * tres columnas: se leen como un conjunto y se comparan de un vistazo. Al pasar al
 * teléfono la rejilla colapsaba a UNA columna, y los cuatro pasaban a ser cuatro filas
 * idénticas de ancho completo — misma altura, misma barra, mismo peso. La jerarquía no
 * se comprimía: DESAPARECÍA, y con ella el motivo de que calorías estuviera separada.
 *
 * MEDIDO en Chrome enlazando este mismo CSS (nada copiado a mano):
 *   1 columna (lo que había) → rejilla 247px, tarjeta 573px
 *   3 columnas               → rejilla 116px, tarjeta 442px  (−23%)
 *
 * Y el límite del ancho, también medido, no elegido de memoria:
 *   390px → columna de 100px: «Carbohidratos» pide 90px de texto para 48 de hueco ⇒ se
 *           cortaba y se metía en la columna vecina. De ahí el rótulo corto.
 *   320px → hueco de 42px: ni «Proteína» (54px) entra ⇒ repliegue a dos columnas.
 *
 * TAMBIÉN: la nota de la meta bajó al pie. Ocupaba dos líneas de ancho completo antes
 * del primer número, y la meta es contexto de largo plazo mientras que los números de
 * hoy son el motivo por el que abres la tarjeta.
 *
 * Este guard afirma las DECISIONES (los tres comparten fila; el nombre largo solo se
 * oculta donde hay uno corto; la nota va al pie), no medidas en píxeles: un número
 * muere en cuanto cambie la tipografía.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE = join(AQUI, '..', 'components', 'dashboard');
const CSS = readFileSync(join(BASE, 'TrackingProgress.module.css'), 'utf8');
const JSX = readFileSync(join(BASE, 'TrackingProgress.jsx'), 'utf8');

/** Cuerpo de un bloque contando llaves. Nunca una ventana de N caracteres: se queda
 *  corta en cuanto alguien escribe un comentario largo dentro. */
function cuerpo(fuente, consulta) {
    const i = fuente.indexOf(consulta);
    if (i < 0) return null;
    const abre = fuente.indexOf('{', i);
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

/** Declaraciones de una regla, anclando a inicio de línea: una regla puede ir precedida
 *  de un comentario, y anclar en la llave anterior la dejaría invisible. */
function reglas(fuente, selector) {
    const re = new RegExp(`^[ \\t]*${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`, 'gm');
    const out = [];
    let m;
    while ((m = re.exec(fuente)) !== null) out.push(m[1]);
    return out.join('\n');
}

const movil = () => cuerpo(CSS, '@media (max-width: 768px)');

/** Valor en px de una propiedad, ignorando `!important`. */
const numeroPx = (txt, prop) => {
    const m = new RegExp(`${prop}:\\s*([\\d.]+)px`).exec(txt || '');
    return m ? Number(m[1]) : null;
};

/** ¿Alguna regla del bloque declara `prop` para un selector que incluya `parte`?
 *
 *  Recorre la LISTA de selectores, no la cadena cruda. Buscar `\.barLarge \.track\s*\{`
 *  parecía suficiente y no lo era: en cuanto alguien mete `.barLarge .track` en un grupo
 *  separado por comas —que es exactamente como se escribiría un «lo aplico también a
 *  calorías»— desaparece el `{` que seguía y la comprobación deja de ver nada. Lo
 *  descubrió la mutación: cambié el código y el guard siguió en verde. */
function declaraPara(bloque, parte, prop) {
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(bloque)) !== null) {
        const selectores = m[1].split(',').map((s) => s.trim());
        if (!selectores.some((s) => s.includes(parte))) continue;
        if (new RegExp(`${prop}\\s*:`).test(m[2])) return true;
    }
    return false;
}

describe('[P1-MACRO-ROW-MOBILE] la jerarquía del escritorio sobrevive al teléfono', () => {
    it('los tres macros comparten una fila en el teléfono', () => {
        const grid = reglas(movil(), '.macroGrid');
        expect(grid, 'no hay regla .macroGrid en el bloque del teléfono').not.toBe('');

        const cols = /grid-template-columns:\s*([^;]+);/.exec(grid);
        expect(cols, '.macroGrid no declara columnas en móvil').toBeTruthy();
        expect(
            cols[1],
            'la rejilla volvió a una sola columna: los cuatro macros pesan lo mismo y la '
            + 'jerarquía de calorías desaparece',
        ).not.toMatch(/^\s*1fr\s*$/);
        expect(cols[1]).toMatch(/repeat\(\s*3\s*,/);
    });

    it('a 360px y menos repliega a dos columnas — el umbral está medido', () => {
        const estrecho = cuerpo(CSS, '@media (max-width: 360px)');
        expect(
            estrecho,
            'desapareció el repliegue: a 320px ni «Proteína» entra en una de tres columnas',
        ).toBeTruthy();
        expect(reglas(estrecho, '.macroGrid')).toMatch(/repeat\(\s*2\s*,/);
    });

    it('el repliegue va DESPUÉS de la regla de tres, o no gana', () => {
        // Ambos `@media` casan a 320px y tienen la misma especificidad: desempata el
        // orden. Si alguien mueve el bloque estrecho más arriba, el de 768px lo pisa y
        // el repliegue queda inerte — verde y sin efecto.
        expect(CSS.indexOf('@media (max-width: 360px)'))
            .toBeGreaterThan(CSS.indexOf('@media (max-width: 768px)'));
    });

    it('el nombre largo solo se oculta donde hay uno corto', () => {
        const m = movil();
        // La regla DEBE colgar de `.hasShort`. Sin esa clase sería «oculta el nombre
        // largo» a secas, y apagaría «Calorías», «Proteína» y «Grasas», que no tienen
        // versión corta: se quedarían con el icono y nada al lado.
        const suelta = new RegExp('^[ \\t]*\\.labelFull\\s*\\{', 'm').test(m);
        expect(
            suelta,
            '`.labelFull` se oculta sin condición: los macros sin nombre corto se quedan '
            + 'sin rótulo',
        ).toBe(false);
        expect(reglas(m, '.hasShort .labelFull')).toMatch(/display:\s*none/);
        expect(reglas(m, '.hasShort .labelShort')).toMatch(/display:\s*inline/);
    });

    it('fuera del teléfono manda el nombre completo', () => {
        expect(reglas(CSS, '.labelShort')).toMatch(/display:\s*none/);
    });

    it('solo el macro que no cabe lleva nombre corto', () => {
        const cortos = [...JSX.matchAll(/shortLabel="([^"]+)"/g)].map((m) => m[1]);
        expect(cortos, 'nadie declara nombre corto: «Carbohidratos» vuelve a cortarse')
            .toHaveLength(1);
        expect(cortos[0]).toBe('Carbos');
        // Y el largo sigue existiendo: el corto SUSTITUYE en móvil, no reemplaza el dato.
        expect(JSX).toMatch(/label="Carbohidratos"/);
    });

    /* ---------------------------------------------------------------------------
       [P1-MACRO-BAR-SLIM · 2026-08-11] Las barras de los tres macros adelgazan; la de
       calorías NO se toca — el dueño dijo expresamente que esa está bien.

       El defecto era de PROPORCIÓN, no de altura. Los 22px de `.track` se fijaron cuando
       toda barra ocupaba el ancho de la tarjeta (para que el porcentaje cupiera DENTRO
       del relleno). A ese ancho da ~15:1 y se lee como barra; al pasar los tres macros a
       compartir una fila, la misma altura sobre ~104px da 4,7:1, y a esa proporción una
       caja de esquinas redondas parece una cápsula, no una barra de progreso. Medido
       tras el cambio: 104×8 = 13:1, casi la misma proporción que la de calorías (15,3:1).
       --------------------------------------------------------------------------- */

    it('las barras de los macros son más finas que la de calorías', () => {
        const m = movil();
        const base = numeroPx(reglas(CSS, '.track'), 'height');
        const chica = numeroPx(reglas(m, '.barSmall .track'), 'height');
        expect(base, 'desapareció la altura base de .track').toBeTruthy();
        expect(chica, 'las barras de los macros ya no adelgazan en el teléfono').toBeTruthy();
        expect(
            chica,
            `la barra de un macro mide ${chica}px sobre ~104 de ancho: a esa proporción deja de `
            + 'leerse como barra de progreso y parece una cápsula vacía',
        ).toBeLessThan(base);
    });

    it('la de calorías se queda EXACTAMENTE como estaba', () => {
        // Decisión explícita del dueño («el de calorías está bien como está actual»).
        // Si alguien la adelgaza «por consistencia», esto lo para.
        const m = movil();
        expect(
            declaraPara(m, '.barLarge .track', 'height'),
            'alguien tocó la altura de la barra de calorías en el teléfono: el dueño pidió justo '
            + 'lo contrario («el de calorías está bien como está actual»)',
        ).toBe(false);
    });

    it('el porcentaje sale de las finas, donde no cabe — y se queda en la gruesa', () => {
        const m = movil();
        expect(reglas(m, '.barSmall .fillPerc')).toMatch(/display:\s*none/);
        expect(
            declaraPara(m, '.barLarge .fillPerc', 'display'),
            'se ocultó también el porcentaje de calorías, que sí tiene sitio para él',
        ).toBe(false);
    });

    it('la nota de la meta ya no encabeza la tarjeta', () => {
        // Anclado al USO (`className={styles.X}`), no a la mención: el comentario que
        // dejé en la cabecera explicando la mudanza nombra `styles.etaChip`, y buscar
        // el identificador suelto encontraba ESE texto — el guard se medía a sí mismo
        // y daba por hecho que la nota seguía arriba. Cuarta vez con esta forma.
        const uso = (clase) => JSX.indexOf(`className={styles.${clase}}`);
        const iCabecera = uso('subtitle');
        const iEta = uso('etaChip');
        const iComidas = uso('mealsSection');
        expect(iCabecera, 'no se encontró el uso de .subtitle').toBeGreaterThan(0);
        expect(iComidas, 'no se encontró el uso de .mealsSection').toBeGreaterThan(0);
        expect(iEta, 'desapareció la nota de la meta').toBeGreaterThan(0);
        expect(
            iEta,
            'la nota volvió a la cabecera: dos líneas de ancho completo antes del primer número',
        ).toBeGreaterThan(iComidas);
        expect(iEta).toBeGreaterThan(iCabecera);
    });
});
