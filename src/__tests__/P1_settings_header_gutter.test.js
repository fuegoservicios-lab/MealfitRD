// [P1-SETTINGS-HEADER-GUTTER · 2026-08-10] La X del diálogo de Configuración estaba
// pegada al texto en el móvil.
//
// LA CAUSA, y no es «faltaba padding»: el botón es `position: absolute`, o sea que
// está FUERA DEL FLUJO — el título y el subtítulo no pueden saber que existe. La
// cabecera va centrada con 8px de margen lateral mientras el botón ocupa ~53px por la
// derecha, así que cualquier texto que llegue al borde corre por debajo de él.
// «Gustos, cocina, equipo y más para mejores planes» es exactamente eso.
//
// EL ARREGLO se ancla aquí porque lo que importa no es el número: es que la canaleta
// se CALCULE desde el botón. Un padding a ojo sería correcto hasta el próximo cambio
// de tamaño o de fuente — que es justo cómo nació este defecto, y la misma forma que
// ya vimos en P1-MACRO-LABEL-GUTTER (canaleta de 78px con un rótulo de 98).
//
// Simétrica a propósito: el título va centrado, así que reservar solo por la derecha
// lo descentraría respecto del panel.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS = fs.readFileSync(
    path.resolve(__dirname, '..', 'pages', 'Settings.module.css'),
    'utf-8',
);

const css = CSS;

const regla = (selector) => {
    const i = CSS.indexOf(selector);
    expect(i, `desapareció la regla ${selector}`).toBeGreaterThan(0);
    return CSS.slice(i, CSS.indexOf('}', i));
};

/** Igual que `regla`, pero dentro de un trozo concreto. Devuelve null si no está, en
 *  vez de fallar: hay casos que necesitan afirmar la AUSENCIA. */
const reglaEn = (trozo, selector) => {
    const i = trozo.indexOf(selector);
    if (i < 0) return null;
    return trozo.slice(i, trozo.indexOf('}', i));
};

/** El bloque `@media (max-width: 768px)` que gobierna el diálogo. Hay dos con esa
 *  consulta en el fichero; se elige por lo que declara, no por ser el primero — que
 *  acertaría hoy y mentiría en cuanto alguien añada otro antes. */
const mediaConDialogo = () => {
    let desde = 0;
    for (;;) {
        const i = CSS.indexOf('@media (max-width: 768px)', desde);
        expect(i, 'no queda ningún @media (max-width: 768px) que declare el diálogo').toBeGreaterThan(0);
        const abre = CSS.indexOf('{', i);
        let nivel = 0;
        let j = abre;
        for (; j < CSS.length; j += 1) {
            if (CSS[j] === '{') nivel += 1;
            else if (CSS[j] === '}') { nivel -= 1; if (nivel === 0) break; }
        }
        const cuerpo = CSS.slice(abre + 1, j);
        if (cuerpo.includes('.wrapper.inDialog')) return cuerpo;
        desde = i + 1;
    }
};

