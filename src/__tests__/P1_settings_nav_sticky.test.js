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

    it('en el DIÁLOGO ya no se pega, y eso es lo correcto desde CHROME-SPLIT', () => {
        // [P1-SETTINGS-CHROME-SPLIT · 2026-08-10] ESTE CASO SE INVIRTIÓ, y conviene
        // saber por qué antes de volver a darle la vuelta.
        //
        // El defecto que este fichero cerró era real: un `position: static` devolvía la
        // lista al flujo DENTRO de un contenedor que scrolleaba, y la navegación se iba
        // (medido: −864px tras 999px de scroll). El arreglo de entonces —volver a
        // `sticky`— era correcto CON AQUEL CÓDIGO.
        //
        // Hoy la lista ya no vive dentro de nada que scrollee: el scroll bajó a la
        // columna de contenido. Un `sticky` aquí no se pegaría a nada, porque su
        // scrollport sería el wrapper y el wrapper no se mueve — sería una declaración
        // INERTE, que es peor que una equivocada: un guard la lee y la da por buena.
        // Y encima promociona una capa de composición, que era exactamente lo que se
        // re-rasterizaba cada fotograma a escala de Windows fraccionaria.
        //
        // La propiedad que este fichero defiende —«la navegación no se va con el
        // scroll»— sigue garantizada, pero por construcción. La afirma
        // `P1_settings_chrome_split.test.js`.
        const escritorio = cuerpo(CSS, '@media (min-width: 769px)');
        expect(escritorio, 'desapareció el bloque de escritorio del diálogo').toBeTruthy();

        const enDialogo = reglas(escritorio, '.inDialog .sidebar');
        expect(enDialogo, 'no hay regla .inDialog .sidebar en el bloque de escritorio').not.toBe('');

        const posicion = /position:\s*([a-z-]+)/.exec(enDialogo);
        expect(posicion, 'la lista no declara posición: heredaría un sticky inerte').toBeTruthy();
        expect(
            posicion[1],
            'la lista volvió a `sticky` en el diálogo. Si es porque la cabecera volvió a '
            + 'estar dentro del scroll, el arreglo no es este: es sacarla otra vez.',
        ).toBe('static');
    });

    it('la línea divisoria del diálogo sigue en pie (era lo legítimo de ese bloque)', () => {
        const escritorio = cuerpo(CSS, '@media (min-width: 769px)');
        const enDialogo = reglas(escritorio, '.inDialog .sidebar');
        expect(enDialogo).toMatch(/border-right:/);
        // El aire de la línea vive ahora en el `padding` abreviado, junto al vertical
        // que la columna estrenó al dejar de heredarlo del wrapper.
        expect(enDialogo, 'la línea divisoria se quedó sin su aire').toMatch(/padding:[^;]*1rem/);
    });

    it('quién scrollea, hoy: la columna de contenido, no el hijo del panel', () => {
        // Este caso existía porque de QUIÉN scrollea dependía el pegado. Sigue
        // existiendo por lo mismo, con el sujeto cambiado: de quién scrollea depende
        // ahora que el `static` de arriba sea correcto en vez de un descuido.
        // El `reglas` de ESTE fichero solo escapa puntos, así que el `*` hay que
        // escaparlo a mano o el motor lo lee como cuantificador y no casa nada.
        const hijo = reglas(CSS_DIALOGO, '.panel > \\*');
        expect(hijo, 'no se encontró la regla `.panel > *` del diálogo').not.toBe('');
        expect(
            hijo,
            'el hijo del panel volvió a scrollear: entonces la lista SÍ necesita pegarse '
            + 'otra vez y el `static` de arriba pasa a ser el defecto original',
        ).not.toMatch(/overflow-y:\s*auto/);

        const escritorio = cuerpo(CSS, '@media (min-width: 769px)');
        expect(reglas(escritorio, '.inDialog .contentPanel')).toMatch(/overflow-y:\s*auto/);
    });
});
