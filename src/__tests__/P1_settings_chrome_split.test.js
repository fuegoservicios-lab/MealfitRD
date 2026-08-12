/**
 * [P1-SETTINGS-CHROME-SPLIT · 2026-08-10] El marco del diálogo de Configuración: la
 * fila de chrome fuera del scroll, y el scroll donde de verdad se mueve algo.
 *
 * SUSTITUYE a `P1_settings_header_sticky.test.js`, cuyos nueve casos afirmaban una
 * estructura que ya no existe. No se borraron por estorbar: se borraron porque un
 * guard que afirma declaraciones ausentes **pasa por vacío**, y entonces se ve igual
 * que uno sano. Los tres defectos que aquel guard protegía siguen protegidos aquí,
 * pero por otra vía: dejaron de ser posibles.
 *
 * ── DE DÓNDE VIENE ────────────────────────────────────────────────────────────────
 * El dueño lo dijo mirando una captura: «¿cómo ves posicionada la X y lo del scroll?
 * ¿no sería mejor a nivel estructural?». Medido antes de tocar nada, con los dos CSS
 * reales leídos del disco y la hoja global cargada, ventana 1129×883:
 *
 *   · centros de la X y del título ........ 3,44 px de desfase
 *   · la X, a 36 px del borde ............. y el código declaraba 12
 *   · canaleta vacía a la izquierda ....... 68 px, por un botón que está a la derecha
 *   · barra de scroll ..................... y 61,8 → 821,2, el panel ENTERO
 *   · de esos, junto a la cabecera fija .... 60 px
 *   · píxeles del nav que cambian a DPR 1,25  3 867
 *
 * Las seis cifras salían de UNA declaración: `overflow-y: auto` en `.panel > *`. Con
 * la cabecera dentro del scroller, la X tenía que fingirse chrome con `sticky` +
 * `float` + margen negativo + `z-index`, la cabecera tenía que ser opaca para tapar
 * lo que pasaba por debajo, necesitaba márgenes negativos para que ese fondo llegara
 * a los bordes, y reservaba canaleta a los dos lados porque el título no podía saber
 * que el botón existía. Cinco parches sujetándose entre sí.
 *
 * ── LO QUE ESTE GUARD AFIRMA ──────────────────────────────────────────────────────
 * La estructura, no los píxeles. Los valores concretos (12 px de inset, 2 rem de
 * relleno) pueden cambiar sin romper nada; lo que no puede cambiar es QUIÉN scrollea
 * y QUIÉN es hermano de quién, porque de eso dependen las seis cifras de arriba.
 *
 * Después del árbol de trabajo, medido igual: desalineación 0, canaleta 0, la barra
 * de y 141,5 a 825,5 (arranca bajo el chrome), y 0 píxeles de temblor a DPR 1 · 1,25
 * · 1,5. En móvil, la franja de 12 px baja a 0 — ver el caso de más abajo.
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
const JSX = readFileSync(join(AQUI, '..', 'pages', 'Settings.jsx'), 'utf8');

/** Cuerpo de un bloque contando llaves. Nunca por ventana de N caracteres: un
 *  comentario largo dentro del bloque la desborda y el guard se queda mirando el
 *  aire. Ya pasó tres veces en este fichero. */
function bloque(fuente, consulta) {
    const i = fuente.indexOf(consulta);
    if (i < 0) return null;
    const abre = fuente.indexOf('{', i);
    let nivel = 0;
    for (let j = abre; j < fuente.length; j += 1) {
        if (fuente[j] === '{') nivel += 1;
        else if (fuente[j] === '}') {
            nivel -= 1;
            if (nivel === 0) return fuente.slice(abre + 1, j);
        }
    }
    return null;
}

/** Declaraciones de una regla, anclando a inicio de línea y contando llaves. */
function reglas(fuente, selector) {
    const re = new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'gm');
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

/** El CSS SIN sus bloques @media. `reglas()` ancla a inicio de línea y una regla
 *  indentada dentro de un @media también casa, así que sin esto un guard sobre la
 *  regla BASE acaba leyendo además la de móvil — y afirmando lo contrario de lo que
 *  quiere. */
