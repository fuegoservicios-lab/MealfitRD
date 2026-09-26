/**
 * [P1-KB-SONDA · 2026-08-23] Sonda del teclado virtual, SOLO en desarrollo.
 *
 * Por qué existe: el dueño ve el teclado «a veces bien, a veces mal» en su iPhone, y
 * desde un PC nada reproduce el teclado de iOS. Las dos hipótesis vivas —que iOS panee
 * ANTES de encoger el visual viewport, o que en la PWA de pantalla de inicio
 * `innerHeight` encoja JUNTO con el teclado y la fórmula `H − vv.height` dé cero—
 * dan capturas idénticas y sólo se distinguen con NÚMEROS del dispositivo.
 *
 * Qué hace: pinta, encima de todo, los cuatro valores que decide la aritmética
 * (`innerHeight`, `vv.height`, `vv.offsetTop`, y lo que el SSOT concluye) en cada evento
 * del visual viewport, y guarda los últimos 40 en `sessionStorage` para copiarlos.
 *
 * Cómo se enciende: `?kbprobe=1` en la URL (o `localStorage.mfKbProbe = '1'`). Fuera de
 * `import.meta.env.DEV` este módulo NO hace nada: no hay sonda en producción.
 */
import { medirTecladoDeVentana } from './keyboardViewport';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './safeLocalStorage';
import { isNativeApp } from '../config/platform';

const CLAVE = 'mf_kb_probe_log';
// [P1-PLAN-LOTE-112 · 2026-09-19] La sonda en la APP NATIVA. Allí no hay barra de direcciones donde teclear
// `?kbprobe`, y el primer arreglo del «delay al abrir el teclado» (lote 111) se decidió sin números: el dueño
// respondió «sigue igual». El interruptor nativo es escribir `/sonda` en el chat y enviarlo (AgentPage lo intercepta:
// no llega al servidor). Es explícito —nadie se la encuentra puesta— y persiste hasta el siguiente `/sonda`, porque
// lo que hay que medir incluye el arranque en frío. En la WEB la regla de arriba no cambia: solo `?kbprobe`.
export const CLAVE_SONDA_NATIVA = 'mf_kb_sonda_nativa';
let _pararSonda = null;

/** `/sonda` en el chat de la app nativa: enciende o apaga. Devuelve el estado nuevo. */
export function alternarSondaTecladoNativa() {
    if (!isNativeApp()) return false;
    if (_pararSonda) {
        _pararSonda();
        _pararSonda = null;
        safeLocalStorageRemove(CLAVE_SONDA_NATIVA);
        return false;
    }
    safeLocalStorageSet(CLAVE_SONDA_NATIVA, '1');
    iniciarSondaTeclado();
    return Boolean(_pararSonda);
}

/** [P1-PLAN-LOTE-127] Deja una marca con nombre en la sonda (si está encendida; si no, no cuesta nada). Para que
 *  una captura diga QUÉ hizo la app entre dos movimientos del teclado — p. ej. el dictado: `micKB`, `micON`, `kbRepon`. */
export const EVENTO_MARCA_SONDA = 'mf:sonda-teclado';

/** [P1-PLAN-LOTE-336] Devuelve el hueco (ms) entre dos fotogramas cuando supera `umbral`; si no, null. */
export function detectorDePausas(umbral = 50) {
    let anterior = null;
    return (t) => {
        const hueco = anterior === null ? 0 : t - anterior;
        anterior = t;
        return hueco > umbral ? Math.round(hueco) : null;
    };
}
/** Lo emite el binario nativo (SceneDelegate.swift) al recibir keyboardWillShow/Hide: `{ tipo, alto, ms }`. */
export const EVENTO_TECLADO_NATIVO = 'mf:teclado-nativo';
export function marcarSondaTeclado(nombre) {
    if (!_pararSonda || typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent(EVENTO_MARCA_SONDA, { detail: String(nombre || '').slice(0, 7) }));
}

