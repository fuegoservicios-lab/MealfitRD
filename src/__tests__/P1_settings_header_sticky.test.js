/**
 * [P1-SETTINGS-HEADER-STICKY · 2026-08-10] «Cuando le doy scroll desaparece la X y el
 * texto que dice Configuración».
 *
 * EL DEFECTO. Hermano de P1-SETTINGS-NAV-STICKY: allí era la barra de secciones, aquí la
 * cabecera. Misma causa de fondo — dentro del diálogo el que scrollea es el wrapper de
 * Settings (`.panel > *` lleva `overflow-y: auto`), no el documento, y todo lo que viva
 * dentro se va con el contenido salvo que se pegue.
 *
 * EL MATIZ QUE ENGAÑA. La X estaba en `position: absolute`, que suena a «fijo» y no lo
 * es: un elemento absoluto dentro de un contenedor con scroll SE VA CON EL CONTENIDO,
 * porque su bloque contenedor scrollea con él. Solo `sticky` o `fixed` se quedan.
 *
 * LO CARO NO ERA ESTÉTICO: al bajar, el usuario se quedaba sin botón de cerrar. Quedan
 * `Esc` y el clic fuera, pero ninguna salida visible.
 *
 * MEDIDO ANTES DE TOCAR, en Chrome a 1112px inyectando el CSS real de los dos módulos:
 *
 *     tras 999px de scroll   X.top = −987px   ·   cabecera.top = −979px
 *     con sticky             X.top =   32px   ·   cabecera.top =   20px  (invariantes)
 *
 * No estaban recortadas: estaban fuera. Esa medición descartó las hipótesis caras
 * (un ancestro con `overflow:hidden`, la rejilla, un `transform`) y dejó dos
 * declaraciones que cambiar.
 *
 * Se afirma la PROPIEDAD —la cabecera queda pegada mientras el contenido corre— y no
 * valores de `top`, que pueden ajustarse sin romper nada. Y se ancla además QUIÉN hace
 * scroll: si alguien mueve ese `overflow-y` a otro sitio, el pegado se ancla a otro
 * contenedor y el arreglo deja de significar lo que dice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { zDeTexto } from './utils/zLayers';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(AQUI, '..', 'pages', 'Settings.module.css'), 'utf8');
const CSS_DIALOGO = readFileSync(
    join(AQUI, '..', 'components', 'dashboard', 'SettingsDialog.module.css'),
    'utf8',
);

/** Declaraciones de una regla, anclando a inicio de línea. Contar llaves y no una
 *  ventana de N caracteres: un comentario largo dentro del bloque desborda la ventana
 *  y el guard se queda mirando el aire. */
function reglas(fuente, selector) {
    const re = new RegExp(`^[ \\t]*${selector.replace(/\./g, '\\.')}\\s*\\{`, 'gm');
    const out = [];
    let m;
    while ((m = re.exec(fuente)) !== null) {
        const abre = fuente.indexOf('{', m.index);
        let nivel = 0;
        for (let j = abre; j < fuente.length; j += 1) {
            if (fuente[j] === '{') nivel += 1;
            else if (fuente[j] === '}') {
                nivel -= 1;
                if (nivel === 0) { out.push(fuente.slice(abre + 1, j)); break; }
            }
        }
    }
    return out.join('\n');
}

/* [P1-Z-SCALE · 2026-08-10] Resuelve tokens `var(--z-*)` además de literales:
   si no, este guard se cae solo con que alguien adopte la escala. */
const z = (cuerpo) => zDeTexto(cuerpo);