function soloBase(fuente) {
    // Los comentarios se van PRIMERO. La versión anterior de esta función buscaba
    // «@media» en crudo y encontraba las veces que mis propios comentarios lo
    // mencionan, empezaba a contar llaves desde ahí y se comía media hoja en
    // silencio. Un parser que lee comentarios como código no falla: devuelve otra
    // cosa, y el guard afirma sobre esa otra cosa.
    const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '');
    let salida = '';
    let i = 0;
    for (;;) {
        const m = sinComentarios.indexOf('@media', i);
        if (m < 0) { salida += sinComentarios.slice(i); break; }
        salida += sinComentarios.slice(i, m);
        const abre = sinComentarios.indexOf('{', m);
        let nivel = 0;
        let j = abre;
        for (; j < sinComentarios.length; j += 1) {
            if (sinComentarios[j] === '{') nivel += 1;
            else if (sinComentarios[j] === '}') { nivel -= 1; if (nivel === 0) break; }
        }
        i = j + 1;
    }
    return salida;
}
const BASE = soloBase(CSS);

const ESCRITORIO = () => bloque(CSS, '@media (min-width: 769px)');
const MOVIL = () => {
    // El fichero tiene DOS bloques `@media (max-width: 768px)`. El que nos toca es el
    // que declara `.wrapper.inDialog`; buscar «el primero» acertaría hoy y mentiría
    // en cuanto alguien añada otro antes.
    let desde = 0;
    for (;;) {
        const i = CSS.indexOf('@media (max-width: 768px)', desde);
        if (i < 0) return null;
        const cuerpo = bloque(CSS.slice(i), '@media (max-width: 768px)');
        if (cuerpo && cuerpo.includes('.wrapper.inDialog')) return cuerpo;
        desde = i + 1;
    }
};

describe('[P1-SETTINGS-CHROME-SPLIT] quién scrollea', () => {
    it('el hijo del panel reparte altura y NO scrollea', () => {
        // La declaración de la que salían las dos quejas. Si vuelve, vuelven las seis
        // cifras de la cabecera de este fichero.
        const hijo = reglas(CSS_DIALOGO, '.panel > *');
        expect(hijo, 'desapareció la regla `.panel > *` del diálogo').not.toBe('');
        expect(
            hijo,
            'el hijo del panel volvió a scrollear: con la cabecera dentro del scroller, '
            + 'la X vuelve a necesitar sticky+float y la barra vuelve a recorrer la '
            + 'franja fija',
        ).not.toMatch(/overflow-y:\s*auto/);
        expect(hijo).toMatch(/overflow:\s*hidden/);
        expect(hijo, 'sin columna flex no hay dos filas que repartir').toMatch(/flex-direction:\s*column/);
        expect(hijo, '`min-height: 0` es carga estructural, no cosmética').toMatch(/min-height:\s*0/);
    });

    it('en escritorio scrollea la columna de contenido, y solo ella', () => {
        const esc = ESCRITORIO();
        expect(esc, 'desapareció el bloque de escritorio').toBeTruthy();
        const contenido = reglas(esc, '.inDialog .contentPanel');
        expect(contenido, 'nadie declara el scroller en escritorio').not.toBe('');
        expect(contenido).toMatch(/overflow-y:\s*auto/);
        expect(
            contenido,
            'sin `min-height: 0` el mínimo automático de un ítem de grid es su contenido '
            + 'y el `overflow-y` no llega a activarse: el fallo es silencioso y no se '
            + 'puede llegar a la última sección',
        ).toMatch(/min-height:\s*0/);
    });

    it('en móvil scrollea el contenedor, no una columna que a veces no existe', () => {
        // Las dos columnas nunca conviven en móvil (una lleva `display:none`). Poner
        // el scroll en ellas haría que QUIÉN scrollea dependiera de un `display`, y el
        // día que se muestren las dos —o ninguna— no habría scroller y el contenido
        // quedaría inalcanzable, recortado y sin barra que lo delate.
        const mov = MOVIL();
        expect(mov, 'no se encontró el bloque móvil que declara .wrapper.inDialog').toBeTruthy();
        const cuerpo = reglas(mov, '.inDialog .layout');
        expect(cuerpo, 'en móvil nadie declara el scroller').not.toBe('');
        expect(cuerpo).toMatch(/overflow-y:\s*auto/);
    });

    it('el freno del scroll encadenado viaja con el scroller, no se queda huérfano', () => {
        // `overscroll-behavior: contain` sobre algo que no scrollea no es inofensivo:
        // es una declaración en verde afirmando una mentira.
        const esc = ESCRITORIO();
        expect(reglas(esc, '.inDialog .contentPanel')).toMatch(/overscroll-behavior:\s*contain/);
        expect(reglas(MOVIL(), '.inDialog .layout')).toMatch(/overscroll-behavior:\s*contain/);
    });

    it('[P1-SETTINGS-SCROLL-HUGS-EDGE] la barra llega al canto del panel', () => {
        // El bloque del pulgar afirma «la pista corre pegada al canto», pero el
        // `padding: 0 var(--settings-pad-x)` del `.layout` interceptaba al scroller
        // 24px antes: el pulgar flotaba a 28px del borde (24 de relleno + 4 del borde
        // transparente). Una premisa escrita que el layout desmentía.
        //
        // El par es indivisible: el margen negativo saca al scroller del relleno y el
        // `padding-right` propio le devuelve el aire al contenido. Con solo el margen,
        // el texto se pegaría a la barra; con solo el padding, la barra sigue lejos.
        const esc = ESCRITORIO();
        const contenido = reglas(esc, '.inDialog .contentPanel');
        expect(
            contenido,
            'el scroller volvió a quedarse dentro del relleno del layout: su barra '
            + 'flota en mitad del margen en vez de pegarse al canto del panel',
        ).toMatch(/margin-right:\s*calc\(var\(--settings-pad-x\)\s*\*\s*-1\)/);
        expect(
            contenido,
            'el scroller sale del relleno pero no se lo devuelve al contenido: el texto '
            + 'queda pegado a la barra',
        ).toMatch(/padding-right:\s*var\(--settings-pad-x\)/);
    });

    it('[P1-SETTINGS-DIALOG-STABLE] el hueco de la barra se reserva donde ahora scrollea', () => {
        // La invariante no se borra, se muda. Unas secciones desbordan y otras no; sin
        // reserva la barra aparece y desaparece al navegar y desplaza el contenido.
        const esc = ESCRITORIO();
        expect(
            reglas(esc, '.inDialog .contentPanel'),
            'se perdió `scrollbar-gutter: stable` al mudar el scroll: vuelve el defecto '
            + '«cada vez que cambio de sección se mueve todo»',
        ).toMatch(/scrollbar-gutter:\s*stable/);
    });
});

