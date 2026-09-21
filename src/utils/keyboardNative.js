// [P1-PLAN-LOTE-140 · 2026-09-20] EL BINARIO MUEVE EL CHAT CON EL TECLADO — las piezas puras del lado web.
//
// El dueño: «en la app de Gemini se siente muy pero muy fluido y rápido». Gemini es nativa: sus vistas se animan DENTRO de
// la animación del teclado. Aquí el binario hace lo mismo con una CAPTURA del chat en tiras (la conversación, la caja de
// escribir y las fichas de la cabecera, quietas) que UIKit mueve con la curva y la duración exactas del teclado; debajo,
// la página pone su layout final DE GOLPE —nadie lo ve— y cuando está asentada dice `listo`: las tiras se funden y queda
// la página viva. El baile nativo: `ios/App/App/SceneDelegate.swift` (`CoberturaDelTeclado`). El cableado: `AgentPage.jsx`.
//
// Lo que el binario NO puede preguntar a tiempo (en `keyboardWillShow` ya no hay tiempo) se lo manda la página ANTES:
// dónde empieza la caja, dónde acaba la cabecera, qué fichas no se mueven, cuánto relleno suelta la caja (el recorrido es
// el teclado MENOS esa reserva) y cuánto puede desplazarse la conversación. Eso es `geometriaParaNativo`.
//
// Es un modo de PRUEBA, apagado por defecto: `/nativo` en el chat de la app. Lección del lote 139: lo que no se ha medido
// en el teléfono se entrega apagado. Necesita el binario nuevo: en los anteriores el manejador no existe y `/nativo` lo dice.
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from './safeLocalStorage';

export const CLAVE_TECLADO_NATIVO = 'mf_kb_nativo';
/** Con «1», el CIERRE no se cubre (solo la apertura): `/nativo cierre` lo alterna. Al cerrar, lo que asoma por arriba es
 *  la página viva ya en su sitio mientras la tira baja; si al dueño no le gusta, se apaga sin otro build. */
export const CLAVE_NATIVO_SIN_CIERRE = 'mf_kb_nativo_sin_cierre';
/** Nombre del manejador en el binario (`window.webkit.messageHandlers.mfTeclado`) — espejo de `CoberturaDelTeclado.nombre`. */
export const MANEJADOR_NATIVO = 'mfTeclado';
/** [P1-PLAN-LOTE-142] Segundo manejador: solo lo registran los binarios que además mueven la PÁGINA VIVA (`vivo`). Así la
 *  página sabe ANTES del primer aviso con qué binario habla (la geometría cambia: con `vivo` la tira de la conversación
 *  empieza en la franja de la barra de estado, no bajo la cabecera). */
export const MANEJADOR_NATIVO_VIVO = 'mfTecladoVivo';
/** Con «1», aunque el binario sepa, la página viva NO viaja (solo capturas, como el lote 141): `/nativo vivo` lo alterna. */
export const CLAVE_NATIVO_SIN_VIVO = 'mf_kb_nativo_sin_vivo';
/** Sin aviso del binario en este plazo, el chat se mueve como siempre (teclado físico, binario que no cubrió). */
export const NATIVO_ESPERA_ABRIR_MS = 300;
export const NATIVO_ESPERA_CERRAR_MS = 250;
/** Afinables que viajan en la geometría: se cambian por OTA, sin otro build. */
export const NATIVO_AJUSTES = Object.freeze({ fundidoMs: 90, fundidoRelevoMs: 110, esperaMs: 600, adelanto: 1, trasActualizar: false });
/** Margen tras la animación del teclado antes de reponer la cabecera y decir `fin` (modo vivo). */
export const NATIVO_FIN_MARGEN_MS = 40;
/** «La conversación puede desplazarse lo que haga falta» (pegada al final, al abrir). */
export const LISTA_SIN_TOPE = 100000;

function manejador(win) {
    try {
        return win?.webkit?.messageHandlers?.[MANEJADOR_NATIVO] || null;
    } catch {
        return null;
    }
}

