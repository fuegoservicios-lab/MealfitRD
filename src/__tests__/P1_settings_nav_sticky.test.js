/**
 * [P1-SETTINGS-NAV-STICKY · 2026-08-10] «Cuando le doy scroll para abajo las opciones de
 * configuración desaparecen».
 *
 * EL DEFECTO. `.sidebar` se monta con `position: sticky; top: 1.5rem` — es lo que
 * mantiene la lista de secciones a la vista mientras el contenido corre. Dentro del
 * diálogo, un bloque `@media (min-width: 769px)` la devolvía a `position: static`, y con
 * eso la navegación entera se iba con el scroll.
 *
 * POR QUÉ ES EL DIÁLOGO Y NO LA PÁGINA: en el diálogo el contenedor que scrollea es el
 * wrapper de Settings (`.panel > *` lleva `overflow-y: auto` en SettingsDialog.module.css),
 * no el documento. `sticky` reacciona a su ancestro con scroll; `static` no reacciona a
 * nada. Medido en Chrome a 1112px replicando la cadena real: tras 999px de scroll el
 * borde superior de la barra quedaba en **−864px** con el panel empezando en 40 — no
 * estaba «recortada», estaba fuera. Con `sticky`, 84px.
 *
 * El `position: static` era incidental: el comentario que justifica ese bloque habla de
 * la rejilla de dos columnas y de la línea divisoria, y no lo menciona. Justo por eso
 * hace falta un guard: una declaración que nadie defendió por escrito es la que vuelve
 * sin que nadie lo note.
 *
 * Se afirma la PROPIEDAD («la navegación queda pegada mientras el contenido corre»),
 * no un valor de `top`: ese lo pone `.sidebar` y puede cambiar sin romper nada.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(AQUI, '..', 'pages', 'Settings.module.css'), 'utf8');
const CSS_DIALOGO = readFileSync(
    join(AQUI, '..', 'components', 'dashboard', 'SettingsDialog.module.css'),
    'utf8',
);

/** Cuerpo de un bloque contando llaves — no una ventana de N caracteres, que se queda
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

/** Declaraciones de una regla, anclando a inicio de línea (una regla puede ir precedida
 *  de un comentario, y anclar en `}` la dejaría invisible). */
function reglas(fuente, selector) {
    const re = new RegExp(`^[ \\t]*${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`, 'gm');
    const out = [];
    let m;
    while ((m = re.exec(fuente)) !== null) out.push(m[1]);
    return out.join('\n');
}

describe('[P1-SETTINGS-NAV-STICKY] la navegación de Configuración no se va con el scroll', () => {
    it('la barra base se declara pegada, con su tope', () => {
        const barra = reglas(CSS, '.sidebar');
        expect(barra, 'no se encontró la regla base .sidebar').not.toBe('');
        expect(barra).toMatch(/position:\s*sticky/);
        expect(barra, 'sticky sin `top` no se pega a nada').toMatch(/top:\s*[^;]+;/);
    });

    it('el diálogo NO la devuelve a static en escritorio', () => {
        const escritorio = cuerpo(CSS, '@media (min-width: 769px)');
        expect(escritorio, 'desapareció el bloque de escritorio del diálogo').toBeTruthy();

        const enDialogo = reglas(escritorio, '.inDialog .sidebar');
        expect(enDialogo, 'no hay regla .inDialog .sidebar en el bloque de escritorio').not.toBe('');

        const posicion = /position:\s*([a-z-]+)/.exec(enDialogo);
        expect(
            posicion && posicion[1],
            `el diálogo redefine la posición de la barra a «${posicion && posicion[1]}»: si no es ` +
            'sticky, la navegación se va con el scroll y el usuario se queda sin secciones',
        ).not.toBe('static');
        if (posicion) expect(posicion[1]).toBe('sticky');
    });

    it('la línea divisoria del diálogo sigue en pie (era lo legítimo de ese bloque)', () => {
        const escritorio = cuerpo(CSS, '@media (min-width: 769px)');
        const enDialogo = reglas(escritorio, '.inDialog .sidebar');
        expect(enDialogo).toMatch(/border-right:/);
        expect(enDialogo).toMatch(/padding-right:/);
    });

    it('el que scrollea sigue siendo el hijo del panel — de eso depende el sticky', () => {
        // Si alguien mueve el `overflow-y` a otro sitio, `sticky` se ancla a otro
        // scrollport y este arreglo deja de significar lo que dice significar.
        const hijo = reglas(CSS_DIALOGO, '.panel > \\*');
        expect(hijo, 'no se encontró la regla `.panel > *` del diálogo').not.toBe('');
        expect(hijo).toMatch(/overflow-y:\s*auto/);
    });
});