describe('[P1-SETTINGS-HEADER-GUTTER] el texto de la cabecera no puede pisar la X', () => {
    it('el tamaño del botón vive en variables, no repartido por el archivo', () => {
        // `.wrapper.inDialog` y no `.inDialog`: desde CHROME-SPLIT el bloque lleva dos
        // clases para ganarle por especificidad a los `@media .wrapper` de más abajo.
        // Buscar `.inDialog {` acertaba por casualidad —lo encontraba DENTRO de
        // `.wrapper.inDialog {`— y habría dejado de acertar al primer renombre.
        const raiz = regla('.wrapper.inDialog {');
        expect(raiz).toMatch(/--settings-close-size:\s*\d+px/);
        expect(raiz).toMatch(/--settings-close-inset:/);
    });

    it('la canaleta de la cabecera se DERIVA del botón, no es un número suelto', () => {
        // [P1-SETTINGS-CHROME-SPLIT · 2026-08-10] EL HUECO SE QUEDÓ SOLO EN MÓVIL, y el
        // motivo es que el defecto solo sigue existiendo ahí.
        //
        // Lo que este fichero cerró: la X era `absolute`, o sea que estaba FUERA DEL
        // FLUJO, y por eso el título no podía saber que existía y le corría por debajo.
        // La cura fue reservarle hueco a mano, a los dos lados para no descentrar el
        // título. Correcta entonces, y costaba 68 px de vacío a la izquierda por un
        // botón que está a la derecha.
        //
        // Hoy, en ESCRITORIO, la X y el título son hermanos de una fila flex: quien
        // reserva el sitio es el propio botón, ocupándolo. La colisión no está
        // arreglada, es inexpresable, y el hueco a mano sobra — lo verifica
        // `P1_settings_chrome_split.test.js`.
        //
        // En MÓVIL el título va CENTRADO (regla de la página), así que el sitio que
        // ocupa el botón a la derecha sigue descentrando el texto respecto del panel.
        // Ahí el hueco espejo sigue haciendo falta, ahora a un solo lado y del tamaño
        // exacto de un hermano que sí ocupa sitio.
        const mov = mediaConDialogo();
        const cab = reglaEn(mov, '.inDialog .pageHeader {');
        expect(cab, 'en móvil nadie reserva el hueco espejo de la X').toBeTruthy();
        const m = cab.match(/padding-left:\s*([^;]+);/);
        expect(m, 'falta padding-left en la cabecera móvil').toBeTruthy();
        expect(m[1], 'debe ser un calc(), no un número suelto').toMatch(/calc\(/);
        expect(m[1], 'debe partir del tamaño del botón').toContain('--settings-close-size');
        expect(m[1], 'debe sumar la separación del botón').toContain('--settings-close-inset');
    });

    it('y en escritorio NO se reserva: sería indentar el título por nada', () => {
        // El caso que antes exigía simetría, invertido a sabiendas. Si alguien vuelve a
        // poner canaleta en escritorio, el título se separa 68 px del borde por un
        // botón que ya ocupa su sitio solo.
        // Anclado a inicio de línea: un `indexOf('@media')` a secas encuentra la
        // palabra dentro de un COMENTARIO —los de este fichero la mencionan varias
        // veces— y recorta el CSS antes de la regla que se quiere leer. El guard no
        // falla: mira otra cosa y afirma sobre otra cosa.
        const primerMedia = css.search(/^@media/m);
        const base = primerMedia > 0 ? css.slice(0, primerMedia) : css;
        const cab = reglaEn(base, '.inDialog .pageHeader {');
        expect(cab, 'no existe la regla base de la cabecera en el diálogo').toBeTruthy();
        expect(
            cab,
            'volvió la canaleta a la cabecera de escritorio: el hueco lo ocupa el botón, '
            + 'que ahora es un hermano en la misma fila',
        ).not.toMatch(/padding-left:\s*calc/);
    });

    it('el botón mide lo que dicen las variables (de ahí sale el hueco espejo)', () => {
        const btn = regla('.inDialog .exitSettingsBtn {');
        expect(btn).toMatch(/width:\s*var\(--settings-close-size\)/);
        expect(btn).toMatch(/height:\s*var\(--settings-close-size\)/);
        // Ya no se afirma `right: var(--settings-close-inset)`: el botón dejó de
        // colocarse a sí mismo. Ese inset es ahora el `padding-right` de la fila de
        // chrome, que es quien lo separa del borde — y quien lo mide de verdad.
        const fila = regla('.inDialog .headerRow {');
        expect(fila, 'no existe la fila de chrome').toBeTruthy();
        expect(
            fila,
            'la fila dejó de usar la variable para separar la X del borde: el hueco '
            + 'espejo de móvil se calcula con ella y dejarían de medir lo mismo',
        ).toMatch(/padding:[^;]*var\(--settings-close-inset\)/);
        // El padding suelto que había antes falseaba el ancho real del botón.
        expect(btn).toMatch(/padding:\s*0\s*;/);
    });

    it('[P1-PLAN-DIALOG-GUTTER] el diálogo neutraliza el margen negativo del plan', () => {
        // `.plan-objetivo-mobile` lleva `margin: 0 -1rem` para ganar ancho cancelando
        // el relleno de `.section` EN LA PÁGINA. Dentro del diálogo la cadena de
        // relleno es otra y ese mismo -16px por lado se lo come casi entero: el
        // contenido acaba contra el borde de la pantalla.
        const r = regla('.inDialog :global(.plan-objetivo-mobile) {');
        expect(r).toMatch(/margin-left:\s*0/);
        expect(r).toMatch(/margin-right:\s*0/);
    });

    it('y la página CONSERVA ese ensanchado (allí sigue siendo correcto)', () => {
        // Neutralizarlo en los dos sitios sería arreglar el diálogo rompiendo la
        // página: el margen negativo se escribió para el relleno que .section tiene
        // ahí, y ahí funciona.
        const jsx = fs.readFileSync(
            path.resolve(__dirname, '..', 'pages', 'Settings.jsx'),
            'utf-8',
        );
        expect(jsx, 'el ensanchado de la página desapareció').toMatch(/margin-left:\s*-1rem/);
    });

    it('la zona táctil llega a 44px sin agrandar el dibujo', () => {
        // Ampliar el botón se comería la canaleta; se estira solo el área sensible.
        const after = regla('.inDialog .exitSettingsBtn::after {');
        const m = after.match(/inset:\s*(-?\d+)px/);
        expect(m, 'falta el ::after que amplía la zona táctil').toBeTruthy();
        const size = Number(regla('.inDialog {').match(/--settings-close-size:\s*(\d+)px/)[1]);
        const tactil = size + 2 * Math.abs(Number(m[1]));
        expect(tactil, `zona táctil de ${tactil}px`).toBeGreaterThanOrEqual(44);
    });
});
