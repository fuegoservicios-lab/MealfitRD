/**
 * [P1-TRACKING-HEADER-MOBILE · 2026-08-10] La píldora de la meta y el título del
 * contador de macros «se veían raros» en el teléfono.
 *
 * EL DEFECTO ERA GEOMÉTRICO, no de estilo. El icono (40px) y su separación se comen
 * ~56px de la fila, así que a la columna del texto le quedan ~300px — y la frase de la
 * meta («Meta: 140 lb · ~27 semanas a tu ritmo (decidido)») mide casi exactamente eso.
 * Partía en dos líneas dejando una palabra sola, DENTRO de una píldora de radio 999px.
 * Una píldora es una forma para UNA línea: con dos, el radio la deforma y el texto se
 * aplasta contra la curva. Y con `align-items: center` la banderita se iba al centro
 * vertical de las dos líneas, lejos de la palabra a la que acompaña.
 *
 * Este guard afirma la DECISIÓN («a este ancho deja de ser píldora y pasa a ser una
 * nota de línea completa, alineada arriba»), no medidas exactas: un número en píxeles
 * muere en cuanto cambie la tipografía o el texto de la meta.
 *
 * Se rompe por mutación: quitar cualquiera de las tres declaraciones lo pone en rojo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(
    join(AQUI, '..', 'components', 'dashboard', 'TrackingProgress.module.css'),
    'utf8',
);

/** Cuerpo de una `@media` contando llaves — NO una ventana de N caracteres, que se
 *  queda corta en cuanto alguien escribe un comentario largo dentro. */
function cuerpoDeMedia(consulta) {
    const i = CSS.indexOf(consulta);
    if (i < 0) return null;
    const abre = CSS.indexOf('{', i);
    let nivel = 0;
    for (let j = abre; j < CSS.length; j++) {
        if (CSS[j] === '{') nivel++;
        else if (CSS[j] === '}') {
            nivel--;
            if (nivel === 0) return CSS.slice(abre + 1, j);
        }
    }
    return null;
}

/** Declaraciones de una regla concreta DENTRO de un cuerpo dado. Devuelve todas las
 *  apariciones unidas: si alguien duplica el selector, el guard ve las dos. */
function declaracionesDe(cuerpo, selector) {
    // Ancla a INICIO DE LÍNEA, no a la llave anterior: una regla puede ir precedida de
    // un comentario, y anclar en `}` la deja invisible. El `\s*\{` inmediato evita que
    // `.etaChip` capture a `.etaChip svg`.
    const re = new RegExp(`^[ \\t]*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'gm');
    const trozos = [];
    let m;
    while ((m = re.exec(cuerpo)) !== null) trozos.push(m[1]);
    return trozos.join('\n');
}

describe('P1-TRACKING-HEADER-MOBILE', () => {
    const movil = cuerpoDeMedia('@media (max-width: 768px)');

    it('el bloque móvil existe y no está vacío', () => {
        expect(movil, 'desapareció el @media (max-width: 768px) de TrackingProgress').toBeTruthy();
        expect(movil.length).toBeGreaterThan(200);
    });

    it('la meta deja de ser píldora al ancho del teléfono', () => {
        const chip = declaracionesDe(movil, '.etaChip');
        expect(chip, 'no hay regla .etaChip en el bloque móvil').not.toBe('');

        const radio = /border-radius:\s*([^;]+);/.exec(chip);
        expect(radio, '.etaChip no redefine su radio en móvil: sigue siendo píldora').toBeTruthy();
        // La píldora se declara con un radio enorme (999px / 9999px / 50%). Cualquiera
        // de esas formas significa «sigue siendo píldora» y el defecto vuelve.
        expect(radio[1]).not.toMatch(/999|50%/);
    });

    it('la meta ocupa la línea entera en vez de encogerse a su contenido', () => {
        const chip = declaracionesDe(movil, '.etaChip');
        expect(chip).toMatch(/width:\s*100%/);
        // `inline-flex` la dimensiona por contenido; con ancho completo hace falta que
        // sea un bloque flex de verdad, o el 100% no se aplica igual.
        expect(chip).toMatch(/display:\s*flex/);
    });

    it('la banderita acompaña a la primera línea, no al centro de las dos', () => {
        const chip = declaracionesDe(movil, '.etaChip');
        expect(chip).toMatch(/align-items:\s*flex-start/);
    });

    it('el icono se alinea con el título en vez de centrarse contra el bloque', () => {
        const izquierda = declaracionesDe(movil, '.headerLeft');
        expect(izquierda, 'no hay regla .headerLeft en el bloque móvil').not.toBe('');
        expect(izquierda).toMatch(/align-items:\s*flex-start/);
    });
});
