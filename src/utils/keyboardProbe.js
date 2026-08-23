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
import { safeLocalStorageGet } from './safeLocalStorage';

const CLAVE = 'mf_kb_probe_log';

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
    } catch { /* sin storage */ }
    if (!activa) return undefined;

    const caja = document.createElement('pre');
    caja.setAttribute('aria-hidden', 'true');
    Object.assign(caja.style, {
        position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: '0', zIndex: '99999',
        margin: '0', padding: '4px 6px', font: '11px/1.3 monospace', color: '#0f0',
        background: 'rgba(0,0,0,.75)', pointerEvents: 'none', whiteSpace: 'pre',
    });
    document.body.appendChild(caja);

    const modo = (() => {
        try {
            if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) return 'PWA';
        } catch { /* noop */ }
        return 'web';
    })();

    const log = [];
    const pintar = (evento) => {
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
        const fila = `${evento.padEnd(7)} H=${window.innerHeight} vv=${Math.round(vv.height)} S=${Math.round(vv.offsetTop)} ` +
            `→ kb=${m.kb} inset=${m.layoutInset} cont=${alto} caja=${fondo} ` +
            `${m.abierto ? 'ABIERTO' : 'cerrado'} kbOpen=${document.documentElement.hasAttribute('data-kb-open') ? 1 : 0}`;
        log.push(fila);
        if (log.length > 40) log.shift();
        caja.textContent = `[${modo}] sonda teclado — últimos eventos\n` + log.slice(-6).join('\n');
        try { sessionStorage.setItem(CLAVE, log.join('\n')); } catch { /* lleno */ }
    };

    const vv = window.visualViewport;
    const onResize = () => pintar('resize');
    const onScroll = () => pintar('scroll');
    const onFocus = () => pintar('focus');
    const onBlur = () => pintar('blur');
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onScroll);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    pintar('inicio');

    return () => {
        vv.removeEventListener('resize', onResize);
        vv.removeEventListener('scroll', onScroll);
        document.removeEventListener('focusin', onFocus);
        document.removeEventListener('focusout', onBlur);
        caja.remove();
    };
}