describe('[P1-SETTINGS-HEADER-STICKY] la cabecera del diálogo no se va con el scroll', () => {
    it('el título queda pegado arriba', () => {
        const cabecera = reglas(CSS, '.inDialog .pageHeader');
        expect(cabecera, 'no se encontró la regla .inDialog .pageHeader').not.toBe('');
        expect(cabecera).toMatch(/position:\s*sticky/);
        expect(cabecera, 'sticky sin `top` no se pega a nada').toMatch(/top:\s*[^;]+;/);
    });

    it('la barra pegajosa es opaca', () => {
        // Un sticky transparente deja que el contenido se le monte debajo mientras
        // pasa: se pega, y aun así no se lee.
        const cabecera = reglas(CSS, '.inDialog .pageHeader');
        expect(cabecera, 'sin fondo, el contenido se ve pasar por debajo del título')
            .toMatch(/background:\s*[^;]+;/);
    });

    it('el botón de cerrar queda pegado, y NO en absolute', () => {
        const boton = reglas(CSS, '.inDialog .exitSettingsBtn');
        expect(boton, 'no se encontró la regla .inDialog .exitSettingsBtn').not.toBe('');
        const posicion = /position:\s*([a-z-]+)/.exec(boton);
        expect(posicion, '.inDialog .exitSettingsBtn no declara position').toBeTruthy();
        expect(
            posicion[1],
            '`absolute` dentro de un contenedor con scroll se va con el contenido: '
            + 'el usuario se queda sin botón de cerrar al bajar',
        ).toBe('sticky');
    });

    it('la X se pinta por encima de la barra, no debajo', () => {
        // Si la cabecera (opaca) gana en z, su fondo tapa la X y volvemos al mismo
        // síntoma —no hay botón de cerrar— por una causa distinta.
        const zBoton = z(reglas(CSS, '.inDialog .exitSettingsBtn'));
        const zCabecera = z(reglas(CSS, '.inDialog .pageHeader'));
        expect(zBoton, 'la X no declara z-index').toBeGreaterThan(0);
        expect(zCabecera, 'la cabecera no declara z-index').toBeGreaterThan(0);
        expect(zBoton).toBeGreaterThan(zCabecera);
    });

    it('la barra llega al borde: nada puede colarse por encima', () => {
        // LA TRAMPA QUE ESTO ANCLA. Un elemento `sticky` está CONFINADO a la caja de
        // contenido de su padre: no puede salir de ella. Mientras `.inDialog` tuvo
        // `padding-top`, la barra no podía subir hasta el borde del contenedor que
        // scrollea — el margen negativo empujaba y el confinamiento lo devolvía —, y
        // quedaba una franja de 20px por la que se veía pasar el formulario.
        // Medido: cabecera.top = 20 con relleno · 0 sin él.
        // Por eso el relleno superior lo aporta la BARRA y no el wrapper.
        const wrapper = reglas(CSS, '.inDialog');
        const padding = /padding:\s*([^;]+);/.exec(wrapper);
        expect(padding, '.inDialog dejó de declarar padding').toBeTruthy();
        expect(
            padding[1].trim().split(/\s+/)[0],
            'el wrapper volvió a tener relleno superior: el `sticky` no puede salir de '
            + 'la caja de contenido de su padre, así que la barra deja de tocar el borde '
            + 'y el contenido se cuela por encima',
        ).toBe('0');

        const cabecera = reglas(CSS, '.inDialog .pageHeader');
        expect(cabecera, 'la barra debe aportar ella misma el aire de arriba')
            .toMatch(/padding-top:\s*[^;]+;/);
    });

    it('la barra lateral se pega POR DEBAJO de la cabecera, no detrás', () => {
        // LA INTERACCIÓN QUE ESTO ANCLA. Dos arreglos correctos por separado se
        // estorbaron: la barra de secciones es pegajosa (P1-SETTINGS-NAV-STICKY) con
        // `top: 1.5rem`, calibrado cuando NO había cabecera pegajosa. Al volverse la
        // cabecera pegajosa Y OPACA, la lista se pegaba detrás de ella.
        // Medido: cabecera de 60px, barra a 24 → 36px de «General» tapados.
        // Se afirma que la barra deriva su tope de la altura de la cabecera, para que
        // no puedan desincronizarse con dos números escritos a mano.
        const escritorio = CSS.slice(CSS.indexOf('@media (min-width: 769px)'));
        const barra = reglas(escritorio, '.inDialog .sidebar');
        expect(barra, 'no hay regla .inDialog .sidebar en el bloque de escritorio').not.toBe('');
        expect(
            barra,
            'la barra lateral no ata su `top` a --settings-header-h: si la cabecera '
            + 'crece o encoge, la lista se mete detrás de ella o queda flotando',
        ).toMatch(/top:\s*calc\([^;]*--settings-header-h/);

        const wrapper = reglas(CSS, '.inDialog');
        expect(wrapper, 'nadie declara --settings-header-h').toMatch(/--settings-header-h:\s*[^;]+;/);
    });

    it('la barra no se mueve NADA: se pega donde ya está', () => {
        // No basta con que se pegue: tiene que pegarse EXACTAMENTE en su posición
        // natural, que es «alto de la cabecera + su margen inferior». Con cualquier
        // otro valor la lista da un salto al empezar a bajar y luego se queda.
        // Medido con el valor anterior (0.5rem): empezaba en 79px y se pegaba en 67
        // — 12px de salto. Poco, pero el dueño lo vio.
        //
        // La garantía se sostiene sobre que el margen de la cabecera y el tope de la
        // barra sean LA MISMA variable. Dos números iguales escritos aparte vuelven
        // a separarse en cuanto alguien retoque el espaciado.
        const barra = reglas(CSS.slice(CSS.indexOf('@media (min-width: 769px)')), '.inDialog .sidebar');
        expect(
            barra,
            'el tope de la barra no usa --settings-header-gap: si no es el MISMO valor '
            + 'que el margen inferior de la cabecera, la lista salta al scrollear',
        ).toMatch(/top:\s*calc\(\s*var\(--settings-header-h\)\s*\+\s*var\(--settings-header-gap\)\s*\)/);

        const cabecera = reglas(CSS, '.inDialog .pageHeader');
        expect(
            cabecera,
            'la cabecera dejó de usar --settings-header-gap como margen inferior: '
            + 'su separación y el pegado de la barra ya no son el mismo número',
        ).toMatch(/margin:[^;]*var\(--settings-header-gap\)/);
    });

    it('la cabecera MIDE lo que dice la variable, no algo parecido', () => {
        // [P1-SETTINGS-HEADER-EXACT · 2026-08-10] El residuo que dejó el test de
        // arriba. Aquel ató el margen y el tope a la MISMA variable, y aun así la
        // barra seguía dando un tirón — porque la variable era una DESCRIPCIÓN del
        // alto de la cabecera, escrita a mano, y estaba mal por 0,46875px: el
        // comentario decía «20 + 28 + 12 = 60» y la caja de línea del título mide
        // 22,875 con 5,59375 de margen, no 28.
        //
        // Por qué medio píxel se ve: Chrome pinta cada `<svg>` cuadrado a píxel de
        // pantalla, así que el tirón fraccionario se vuelve un salto de 1px ENTERO
        // en los iconos cuya coordenada cruza el umbral de redondeo. Medido con los
        // dos CSS reales, 16 alturas de ventana: antes 16/16 con salto, después 0/16.
        // A 907px saltaban Capacidades, Privacidad, Súper Personalización y Plan &
        // Objetivo — los cuatro que reportó el dueño, reproducidos.
        //
        // Se afirma que el alto se IMPONE desde la variable. Una variable que solo
        // describe puede mentir; esta no puede, porque la cabecera obedece.
        const escritorio = CSS.slice(CSS.indexOf('@media (min-width: 769px)'));
        const cabecera = reglas(escritorio, '.inDialog .pageHeader');
        expect(
            cabecera,
            'en escritorio nadie fija el alto de la cabecera: `--settings-header-h` '
            + 'vuelve a ser una copia a mano del alto real, y en cuanto discrepen '
            + 'aunque sea por una fracción de píxel la barra da un tirón al scrollear',
        ).toMatch(/height:\s*var\(--settings-header-h\)/);
    });

    it('quién hace scroll sigue siendo el hijo del panel', () => {
        // El pegado se ancla al ancestro que scrollea. Si este overflow se mueve, lo
        // de arriba deja de significar lo que dice aunque siga en verde.
        const hijo = reglas(CSS_DIALOGO, '.panel > \\*');
        expect(hijo, 'desapareció la regla `.panel > *` del diálogo').not.toBe('');
        expect(hijo).toMatch(/overflow-y:\s*auto/);
    });
});
