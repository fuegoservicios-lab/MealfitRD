/**
 * [P1-WEEKNAV-MOBILE-SIZE + P1-SWAP-LOCK-EXPLAINS · 2026-08-11] «Tu Menú» en el teléfono.
 *
 * TRES DEFECTOS QUE COMPARTÍAN UNA FORMA: la interfaz decidía por el usuario que todo
 * tenía que caber, y para lograrlo encogía o callaba.
 *
 * 1. LAS SEMANAS NO SE LEÍAN. `grid-auto-columns: 1fr` repartía el ancho entre las cinco:
 *    a 390px eso deja ~66px por pastilla, «Semana 2» no cabe y el `text-overflow:
 *    ellipsis` la dejaba en «Seman…». Las cinco decían lo mismo y ninguna informaba. El
 *    bloque móvil que existía agravaba el problema porque intentaba resolverlo
 *    ENCOGIENDO (título a 0,68rem, celdas a 46px) — pero el ancho que falta no se
 *    consigue achicando la letra. Medido tras el cambio, a 390px: los cinco títulos
 *    caben enteros (63px de texto en 62 de hueco), la fila desliza y asoman 2,6
 *    pastillas — esa que asoma ES la señal de que hay más.
 *
 * 2. LOS CUADROS ERAN PEQUEÑOS y el bloque del teléfono los hacía MÁS pequeños que en
 *    escritorio. Medido: la celda pasa de 46 a 68px de alto. El ancho no se puede tocar
 *    (son siete columnas), así que el tamaño se gana en la otra dimensión.
 *
 * 3. EL BLOQUEO DE «CAMBIAR PLATO» NO SE PODÍA PREGUNTAR. Un botón `disabled` no emite
 *    click: el motivo vivía en el `title` —que en un teléfono no existe, no hay puntero
 *    que se pose— y en el `aria-label`. Para todos los demás, tocarlo no hacía nada:
 *    el bloqueo era indistinguible de una app colgada.
 *
 * Este guard afirma las DECISIONES, no medidas exactas — salvo donde la medida ES la
 * decisión: que en el teléfono nada sea más pequeño que en escritorio.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, '..');
const leer = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const CSS = leer('index.css');
const NAV = leer('components', 'dashboard', 'PlanWeekNav.jsx');
const DASH = leer('pages', 'Dashboard.jsx');

/** Cuerpo de un bloque contando llaves desde una posición. Nunca una ventana de N
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

function reglas(fuente, selector) {
    const re = new RegExp(`^[ \\t]*${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`, 'gm');
    const out = [];
    let m;
    while ((m = re.exec(fuente)) !== null) out.push(m[1]);
    return out.join('\n');
}

/** El `@media` de teléfono que CONTIENE la regla de las pastillas — no el primero que
 *  aparezca en el fichero, que sería un ancla falsa: hay varios en index.css. */
function bloqueMovilDeSemanas() {
    const medias = [...CSS.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)];
    for (const m of medias) {
        const cuerpo = cuerpoDesde(CSS, m.index);
        if (cuerpo && /\.plan-week-pills\s*\{/.test(cuerpo)) return { ancho: Number(m[1]), cuerpo };
    }
    return null;
}

/** Fuente SIN comentarios. Sin esto un guard se encuentra a sí mismo: el comentario que
 *  explica «se ajusta scrollLeft a mano en vez de usar scrollIntoView» contiene la
 *  palabra que el caso busca prohibir, y la prohibición se dispara contra su propia
 *  justificación. Es la quinta vez que esta forma muerde en este repo. */
const sinComentarios = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const numero = (txt, prop) => {
    const m = new RegExp(`${prop}:\\s*([\\d.]+)(rem|px)`).exec(txt || '');
    return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : null;
};

