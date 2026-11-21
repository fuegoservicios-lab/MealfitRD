// [P1-PLAN-LOTE-165 · 2026-09-22] Una hoja anclada abajo (registrar comida, escáner) y el teclado del teléfono.
//
// En el iPhone el WKWebView NUNCA encoge el documento al abrirse el teclado (medido: `keyboardViewport.js`), así que
// una hoja `position: fixed` con el pie abajo queda con su botón principal DEBAJO del teclado: se escribe en el buscador
// y «Registrar» no se ve hasta cerrar el teclado. El chat ya lo compensaba; la Nevera tenía su propia copia de la cuenta
// (`Pantry.jsx`, P3-PANTRY-ADD-MOBILE). Esto es esa misma cuenta, compartida:
//   · `inset`: cuánto hay que levantar la hoja (lo que el teclado tapa y el documento NO encogió por su cuenta —
//     en Android, donde el WebView sí encoge, sale 0 y nada se levanta dos veces).
//   · `alto`: el alto visible, para que la hoja no pase de él.
// La cuenta vive en `medirTecladoDeVentana` (SSOT); aquí solo se escucha el `visualViewport` mientras la hoja está abierta.
//
// [P1-PLAN-LOTE-1148 · 2026-11-21] El dueño, con la hoja nueva de «Registrar comida»: «cada vez que quiero escribir el
// teclado no se me abre perfecto en cada cosita que abro». En la APP DEL IPHONE esta hoja seguía con la cuenta que el
// chat ya había descartado (lotes 111-129), y fallaba de tres maneras:
//   1. El parpadeo de `innerHeight` (medido en el lote 114: cae a 441 unos fotogramas y vuelve a 844 SIN evento).
//      `medirTecladoDeVentana` lo leía como «el documento ya encogió», dejaba el inset en 0 y la hoja se quedaba DEBAJO
//      del teclado hasta el siguiente evento — a veces bien, a veces mal. En iOS nativo el inset es teclado − paneo,
//      siempre (`resolverInsetNativo`), igual que en el chat.
//   2. Llegaba TARDE: el `resize` del visualViewport sale cuando el teclado ya terminó de subir, y la hoja saltaba
//      después. Ahora se anticipa al enfocar un campo (con el alto recordado del teclado, la misma memoria que usa el
//      chat) y obedece el aviso de UIKit (`mf:teclado-nativo`, sale ANTES de la animación) con su duración real.
//   3. Saltaba en seco: ahora el fondo y el panel se mueven con la curva y la duración del teclado.
// Además, con el teclado ya colocado, el campo que se escribe se trae a la vista DENTRO del cuerpo de la hoja (el
// panel encoge y el campo podía quedar fuera de lo que se ve). Web y Android no cambian.
import { useEffect, useState } from 'react';
import {
    medirTecladoDeVentana, resolverInsetNativo, decidirAvisoNativo, altoDeReferencia, KB_UMBRAL_PX,
} from '../utils/keyboardViewport';
import { CURVA_TECLADO } from '../utils/keyboardChoreography';
import { isNativeApp, nativePlatform } from '../config/platform';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';
import { EVENTO_TECLADO_NATIVO } from '../utils/keyboardProbe';

const CERRADO = { inset: 0, abierto: false, alto: null };

/** La MISMA memoria que el chat (`AgentPage.jsx`): el alto firme del teclado y lo que tarda en subir. */
export const CLAVE_INSET_NATIVO = 'mf_kb_inset_nativo';
export const CLAVE_MS_NATIVO = 'mf_kb_ms_nativo';
export const MS_TECLADO_POR_DEFECTO = 380;
/** Si el teclado anunciado no aparece (teclado físico), a este plazo vuelve a mandar la geometría. */
export const ANTICIPO_MAX_MS = 900;
const MARGEN_CAMPO_PX = 16;

const CAMPO_DE_TEXTO = 'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="range"])'
    + ':not([type="button"]):not([type="submit"]):not([type="file"]):not([type="color"])';