export function iniciarSondaTeclado() {
    // [P1-KB-SONDA-EN-PRODUCCION · 2026-08-23] La sonda pasa a funcionar TAMBIEN en
    // produccion, y solo con `?kbprobe=1` EXPLICITO en la URL. Razon: el teclado de iOS
    // no se reproduce desde un escritorio, y llevo cuatro arreglos sobre el mismo
    // sintoma («al cerrar va lento») decididos por hipotesis. Sin numeros del
    // dispositivo, el quinto seria otra hipotesis.
    //
    // En produccion NO basta `localStorage`: eso dejaria la sonda encendida para quien
    // se la encontrara puesta. Solo el parametro, que hay que teclear a proposito y
    // desaparece al navegar. Cero coste para todos los demas: sin el, este modulo
    // retorna antes de crear nada.
    if (typeof window === 'undefined' || !window.visualViewport) return undefined;
    let activa = false;
    try {
        const pedida = new URLSearchParams(location.search).has('kbprobe');
        activa = import.meta.env.DEV
            ? (pedida || safeLocalStorageGet('mfKbProbe') === '1')
            : pedida;
        if (!activa && isNativeApp()) activa = safeLocalStorageGet(CLAVE_SONDA_NATIVA) === '1';
    } catch { /* sin storage */ }
    if (!activa) return undefined;
    if (_pararSonda) return _pararSonda;

    const caja = document.createElement('pre');
    caja.setAttribute('aria-hidden', 'true');
    Object.assign(caja.style, {
        position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: '0', zIndex: '99999',
        margin: '0', padding: '4px 6px', font: '9.5px/1.25 monospace', color: '#0f0', maxWidth: '100vw',
        background: 'rgba(0,0,0,.8)', pointerEvents: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    });
    document.body.appendChild(caja);

    const modo = (() => {
        if (isNativeApp()) return 'nativa';
        try {
            if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) return 'PWA';
        } catch { /* noop */ }
        return 'web';
    })();

    const log = [];
    // [P1-PLAN-LOTE-112] TIEMPOS. Un retraso se mide en milisegundos, y la sonda no los llevaba: `+ms` cuenta desde
    // el último toque dentro de la caja de escribir (o desde el foco si no hubo toque). La cabecera dice qué paquete
    // OTA corre de verdad y qué inset tiene recordado la apertura anticipada — las dos dudas del «sigue igual».
    let t0 = performance.now();
    const paquete = (() => { try { return typeof __OTA_BUNDLE_ID__ === 'string' && __OTA_BUNDLE_ID__ ? __OTA_BUNDLE_ID__ : 'web'; } catch { return '?'; } })();
    const pintar = (evento) => {
        if (evento === 'toque') t0 = performance.now();
        const ms = Math.round(performance.now() - t0);
        const vv = window.visualViewport;
        const m = medirTecladoDeVentana(window);
        // [P1-KB-SONDA-EN-PRODUCCION · 2026-08-23] `cont` es el alto REAL que el navegador
        // le está dando al contenedor del chat, y `caja` el borde inferior de la caja de
        // escribir. Son los dos números que faltaban: si al cerrar el teclado `H` ya volvió
        // a su valor y `cont` sigue con el alto reducido, quien llega tarde es `100dvh`
        // (Safari resolviéndolo al final de la animación) y no nuestro JS. Sin esa
        // distinción, cualquier arreglo del retraso es una apuesta.
        const _cont = document.querySelector('.agent-container');
        const _caja = document.querySelector('.input-wrapper');
        const alto = _cont ? Math.round(_cont.getBoundingClientRect().height) : -1;
        const fondo = _caja ? Math.round(_caja.getBoundingClientRect().bottom) : -1;
        const varInset = _cont ? (_cont.style.getPropertyValue('--kb-inset') || '-') : '-';
        // [P1-PLAN-LOTE-114] Compacta: la primera captura del dueño cortaba cada fila por la derecha y se perdían
        // `caja` y `kbOpen`. `sy` = scroll del documento y `top` = borde superior del contenedor: lo que faltaba
        // para explicar la captura con la página desplazada hacia arriba.
        const tope = _cont ? Math.round(_cont.getBoundingClientRect().top) : -1;
        const fila = `+${String(ms).padStart(4)} ${evento.padEnd(7)} H=${window.innerHeight} vv=${Math.round(vv.height)} S=${Math.round(vv.offsetTop)} sy=${Math.round(window.scrollY)} ` +
            `kb=${m.kb} var=${varInset} top=${tope} cont=${alto} caja=${fondo} ` +
            `${m.abierto ? 'AB' : 'ce'}${document.documentElement.hasAttribute('data-kb-open') ? 1 : 0}`;
        log.push(fila);
        // [P1-PLAN-LOTE-336] tras un toque, un foco o un aviso del teclado: 0,7 s de traza por fotograma
        if (/^(toque|focus|blur|N)/.test(evento)) { trazaHasta = performance.now() + 700; previo = ''; }
        repintar();
    };
    let trazaHasta = 0;
    let previo = '';
    const repintar = () => {
        while (log.length > 60) log.shift();
        const recordado = safeLocalStorageGet('mf_kb_inset_nativo', '-');
        // 24 filas: la traza por fotograma ocupa más que los eventos (la captura del dueño cabe entera)
        caja.textContent = `[${modo}] paquete ${paquete} · inset recordado ${recordado}\n` + log.slice(-24).join('\n');
        try { sessionStorage.setItem(CLAVE, log.join('\n')); } catch { /* lleno */ }
    };

    const vv = window.visualViewport;
    const onResize = () => pintar('resize');
    const onScroll = () => pintar('scroll');
    const onFocus = () => pintar('focus');
    const onBlur = () => pintar('blur');
    const onToque = (e) => { if (e.target?.closest?.('.input-wrapper')) pintar('toque'); };
    const onFinAlto = (e) => { if (e.propertyName === 'height' && e.target?.classList?.contains('agent-container')) pintar('altoFin'); };
    const onMarca = (e) => pintar(e.detail || 'marca');
    // [P1-PLAN-LOTE-128] El binario nuevo retransmite `keyboardWillShow/Hide` de UIKit (SceneDelegate.swift): llegan
    // ANTES de la animación, con el alto y la duración reales. La sonda los apunta (`N+336·250` = abre, 336 px, 250 ms;
    // `N-…` = cierra) para MEDIR cuánto se adelanta o se atrasa hoy el chat respecto al teclado de verdad.
    const onNativo = (e) => {
        const d = e.detail || {};
        pintar(`N${d.tipo === 'cierra' ? '-' : '+'}${Number(d.alto) || 0}·${Number(d.ms) || 0}`);
    };
    window.addEventListener(EVENTO_TECLADO_NATIVO, onNativo);
    document.addEventListener(EVENTO_MARCA_SONDA, onMarca);
    document.addEventListener('pointerdown', onToque, true);
    document.addEventListener('transitionend', onFinAlto, true);
    const onVentana = () => pintar('ventana');
    window.addEventListener('resize', onVentana);
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onScroll);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    pintar('inicio');

    // [P1-PLAN-LOTE-336] Pausas del hilo principal: un hueco entre fotogramas > 50 ms es una animación que se atasca.
    // La fila NO lee el layout (una lectura forzada podría fabricar la pausa que mide).
    const huboPausa = detectorDePausas(50);
    let rafId = 0;
    const alFotograma = (t) => {
        const hueco = huboPausa(t);
        const ahora = performance.now();
        let cambio = false;
        if (hueco !== null) {
            log.push(`+${String(Math.round(ahora - t0)).padStart(4)} pausa   ${hueco}ms`);
            cambio = true;
        }
        // [P1-PLAN-LOTE-336] ¿QUIÉN mueve la página? El video del dueño enseña fotogramas con la página desplazada al
        // abrir y al cerrar; aquí, fotograma a fotograma: S = paneo del visual viewport (iOS), sy = scroll del
        // documento, top = borde del contenedor del chat, caja = borde inferior de la caja. Solo cuando cambia.
        if (ahora < trazaHasta) {
            const _cont = document.querySelector('.agent-container');
            const _caja = document.querySelector('.input-wrapper');
            const v = window.visualViewport;
            const estado = `S${Math.round(v?.offsetTop || 0)} sy${Math.round(window.scrollY)} ` +
                `top${_cont ? Math.round(_cont.getBoundingClientRect().top) : -1} caja${_caja ? Math.round(_caja.getBoundingClientRect().bottom) : -1}`;
            if (estado !== previo) {
                previo = estado;
                log.push(`+${String(Math.round(ahora - t0)).padStart(4)} f ${estado}`);
                cambio = true;
            }
        }
        if (cambio) repintar();
        rafId = requestAnimationFrame(alFotograma);
    };
    rafId = requestAnimationFrame(alFotograma);

    _pararSonda = () => {
        cancelAnimationFrame(rafId);
        vv.removeEventListener('resize', onResize);
        vv.removeEventListener('scroll', onScroll);
        document.removeEventListener('focusin', onFocus);
        document.removeEventListener('focusout', onBlur);
        window.removeEventListener('resize', onVentana);
        document.removeEventListener(EVENTO_MARCA_SONDA, onMarca);
        window.removeEventListener(EVENTO_TECLADO_NATIVO, onNativo);
        document.removeEventListener('pointerdown', onToque, true);
        document.removeEventListener('transitionend', onFinAlto, true);
        caja.remove();
        _pararSonda = null;
    };
    return _pararSonda;
}