describe('[P1-SETTINGS-CHROME-SPLIT] la fila de chrome', () => {
    it('el JSX envuelve el botón y la cabecera juntos', () => {
        expect(
            JSX,
            'desapareció el envoltorio `headerRow`: sin él la X y el título vuelven a '
            + 'ser contenido suelto del wrapper y no pueden compartir fila',
        ).toMatch(/className=\{styles\.headerRow\}/);

        // El botón tiene que ir DENTRO del envoltorio, no antes.
        const iRow = JSX.indexOf('className={styles.headerRow}');
        const iBtn = JSX.indexOf('className={styles.exitSettingsBtn}');
        const iHead = JSX.indexOf('${styles.pageHeader}');
        expect(iRow).toBeGreaterThan(0);
        expect(iBtn, 'el botón de salida quedó fuera de la fila de chrome').toBeGreaterThan(iRow);
        expect(iHead, 'la cabecera quedó fuera de la fila de chrome').toBeGreaterThan(iRow);
    });

    it('en modo PÁGINA el envoltorio no existe', () => {
        // `display: contents` elimina la caja: sin caja no hay colapso de márgenes
        // nuevo, ni hijo nuevo para un `:first-child`, ni ítem nuevo para un flex.
        // Es lo único que garantiza que la página no se entere de este cambio.
        const base = reglas(BASE, '.headerRow');
        expect(base, 'no existe la regla base .headerRow').not.toBe('');
        expect(
            base,
            'el envoltorio dejó de ser `display: contents`: en modo página aparece una '
            + 'caja nueva y el layout de la página deja de ser el de hoy',
        ).toMatch(/display:\s*contents/);
    });

    it('la X y el título son hermanos en una fila, no capas superpuestas', () => {
        const fila = reglas(BASE, '.inDialog .headerRow');
        expect(fila, 'no existe la fila de chrome del diálogo').not.toBe('');
        expect(fila).toMatch(/display:\s*flex/);
        expect(
            fila,
            'row-reverse es lo que deja la X a la derecha SIN tocar el orden del DOM: '
            + 'el botón va primero en el JSX para que sea el primer focusable',
        ).toMatch(/flex-direction:\s*row-reverse/);
        expect(
            fila,
            'con `center`, un título de tres líneas en móvil manda la X al medio del '
            + 'bloque, lejos de la esquina donde uno busca una X',
        ).toMatch(/align-items:\s*flex-start/);
    });

    it('la X deja de ser una capa: caen sus cuatro muletas', () => {
        const boton = reglas(BASE, '.inDialog .exitSettingsBtn');
        expect(boton, 'no existe la regla del botón en el diálogo').not.toBe('');
        for (const [prop, re, porque] of [
            ['position: sticky', /position:\s*sticky/, 'ya no vive dentro de nada que scrollee'],
            ['float', /float:\s*/, 'un flex item no ocupa línea propia'],
            ['z-index', /z-index:\s*/, 'no queda fondo opaco al que ganarle'],
            ['margen negativo', /margin:[^;]*-/, 'no hay float cuyo alto compensar'],
        ]) {
            expect(boton, `volvió «${prop}» a la X — ${porque}`).not.toMatch(re);
        }
        expect(
            boton,
            '`position: relative` es carga estructural: sin él el `::after` de 44px '
            + 'táctiles se ancla al wrapper y se vuelve un área de clic del tamaño de '
            + 'la ventana entera, hija del botón de cerrar',
        ).toMatch(/position:\s*relative/);
    });

    it('la cabecera deja de fingirse chrome: caen sus cinco declaraciones', () => {
        const cab = reglas(BASE, '.inDialog .pageHeader');
        expect(cab, 'no existe la regla de la cabecera en el diálogo').not.toBe('');
        for (const [prop, re] of [
            ['position: sticky', /position:\s*sticky/],
            ['z-index', /z-index:\s*/],
            ['fondo opaco', /background:\s*var\(--bg-page/],
            ['márgenes negativos', /margin:[^;]*calc\(-1/],
            ['canaleta simétrica', /padding-left:\s*calc\([^;]*--settings-close-size/],
        ]) {
            expect(cab, `volvió «${prop}» a la cabecera: es una muleta del scroll que ya no existe`).not.toMatch(re);
        }
    });

    it('nadie repinta la canaleta simétrica de escritorio', () => {
        // El defecto que cerraba —el título corriendo bajo la X— hoy es inexpresable:
        // son hermanos en una fila. Reservar hueco a los dos lados volvería a indentar
        // el título 68px por un botón que está al otro lado.
        const esc = ESCRITORIO();
        expect(
            reglas(esc, '.inDialog .pageHeader'),
            'volvió la canaleta en escritorio: el título vuelve a estar indentado por un '
            + 'hueco que ya no hace falta',
        ).not.toMatch(/padding-left:\s*calc/);
    });

    it('en móvil se reserva el hueco ESPEJO de la X, que sí hace falta', () => {
        // Allí el título va centrado y a su derecha hay una caja real. Sin reservar lo
        // mismo a la izquierda queda descentrado respecto del panel — la mitad del
        // defecto original de P1-SETTINGS-HEADER-GUTTER, que sigue vigente en móvil.
        const cuerpo = reglas(MOVIL(), '.inDialog .pageHeader');
        expect(cuerpo, 'en móvil nadie reserva el hueco espejo').not.toBe('');
        expect(cuerpo).toMatch(/padding-left:\s*calc\([^;]*--settings-close-size[^;]*--settings-close-inset/);
    });
});

describe('[P1-SETTINGS-CHROME-SPLIT] la lista de secciones', () => {
    it('es estática y lo dice: un sticky aquí sería una declaración inerte', () => {
        // No basta con quitar el `top`. Heredaría el `sticky` de `.sidebar` —que es
        // chrome de la PÁGINA—, y ese sticky no se pegaría a nada porque su scrollport
        // sería el wrapper, que no se mueve. Un guard podría leerlo como si funcionara.
        // Y además promociona una capa de composición, que es exactamente lo que se
        // re-rasterizaba cada fotograma a escala de Windows fraccionaria.
        const enDialogo = reglas(ESCRITORIO(), '.inDialog .sidebar');
        expect(enDialogo, 'no hay regla .inDialog .sidebar en escritorio').not.toBe('');
        const pos = /position:\s*([a-z-]+)/.exec(enDialogo);
        expect(pos, 'la lista no declara posición: heredaría un sticky inerte').toBeTruthy();
        expect(pos[1]).toBe('static');
    });

    it('ya no ata su tope a variables de la cabecera', () => {
        // Aquí vivían `--settings-header-h` y `--settings-header-gap`, y con ellas tres
        // P-fixes en cadena para que dos números escritos aparte coincidieran: primero
        // con 12px de error, luego con 0,46875. Ya no hay dos números que sincronizar.
        const enDialogo = reglas(ESCRITORIO(), '.inDialog .sidebar');
        expect(
            enDialogo,
            'la lista volvió a derivar su tope del alto de la cabecera: eso solo hace '
            + 'falta si la cabecera volvió a estar dentro del scroll',
        ).not.toMatch(/--settings-header-h/);
        expect(CSS, 'reapareció --settings-header-h: ¿volvió la cabecera al scroll?').not.toMatch(/--settings-header-h:\s*[\d.]/);
        expect(CSS, 'reapareció --settings-header-gap').not.toMatch(/--settings-header-gap:\s*[\d.]/);
    });

    it('conserva la línea divisoria, que era lo legítimo de ese bloque', () => {
        const enDialogo = reglas(ESCRITORIO(), '.inDialog .sidebar');
        expect(enDialogo).toMatch(/border-right:/);
        expect(enDialogo, 'la línea necesita su aire a la derecha').toMatch(/padding:[^;]*1rem/);
    });

    it('tiene salvaguarda de scroll para la ventana baja', () => {
        // Medido: por debajo de ~645px de alto de ventana las 7 filas no caben. Sin
        // esto quedan recortadas por el `overflow: hidden` y «Suscripción» deja de ser
        // alcanzable, sin barra que lo delate.
        const nav = reglas(ESCRITORIO(), '.inDialog .sidebarNav');
        expect(nav, 'la lista no tiene salvaguarda: en ventana baja se recorta en silencio').not.toBe('');
        expect(nav).toMatch(/overflow-y:\s*auto/);
        expect(nav).toMatch(/min-height:\s*0/);
    });
});

describe('[P1-SETTINGS-CHROME-SPLIT] el relleno gana en móvil', () => {
    it('el wrapper del diálogo usa DOS clases, no una', () => {
        // EL DEFECTO QUE ESTO ANCLA, y que estuvo vivo días sin que nadie lo viera.
        // `.wrapper` dentro de un `@media` tiene la MISMA especificidad que `.inDialog`
        // —un `@media` no suma nada— y va después en el fichero, así que ganaba. En el
        // teléfono el `padding-top` del wrapper no era 0 sino 12px (16 a 768px), y como
        // un `sticky` está confinado a la caja de contenido de su padre, quedaba una
        // franja viva de 12px por la que se veía pasar el contenido sobre la cabecera.
        //
        // Su guard anterior pasaba porque comprobaba que la declaración EXISTIERA, no
        // que GANARA. De ahí la forma de este caso: no mira el valor, mira quién puede
        // ganarle.
        expect(
            CSS,
            'el bloque del diálogo volvió a una sola clase: cualquier `@media .wrapper` '
            + 'de más abajo le gana por orden y le devuelve el relleno',
        ).toMatch(/^\.wrapper\.inDialog\s*\{/m);

        const enMedia = [...CSS.matchAll(/@media[^{]*\{/g)].length;
        expect(enMedia, 'sanity: el fichero tiene bloques @media').toBeGreaterThan(0);
    });

    it('cada @media que redefine .wrapper redefine también .wrapper.inDialog', () => {
        // La forma general del defecto: quien toque el relleno del wrapper en un
        // breakpoint tiene que decidir qué hace el diálogo en ese breakpoint. Si no lo
        // dice, lo hereda por accidente y el accidente no se ve.
        const anchos = ['@media (max-width: 768px)', '@media (max-width: 480px)'];
        for (const q of anchos) {
            let desde = 0;
            for (;;) {
                const i = CSS.indexOf(q, desde);
                if (i < 0) break;
                const cuerpo = bloque(CSS.slice(i), q);
                desde = i + 1;
                if (!cuerpo || !/^\s*\.wrapper\s*\{/m.test(cuerpo)) continue;
                expect(
                    cuerpo,
                    `${q} redefine .wrapper sin decir qué hace el diálogo: el valor de la `
                    + 'página le gana por orden y el diálogo recupera un relleno que rompe '
                    + 'el reparto de filas',
                ).toMatch(/\.wrapper\.inDialog\s*\{/);
            }
        }
    });
});

describe('[P1-SETTINGS-CHROME-SPLIT] lo que NO debe cambiar', () => {
    it('la zona táctil de 44px del botón sigue en pie', () => {
        const despues = reglas(CSS, '.inDialog .exitSettingsBtn::after');
        expect(despues, 'desapareció la zona táctil ampliada del botón de cerrar').not.toBe('');
        expect(despues).toMatch(/inset:\s*-6px/);
    });

    it('el rótulo «Cerrar» sigue oculto: la X se explica con aria-label', () => {
        expect(reglas(CSS, '.inDialog .exitSettingsBtn span')).toMatch(/display:\s*none/);
    });

    it('la ventana no se lleva ningún z-index nuevo', () => {
        // `modalLayering` lee el PRIMER z-index del fichero del diálogo y espera que sea
        // el de `.overlay`. Un z-index nuevo antes que él rompería ese guard sin que
        // este cambio tenga nada que ver.
        const primero = zDeTexto(CSS_DIALOGO.slice(0, CSS_DIALOGO.indexOf('.backdrop')));
        expect(primero, 'el primer z-index del diálogo dejó de ser el de .overlay').toBeGreaterThan(0);
    });
});