function esIosNativo() {
    try {
        return isNativeApp() && nativePlatform() === 'ios';
    } catch {
        return false;   // sin plataforma legible (un mock parcial en pruebas): se comporta como la web
    }
}

function esCampoDeTexto(el) {
    return Boolean(el && typeof el.matches === 'function' && el.matches(CAMPO_DE_TEXTO));
}

/**
 * Pura. Cuánto hay que desplazar el cuerpo (scrollTop) para que el campo se vea entero, con margen.
 * 0 si ya se ve. Positivo baja, negativo sube.
 */
export function desplazamientoParaVerCampo(campo, cuerpo, margen = MARGEN_CAMPO_PX) {
    if (!campo || !cuerpo) return 0;
    if (campo.bottom > cuerpo.bottom - margen) {
        const baja = campo.bottom - (cuerpo.bottom - margen);
        // un campo más alto que lo visible: que se vea su principio, no su final
        return Math.min(baja, Math.max(0, campo.top - (cuerpo.top + margen)));
    }
    if (campo.top < cuerpo.top + margen) return campo.top - (cuerpo.top + margen);
    return 0;
}

/** Pura. El estado de la hoja a partir de la geometría. En iOS nativo, sin el descuento que rompe el parpadeo. */
export function estadoDeHojaPorGeometria({ medida, vvHeight, vvOffsetTop, iosNativo }) {
    if (!medida?.abierto) return CERRADO;
    const inset = iosNativo
        ? resolverInsetNativo({ kb: medida.kb, vvOffsetTop })
        : Math.max(0, Math.round(medida.layoutInset));
    return { inset, abierto: true, alto: Math.round(vvHeight) };
}

/** Pura. Un alto de teclado anunciado (recordado o de UIKit) → estado de hoja, o null si no es creíble. */
export function estadoDeHojaAnunciado(altoTeclado, altoSinTeclado) {
    const kb = Math.round(Number(altoTeclado) || 0);
    const h = Number(altoSinTeclado) || 0;
    if (kb < KB_UMBRAL_PX || h <= 0 || kb > h * 0.7) return null;
    return { inset: kb, abierto: true, alto: Math.round(h - kb) };
}

const mismo = (a, b) => a.inset === b.inset && a.abierto === b.abierto && a.alto === b.alto;

/** [P1-PLAN-LOTE-1149] Por debajo de esto, con el teclado abierto antes y después, es ruido del paneo: espera al asiento. */
export const HISTERESIS_HOJA_PX = 24;
export const ASIENTO_MS = 350;

/** Pura. ¿Es un retoque que puede esperar al asiento (no abre ni cierra, y mueve menos que la histéresis)? */
export function cambioPequeno(antes, despues) {
    if (!antes?.abierto || !despues?.abierto) return false;
    return Math.abs((antes.inset || 0) - (despues.inset || 0)) < HISTERESIS_HOJA_PX
        && Math.abs((antes.alto || 0) - (despues.alto || 0)) < HISTERESIS_HOJA_PX;
}

/**
 * @param {boolean} activo   la hoja está abierta
 * @param {{ cuerpoRef?: { current: HTMLElement|null } }} [opciones]  el cuerpo desplazable de la hoja
 * @returns {{inset:number, abierto:boolean, alto:number|null, ms?:number}}  `ms` solo en iOS nativo (hay animación)
 */