describe('[P1-WEEKNAV-MOBILE-SIZE] las semanas se leen y los cuadros se agrandan', () => {
    it('en el teléfono la fila DESLIZA en vez de repartirse el ancho', () => {
        const movil = bloqueMovilDeSemanas();
        expect(movil, 'no hay bloque de teléfono para las pastillas de semana').toBeTruthy();

        const pills = reglas(movil.cuerpo, '.plan-week-pills');
        expect(pills).toMatch(/overflow-x:\s*auto/);
        expect(pills).toMatch(/display:\s*flex/);

        // Repartir el ancho es lo que cortaba los nombres. Si vuelve, vuelve el defecto.
        expect(
            pills,
            'las semanas volvieron a repartirse el ancho: a 390px «Semana 2» no cabe y se corta',
        ).not.toMatch(/grid-auto-columns/);
    });

    it('los nombres dejan de recortarse con puntos suspensivos', () => {
        const { cuerpo } = bloqueMovilDeSemanas();
        // La regla BASE sigue con ellipsis (correcta en escritorio, donde sí reparte);
        // lo que importa es que el teléfono la anule.
        expect(reglas(CSS, '.plan-week-pill__title')).toMatch(/text-overflow:\s*ellipsis/);
        expect(
            reglas(cuerpo, '.plan-week-pill__title'),
            'el título vuelve a recortarse: «Semana 2» se lee «Seman…»',
        ).toMatch(/text-overflow:\s*clip/);
    });

    // [P1-WEEKNAV-SQUARE-DAYS · 2026-08-11] ESTE CASO SE ACOTÓ, y conviene saber por qué.
    //
    // Afirmaba que NINGUNA medida del teléfono fuera menor que la de escritorio, porque
    // el defecto original era un bloque móvil que existía para ENCOGER. Sigue siendo la
    // regla para lo que se viene a leer —el número del día y los nombres de semana—,
    // pero ya no puede aplicarse a todo: el dueño pidió después que los días fueran
    // CUADRADOS, y un cuadrado ata el alto al ancho. Con siete columnas el lado no llega
    // a 50px, así que los dos renglones secundarios (el nombre del día y el estado)
    // tuvieron que ceder para que los tres quepan sin cortarse.
    //
    // Lo que NO cede es el número: es el dato por el que se mira esta fila.
    it('lo que se viene a leer no encoge en el teléfono', () => {
        const { cuerpo } = bloqueMovilDeSemanas();
        const pares = [
            ['.plan-week-cell__num', 'font-size'],
            ['.plan-week-pill__title', 'font-size'],
            ['.plan-week-pill__range', 'font-size'],
        ];
        for (const [sel, prop] of pares) {
            const base = numero(reglas(CSS, sel), prop);
            const movil = numero(reglas(cuerpo, sel), prop);
            if (base == null || movil == null) continue;
            expect(
                movil,
                `${sel} { ${prop} } es MENOR en el teléfono (${movil}px) que en escritorio (${base}px): `
                + 'ese encogimiento es justo lo que el dueño pidió deshacer',
            ).toBeGreaterThanOrEqual(base);
        }
    });

    it('los días son CUADRADOS, y el cuadrado se declara como proporción', () => {
        const { cuerpo } = bloqueMovilDeSemanas();
        // [P1-WEEKNAV-STATE-BELOW · 2026-08-11] El cuadrado es la CAJA (día + número), no
        // la celda: la celda incluye además el pie del estado y por eso es más alta.
        const caja = reglas(cuerpo, '.plan-week-cell__box');
        expect(caja, 'desapareció la caja del cuadrado').not.toBe('');
        expect(caja, 'los días dejaron de ser cuadrados').toMatch(/aspect-ratio:\s*1\s*\/\s*1/);
        // Un alto fijo es cuadrado solo en la anchura donde alguien lo midió; la
        // proporción lo sigue siendo a 320, 390 y 430.
        expect(
            /min-height:\s*0/.test(cuerpo),
            'el `min-height` del bloque base no se anula: cuando el cuadrado sale más '
            + 'pequeño que él, gana y el lado se estira otra vez',
        ).toBe(true);
    });

    it('el estado va FUERA del cuadrado — por eso se puede leer', () => {
        // El defecto que esto cierra: con los tres renglones dentro, el lado del cuadrado
        // (~40px reales, no los 48 que yo había medido con un contenedor demasiado ancho)
        // no daba para «en cola» y se cortaba. Fuera, el cuadrado solo tiene que caber dos
        // líneas y el pie ocupa lo que necesite.
        // Se extrae el INTERIOR de la caja contando la anidación de <span>. Un primer
        // intento ancló en «el primer `</span>` tras el número» — pero ese es el cierre
        // del PROPIO número, no el de la caja, así que el estado quedaba «después» del
        // ancla estuviera donde estuviera. La mutación lo destapó: metí el estado dentro
        // de la caja y el guard siguió verde.
        const iCaja = NAV.lastIndexOf('<span className="plan-week-cell__box">');
        expect(iCaja, 'desapareció la caja del cuadrado').toBeGreaterThan(0);
        let nivel = 0;
        let fin = -1;
        const re = /<span\b|<\/span>/g;
        re.lastIndex = iCaja;
        let m;
        while ((m = re.exec(NAV)) !== null) {
            nivel += m[0] === '</span>' ? -1 : 1;
            if (nivel === 0) { fin = m.index; break; }
        }
        expect(fin, 'no se pudo cerrar la caja: ¿cambió el marcado?').toBeGreaterThan(iCaja);

        const dentro = NAV.slice(iCaja, fin);
        expect(NAV, 'desapareció el estado del día').toMatch(/plan-week-cell__state/);
        expect(
            dentro.includes('plan-week-cell__state'),
            'el estado volvió DENTRO del cuadrado: a ~40px de lado no cabe y se corta, que es '
            + 'exactamente lo que el dueño reportó',
        ).toBe(false);
    });

    it('en escritorio la caja es INERTE: allí no cambia nada', () => {
        // `display: contents` la borra del layout, así que sus hijos siguen siendo hijos
        // directos del flex de la celda. Sin esto, meter un envoltorio habría cambiado el
        // escritorio, que nadie pidió tocar.
        expect(reglas(CSS, '.plan-week-cell__box')).toMatch(/display:\s*contents/);
    });

    it('la semana activa se trae sola a la vista al deslizar', () => {
        // Una fila que desliza puede dejar la pastilla activa fuera de lo visible: si hoy
        // cae en la semana 3, se abriría el menú sin ninguna marcada.
        expect(NAV, 'no hay referencia a la fila de semanas').toMatch(/filaRef/);
        expect(NAV, 'no hay referencia a la pastilla activa').toMatch(/activaRef/);
        expect(NAV, 'el reajuste no depende de la semana abierta: no correría al cambiar de semana')
            .toMatch(/scrollLeft[\s\S]{0,900}?\[semanaAbierta\]/);
        // `scrollIntoView` movería TAMBIÉN el scroll vertical de la página. Se mira el
        // CÓDIGO, no el fichero: el comentario que explica por qué no se usa contiene
        // esa misma palabra.
        expect(
            sinComentarios(NAV),
            'usar scrollIntoView aquí arrastra el scroll vertical de la página entera',
        ).not.toMatch(/scrollIntoView/);
    });

    it('la línea «se genera …» ya no se escribe entre semanas y días', () => {
        expect(
            NAV,
            'volvió la etiqueta del lote: repetía en palabras lo que la fila ya dice — el día '
            + 'en que se genera ES el primero marcado «en cola»',
        ).not.toMatch(/plan-week-nav__lote/);
    });
});