/** ¿Este binario sabe mover el chat? Solo los que registran el manejador (lote 140 en adelante). */
export function binarioMueveElChat(win = typeof window !== 'undefined' ? window : null) {
    return Boolean(manejador(win));
}

export function tecladoNativoElegido() {
    return safeLocalStorageGet(CLAVE_TECLADO_NATIVO, null) === '1';
}

/** Encendido = elegido por el usuario Y con un binario que lo sabe hacer. */
export function tecladoNativoEncendido(win = typeof window !== 'undefined' ? window : null) {
    return tecladoNativoElegido() && binarioMueveElChat(win);
}

export function alternarTecladoNativo() {
    if (tecladoNativoElegido()) {
        safeLocalStorageRemove(CLAVE_TECLADO_NATIVO);
        return false;
    }
    safeLocalStorageSet(CLAVE_TECLADO_NATIVO, '1');
    return true;
}

/** ¿Este binario mueve además la página viva? (lote 142 en adelante) */
export function binarioMueveLaPagina(win = typeof window !== 'undefined' ? window : null) {
    try {
        return Boolean(win?.webkit?.messageHandlers?.[MANEJADOR_NATIVO_VIVO]);
    } catch {
        return false;
    }
}

export function nativoVivoElegido() {
    return safeLocalStorageGet(CLAVE_NATIVO_SIN_VIVO, null) !== '1';
}

export function alternarNativoVivo() {
    if (nativoVivoElegido()) {
        safeLocalStorageSet(CLAVE_NATIVO_SIN_VIVO, '1');
        return false;
    }
    safeLocalStorageRemove(CLAVE_NATIVO_SIN_VIVO);
    return true;
}

/** `rgb(15, 23, 42)` / `rgba(…)` → [15, 23, 42]; cualquier otra cosa → null (sin velo nativo). */
export function colorRgb(valor) {
    const m = /^rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/.exec(String(valor || '').trim());
    return m ? [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3]))] : null;
}

export function nativoCubreElCierre() {
    return safeLocalStorageGet(CLAVE_NATIVO_SIN_CIERRE, null) !== '1';
}

export function alternarCierreNativo() {
    if (nativoCubreElCierre()) {
        safeLocalStorageSet(CLAVE_NATIVO_SIN_CIERRE, '1');
        return false;
    }
    safeLocalStorageRemove(CLAVE_NATIVO_SIN_CIERRE);
    return true;
}