export function useTecladoDeHoja(activo, { cuerpoRef } = {}) {
    const [estado, setEstado] = useState(CERRADO);
    const [ms, setMs] = useState(null);

    useEffect(() => {
        if (!activo) return undefined;
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!vv) return undefined;
        const ios = esIosNativo();
        let anticipadoHasta = 0;
        let plazo = null;
        let traer = null;
        // Solo se trae el campo a la vista cuando el teclado APARECE o cambia de alto — nunca en cada paneo, que
        // pelearía con el dedo del usuario desplazando la hoja.
        let visto = { abierto: false, alto: null };
        // [P1-PLAN-LOTE-1149] Lo último aplicado, sin leer el estado de React. Cada `setEstado` vuelve a pintar la hoja
        // ENTERA, e iOS emite un evento del visualViewport por fotograma mientras panea: pintar en cada uno competía
        // con la animación del teclado («no lo siento 100% en rendimiento»). Con el teclado ya puesto, los cambios
        // pequeños esperan al asiento y se aplican una sola vez.
        // centinela: la primera medición SIEMPRE se escribe (el estado de React puede venir de una apertura anterior)
        let actual = { inset: -1, abierto: null, alto: null };
        let asiento = null;
        const aplicar = (nuevo) => {
            if (mismo(actual, nuevo)) return;
            actual = nuevo;
            setEstado((prev) => (mismo(prev, nuevo) ? prev : nuevo));
        };
        const esApertura = (nuevo) => {
            const cambia = nuevo.abierto && (!visto.abierto || Math.abs((nuevo.alto || 0) - (visto.alto || 0)) >= 24);
            visto = { abierto: nuevo.abierto, alto: nuevo.alto };
            return cambia;
        };

        const traerCampoALaVista = (espera) => {
            clearTimeout(traer);
            traer = setTimeout(() => {
                const cuerpo = cuerpoRef?.current;
                const campo = typeof document !== 'undefined' ? document.activeElement : null;
                if (!cuerpo || !campo || !cuerpo.contains(campo) || !esCampoDeTexto(campo)) return;
                const d = desplazamientoParaVerCampo(campo.getBoundingClientRect(), cuerpo.getBoundingClientRect());
                // suave: un salto seco del contenido justo después de subir la hoja se sentía «brusco» [1149]
                if (Math.abs(d) >= 1) {
                    if (typeof cuerpo.scrollBy === 'function') cuerpo.scrollBy({ top: d, behavior: 'smooth' });
                    else cuerpo.scrollTop += d;
                }
            }, espera);
        };
        const msActual = () => Number(safeLocalStorageGet(CLAVE_MS_NATIVO, 0)) || MS_TECLADO_POR_DEFECTO;

        const medir = (forzar = false) => {
            const medida = medirTecladoDeVentana(window);
            // Anticipado y la geometría aún no se enteró: no deshacer la subida (el resize llega al final).
            if (!forzar && !medida.abierto && Date.now() < anticipadoHasta) return;
            if (medida.abierto) anticipadoHasta = 0;
            const nuevo = estadoDeHojaPorGeometria({ medida, vvHeight: vv.height, vvOffsetTop: vv.offsetTop, iosNativo: ios });
            if (ios && !forzar && cambioPequeno(actual, nuevo)) {
                clearTimeout(asiento);
                asiento = setTimeout(() => medir(true), ASIENTO_MS);
                return;
            }
            aplicar(nuevo);
            if (ios && nuevo.abierto && medida.kb >= KB_UMBRAL_PX
                && String(medida.kb) !== safeLocalStorageGet(CLAVE_INSET_NATIVO, null)) {
                safeLocalStorageSet(CLAVE_INSET_NATIVO, String(medida.kb));
            }
            if (esApertura(nuevo)) traerCampoALaVista(60);
        };
        const alCambiarVista = () => medir(false);

        const anticipar = (altoTeclado, duracion) => {
            const anunciado = estadoDeHojaAnunciado(altoTeclado, altoDeReferencia(window.innerHeight, window.innerWidth));
            if (!anunciado) return;
            setMs(duracion);
            anticipadoHasta = Date.now() + ANTICIPO_MAX_MS;
            clearTimeout(plazo);
            plazo = setTimeout(() => medir(true), ANTICIPO_MAX_MS);
            aplicar(anunciado);
            if (esApertura(anunciado)) traerCampoALaVista(duracion + 40);
        };
        const cerrar = (duracion) => {
            anticipadoHasta = 0;
            clearTimeout(plazo);
            setMs(duracion);
            visto = { abierto: false, alto: null };
            aplicar(CERRADO);
        };

        const alEnfocar = (e) => {
            if (!esCampoDeTexto(e.target)) return;
            if (!window.matchMedia?.('(pointer: coarse)')?.matches) return;
            const ya = medirTecladoDeVentana(window);
            if (ya.abierto) { traerCampoALaVista(60); return; }   // cambia de campo con el teclado puesto
            anticipar(Number(safeLocalStorageGet(CLAVE_INSET_NATIVO, 0)) || 0, msActual());
        };
        const alDesenfocar = (e) => {
            if (!esCampoDeTexto(e.target) || esCampoDeTexto(e.relatedTarget)) return;   // pasa a otro campo: el teclado sigue
            cerrar(msActual());
        };
        const alAvisoNativo = (e) => {
            const aviso = decidirAvisoNativo({ ...(e.detail || {}), innerHeight: altoDeReferencia(window.innerHeight, window.innerWidth) });
            if (aviso.accion === 'ignorar') return;
            if (String(aviso.ms) !== safeLocalStorageGet(CLAVE_MS_NATIVO, null)) safeLocalStorageSet(CLAVE_MS_NATIVO, String(aviso.ms));
            if (aviso.accion === 'cerrar') { cerrar(aviso.ms); return; }
            anticipar(aviso.inset, aviso.ms);
        };

        medir(true);
        vv.addEventListener('resize', alCambiarVista);
        vv.addEventListener('scroll', alCambiarVista);
        if (ios) {
            document.addEventListener('focusin', alEnfocar);
            document.addEventListener('focusout', alDesenfocar);
            window.addEventListener(EVENTO_TECLADO_NATIVO, alAvisoNativo);
        }
        return () => {
            clearTimeout(plazo);
            clearTimeout(traer);
            clearTimeout(asiento);
            vv.removeEventListener('resize', alCambiarVista);
            vv.removeEventListener('scroll', alCambiarVista);
            if (ios) {
                document.removeEventListener('focusin', alEnfocar);
                document.removeEventListener('focusout', alDesenfocar);
                window.removeEventListener(EVENTO_TECLADO_NATIVO, alAvisoNativo);
            }
        };
    }, [activo, cuerpoRef]);   // `cuerpoRef` es un ref: estable entre pintadas
    // [CI-LINT-2026-11-14] Inactivo ⇒ CERRADO derivado al pintar (antes un setState dentro del efecto). Al reactivarse,
    // `medir()` del efecto sustituye lo que quedara guardado.
    if (!activo) return CERRADO;
    // En iOS nativo siempre hay duración (la del último aviso de UIKit, o la de por defecto): la hoja también BAJA
    // animada. Fuera de iOS nativo, nada cambia.
    const msFinal = ms || (esIosNativo() ? (Number(safeLocalStorageGet(CLAVE_MS_NATIVO, 0)) || MS_TECLADO_POR_DEFECTO) : null);
    return msFinal ? { ...estado, ms: msFinal } : estado;
}

/**
 * Los estilos que la hoja aplica: el fondo levanta su contenido y el panel no pasa del alto visible.
 * Con `ms` (iOS nativo) el fondo se mueve con la curva del teclado — también al bajar — y el panel recibe la
 * duración por variable (`--hoja-kb-ms`), que su CSS usa para `max-height`: así el gesto de arrastrar la hoja
 * (`useBottomSheet`, que escribe su propio `transition` en el panel) no la pisa.
 */
export function estilosDeHojaConTeclado({ inset, abierto, alto, ms }, margen = 12) {
    if (ms) {
        const fondo = { paddingBottom: abierto ? inset : 0, transition: `padding-bottom ${ms}ms ${CURVA_TECLADO}` };
        const panel = { '--hoja-kb-ms': `${ms}ms` };
        if (abierto && alto) panel.maxHeight = Math.max(240, alto - margen);
        return { fondo, panel };
    }
    if (!abierto) return { fondo: undefined, panel: undefined };
    return {
        fondo: inset > 0 ? { paddingBottom: inset } : undefined,
        panel: alto ? { maxHeight: Math.max(240, alto - margen) } : undefined,
    };
}