describe('[P1-SWAP-LOCK-EXPLAINS] un bloqueo que se puede preguntar', () => {
    /** El bloque del botón de swap: desde su comentario ancla hasta el cierre de la
     *  etiqueta de apertura. Se ancla en `swapLockReason`, que solo existe aquí. */
    const bloqueBoton = (() => {
        const i = DASH.indexOf('disabled={!swapLockReason');
        if (i < 0) return '';
        return DASH.slice(Math.max(0, i - 2000), i + 3000);
    })();

    it('el motivo del bloqueo se decide en UN sitio', () => {
        expect(DASH, 'desapareció `swapLockReason`').toMatch(/const swapLockReason =/);
        const decl = DASH.slice(DASH.indexOf('const swapLockReason ='), DASH.indexOf('const swapLockReason =') + 700);
        for (const cond of ['isEatenToday', 'isPantryTooEmptyForSwap', 'isReadOnlyDay']) {
            expect(decl, `\`${cond}\` dejó de contar como motivo de bloqueo`).toMatch(new RegExp(cond));
        }
    });

    it('el bloqueado NO usa `disabled`, o el toque no llegaría', () => {
        expect(bloqueBoton, 'no se encontró el botón de Cambiar Plato').not.toBe('');
        // La clave del arreglo: `disabled` impide el click, y sin click no hay forma de
        // explicar nada en un teléfono (no hay `title` sin puntero).
        expect(bloqueBoton).toMatch(/disabled=\{!swapLockReason/);
        expect(bloqueBoton, 'el bloqueado debe anunciarse como no disponible aunque siga siendo pulsable')
            .toMatch(/aria-disabled=\{swapLockReason/);
    });

    it('al pulsarlo explica el motivo, antes de cualquier otro retorno', () => {
        const iClick = DASH.indexOf('if (swapLockReason) { toast(swapLockReason); return; }');
        expect(iClick, 'pulsar el candado ya no explica nada').toBeGreaterThan(0);
        // Antes que los early-return mudos: si uno de ellos corta primero, volvemos al
        // botón que no responde.
        const iMudo = DASH.indexOf('if (isEatenToday) return;', iClick - 400);
        expect(iMudo).toBeGreaterThan(iClick);
    });

    it('bloqueado se ve como candado, no como el botón naranja atenuado', () => {
        // Anclado en el ternario real, no en una ventana de N caracteres alrededor del
        // `disabled`: el bloque de estilos que hay en medio mide más de 2.000 caracteres
        // y la ventana se quedaba corta — la misma trampa de siempre, con otra ropa.
        const iTernario = DASH.indexOf('{swapLockReason ? (');
        expect(iTernario, 'el botón ya no distingue bloqueado de disponible').toBeGreaterThan(0);
        const rama = DASH.slice(iTernario, iTernario + 1800);

        expect(rama, 'la rama bloqueada no pinta un candado').toMatch(/\?\s*\(\s*<Lock/);
        // El rótulo sobrevive, pero en la OTRA rama: el pedido era «un candado nada más»,
        // no quitar el texto también del botón que sí funciona.
        expect(rama, 'desapareció el rótulo del botón disponible').toMatch(/Cambiar Plato<\/span>/);
        expect(
            rama.indexOf('<Lock'),
            'el rótulo aparece antes que el candado: estarían intercambiadas las ramas',
        ).toBeLessThan(rama.indexOf('Cambiar Plato</span>'));
    });
});