/** Envía un mensaje al binario. Devuelve false si no hay manejador o si falla: el llamador sigue por el camino de siempre. */
export function enviarAlNativo(mensaje, win = typeof window !== 'undefined' ? window : null) {
    const m = manejador(win);
    if (!m) return false;
    try {
        m.postMessage(mensaje);
        return true;
    } catch {
        return false;
    }
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const px = (v) => Math.round(num(v) * 10) / 10;

/** El radio de una ficha en px. `border-radius: 50%` se computa como «50%», no como px: se resuelve contra su lado menor. */
export function radioEnPx(valor, ancho = 0, alto = 0) {
    const texto = String(valor || '').trim().split(/\s+/)[0] || '';
    const n = parseFloat(texto);
    if (!(n > 0)) return 0;
    const tope = Math.min(num(ancho), num(alto)) / 2;
    const r = texto.endsWith('%') ? (Math.min(num(ancho), num(alto)) * n) / 100 : n;
    return px(tope > 0 ? Math.min(r, tope) : r);
}

/**
 * Cuánto puede desplazarse la conversación junto a la caja. Lo decide el MODO de scroll del chat, que es quien reacciona
 * cuando la ventana de lectura cambia de alto (el ResizeObserver del contenedor, lote 115):
 *   · 'bottom' sigue pegada al final y 'free' conserva su posición respecto al borde INFERIOR → las dos se mueven con la caja;
 *   · 'anchored' mantiene el mensaje enviado ARRIBA → no se mueve… salvo que al abrir vaya a soltarse y bajar al final;
 *   · virtualizada (`overflow: hidden`, la mueve Virtuoso) o que no llena su ventana → 0: no se mueve.
 * Al ABRIR no hay tope (al encoger la ventana siempre queda scroll para subir lo que sube la caja); al CERRAR el tope es
 * su `scrollTop`: al crecer la ventana el contenido baja hasta agotar el scroll, no más.
 *
 * [P1-PLAN-LOTE-141] El 140 solo movía la lista si estaba PEGADA al final: con el chat en modo libre (leyendo un poco más
 * arriba, la flecha de «ir al final» a la vista) la captura dejaba la conversación quieta mientras la página la subía 266 px
 * debajo — al fundirse, la conversación entera saltaba. El dueño, en su primer build: «se medio buguea».
 */
export function desplazamientoDeLista({ abierto = false, scrollHeight = 0, scrollTop = 0, clientHeight = 0, overflowY = 'auto', vaAlFinal = false, modo = 'bottom' } = {}) {
    if (overflowY === 'hidden') return 0;
    if (num(scrollHeight) <= num(clientHeight) + 1) return 0;
    if (abierto) return modo === 'anchored' ? 0 : Math.max(0, Math.round(num(scrollTop)));
    return vaAlFinal || modo !== 'anchored' ? LISTA_SIN_TOPE : 0;
}

/**
 * El mensaje `geometria` para el binario, en coordenadas de PANTALLA (lo que se ve: `getBoundingClientRect` menos el
 * paneo del visual viewport). `activo:false` = «no cubras»: geometría no creíble, relleno cerrado desconocido (sin él no
 * se sabe el recorrido) o cierre sin cubrir por elección.
 */
export function geometriaParaNativo({
    abierto = false, altoPantalla = 0, anchoPantalla = 0, vvOffsetTop = 0,
    cajaTop = 0, cabeceraBottom = 0, franjaAlto = 0, fichas = [],
    padCerrado = 0, padAbierto = 0, lista = null, cubreCierre = true, ajustes = NATIVO_AJUSTES,
    vivo = false, colorFondo = null,
} = {}) {
    const dy = Math.max(0, num(vvOffsetTop));
    const H = num(altoPantalla);
    const W = num(anchoPantalla);
    const caja = px(num(cajaTop) - dy);
    const bajoCabecera = px(Math.max(0, num(cabeceraBottom) - dy));
    // [142] Con la página viva viajando, al ABRIR la tira de la conversación tiene que tapar también la zona de la cabecera
    // (debajo, la página desplazada no tiene nada que enseñar ahí): empieza en la franja de la barra de estado. Al cerrar,
    // y en el modo de solo capturas, empieza bajo la cabecera (la tira bajando arrastraría un fantasma de las fichas).
    const corte = vivo && !abierto ? px(num(franjaAlto)) : bajoCabecera;
    const padDelta = px(Math.max(0, num(padCerrado) - num(padAbierto)));
    const fijas = [];
    if (num(franjaAlto) > 0 && W > 0) fijas.push({ x: 0, y: 0, w: px(W), h: px(franjaAlto), r: 0 });
    for (const f of (fichas || []).slice(0, 5)) {
        if (!(num(f?.w) > 0) || !(num(f?.h) > 0)) continue;
        fijas.push({ x: px(f.x), y: px(num(f.y) - dy), w: px(f.w), h: px(f.h), r: radioEnPx(f.r, f.w, f.h) });
    }
    const creible = H > 300 && W > 200 && caja > 60 && caja < H - 20 && corte < caja - 20 && num(padCerrado) > 0;
    return {
        tipo: 'geometria',
        activo: Boolean(creible && (!abierto || cubreCierre)),
        abierto: Boolean(abierto),
        corte,
        cajaTop: caja,
        padDelta,
        listaMax: lista ? desplazamientoDeLista({ ...lista, abierto }) : 0,
        fijas,
        vivo: Boolean(vivo),
        franja: px(num(franjaAlto)),
        veloAlto: bajoCabecera,
        velo: vivo ? colorRgb(colorFondo) : null,
        fundidoMs: num(ajustes?.fundidoMs),
        fundidoRelevoMs: num(ajustes?.fundidoRelevoMs),
        esperaMs: num(ajustes?.esperaMs),
        adelanto: num(ajustes?.adelanto) || 1,
        trasActualizar: Boolean(ajustes?.trasActualizar),
    };
}
