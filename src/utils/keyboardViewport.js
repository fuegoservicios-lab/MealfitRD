/**
 * [P1-KB-VIEWPORT-MATH · 2026-08-23] La aritmética del teclado virtual, en UN sitio.
 *
 * EL DEFECTO QUE CIERRA. Tres superficies (chat del Agente, hoja de la Nevera, widget de
 * ayuda) calculaban el teclado así:
 *
 *     inset = innerHeight - visualViewport.height - visualViewport.offsetTop
 *
 * y usaban ESE MISMO número para dos cosas incompatibles: como LONGITUD (cuánto encoger
 * un elemento anclado al layout viewport) y como PREDICADO (¿hay teclado?). No puede ser
 * las dos: en iOS el teclado NO redimensiona el layout viewport, lo que hace Safari es
 * PANEAR el visual viewport para revelar el campo enfocado. Con H = innerHeight,
 * K = alto del teclado y S = offsetTop (el paneo):
 *
 *     visualViewport.height = H - K        (el paneo mueve, no redimensiona)
 *     inset = H - (H - K) - S = K - S
 *
 * Como LONGITUD eso es correcto —un elemento anclado al tope del layout viewport y de
 * alto H - (K-S) tiene su borde inferior justo en la línea del teclado, porque la
 * pantalla mapea y_pantalla = y_layout - S—. Como PREDICADO es fatal: cuando iOS panea
 * del todo (S = K) devuelve 0, o sea «no hay teclado» CON EL TECLADO EN PANTALLA.
 *
 * Y el chat fabrica esa condición a propósito: es la única ruta del dashboard que bloquea
 * el scroll del documento (`.container:has(.noPaddingMobile)`, DashboardLayout.module.css),
 * y sin recorrido de scroll iOS no tiene más remedio que panear. Por eso el dueño lo veía
 * «una vez bien y otra mal»: al final del historial S = 0 y todo funcionaba; leyendo a
 * media conversación S > 0 y el arreglo se apagaba justo en el caso que debía arreglar.
 *
 * El alto REAL del teclado es `H - visualViewport.height`, independiente del paneo.
 *
 * `abierto` no es `kb > 0` sino `kb >= KB_UMBRAL_PX`: el visual viewport también encoge
 * por cosas que NO son un teclado (el pinch-zoom del trackpad en escritorio, la barra
 * replegable de Safari). Un teclado de iPhone mide ≥ 250 px; ese cromo, menos de 100.
 *
 * Función PURA a propósito: recibe números, no toca `window`. Así la aritmética se puede
 * probar sin navegador — que es justo lo que faltaba, porque los guards parser-based no
 * pueden ver una resta de más.
 */

/** Un teclado de móvil no baja de esto; el cromo del navegador no llega. */
export const KB_UMBRAL_PX = 120;

/**
 * @param {{innerHeight:number, vvHeight:number, vvOffsetTop:number}} m
 * @returns {{kb:number, layoutInset:number, abierto:boolean}}
 *   kb           alto real del teclado (independiente del paneo) → úsalo como PREDICADO
 *   layoutInset  cuánto encoger un elemento anclado al layout viewport → úsalo como LONGITUD
 *   abierto      kb >= KB_UMBRAL_PX
 */
export function medirTeclado({ innerHeight, vvHeight, vvOffsetTop }) {
    const H = Number(innerHeight) || 0;
    const vh = Number(vvHeight) || 0;
    const S = Math.max(0, Number(vvOffsetTop) || 0);
    const kb = Math.max(0, Math.round(H - vh));
    return {
        kb,
        layoutInset: Math.max(0, Math.round(kb - S)),
        abierto: kb >= KB_UMBRAL_PX,
    };
}

/**
 * [P1-KB-ALTO-DE-REFERENCIA · 2026-08-23] El alto SIN teclado, recordado.
 *
 * `H − vv.height` supone que `innerHeight` es el alto de la pantalla sin teclado. En
 * Safari lo es. En la PWA de pantalla de inicio (y en algunos WebViews) iOS encoge
 * `innerHeight` JUNTO con el visual viewport al abrir el teclado: los dos bajan a la vez,
 * la resta da 0 y el sistema concluye «no hay teclado» con el teclado en pantalla. Es la
 * segunda cara del mismo defecto que P1-KB-VIEWPORT-MATH cerró por el lado del paneo:
 * la referencia se movía con lo que medía.
 *
 * La referencia correcta es el alto MÁXIMO observado: un teclado sólo puede encoger, así
 * que el máximo es, por construcción, el alto sin teclado.
 *
 * Indexado por ANCHO. Un giro a horizontal encoge el alto LEGÍTIMAMENTE, y un máximo
 * global recordaría el de vertical y diría «teclado» con el teclado cerrado. Pero un giro
 * cambia también el ancho, y un teclado no: el ancho identifica la orientación sin
 * escuchar ningún evento. Cada orientación aprende su propio máximo.
 *
 * Es un módulo-singleton a propósito: las tres superficies (chat, nevera, ayuda) deben
 * compartir la misma referencia o cada una aprendería el alto por su cuenta.
 */
const _altoSinTecladoPorAncho = new Map();

/** Alto de referencia sin teclado para este ancho: el mayor `innerHeight` visto con él. */
export function altoDeReferencia(innerHeight, innerWidth = 0) {
    const h = Number(innerHeight) || 0;
    const w = Number(innerWidth) || 0;
    const previo = _altoSinTecladoPorAncho.get(w) || 0;
    if (h > previo) { _altoSinTecladoPorAncho.set(w, h); return h; }
    return previo;
}

/** Solo para tests: olvida los máximos aprendidos. */
export function _reiniciarAltoDeReferencia() {
    _altoSinTecladoPorAncho.clear();
}

/** Lee el `window` real y delega en la función pura. Sin visualViewport → todo a cero. */
export function medirTecladoDeVentana(win = typeof window !== 'undefined' ? window : null) {
    const vv = win && win.visualViewport;
    if (!win || !vv) return { kb: 0, layoutInset: 0, abierto: false };
    // La referencia es el alto sin teclado, no el `innerHeight` del instante: si iOS los
    // encoge a la vez, el del instante ya lleva el teclado restado.
    return medirTeclado({ innerHeight: altoDeReferencia(win.innerHeight, win.innerWidth), vvHeight: vv.height, vvOffsetTop: vv.offsetTop });
}
