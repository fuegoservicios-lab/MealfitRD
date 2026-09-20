// [P1-PLAN-LOTE-131 · 2026-09-19] Coreografía del teclado SOLO con `transform` — las piezas puras.
//
// El dueño, con los avisos nativos ya en marcha (lote 129): «sigue igual cuando selecciono una foto, no es 100 % fluido…
// lo siento lento el teclado cuando lo abro». Lo que el chat animaba para acompañar al teclado era `height` (contenedor) y
// `padding-bottom` (caja): las dos son propiedades de LAYOUT. Cada fotograma de esos 0,4 s recalcula la conversación
// entera en el hilo principal — que al volver del selector de fotos está además decodificando y reduciendo la imagen. El
// teclado de iOS, en cambio, lo mueve el sistema: nunca pierde un fotograma. De ahí que uno vaya fino y el otro a tirones.
//
// La coreografía mueve lo mismo, pero con `transform` (lo compone la GPU, no toca el layout ni espera al hilo principal), y
// hace UN solo cambio de layout, en el extremo donde no se ve:
//   · ABRIR:  transform primero (lista y caja suben con el teclado) → al acabar, RELEVO: se quita el transform y se aplica
//             el layout final en el mismo fotograma. Si el relevo está bien calculado, en pantalla no se mueve nada.
//   · CERRAR: layout primero (el final, de golpe) + transform que lo deshace visualmente → y el transform baja a 0.
//
// Aquí vive lo que se puede probar sin navegador: cuánto hay que desplazar y cuándo la lista acompaña a la caja.
// El baile imperativo está en `pages/AgentPage.jsx` (efecto del teclado). Nació como modo de PRUEBA (lote 131, `/fluido`);
// desde el lote 138 es el modo por defecto de la app nativa y `/fluido` lo apaga.
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from './safeLocalStorage';

export const CLAVE_COREOGRAFIA = 'mf_kb_coreografia';
/** La misma curva que ya comparten el alto del chat, el relleno de la caja y la barra de pestañas. */
export const CURVA_TECLADO = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** Relleno inferior de la caja con el teclado abierto — espejo de la regla CSS `html[data-kb-open] .input-wrapper`
 *  (1.1rem). Un test comprueba que los dos números siguen siendo el mismo. */
export const KB_PAD_ABIERTO_REM = 1.1;
/** Margen tras la animación antes del relevo: un par de fotogramas, para no cortar la cola de la curva. */
export const RELEVO_MARGEN_MS = 34;

// [P1-PLAN-LOTE-138 · 2026-09-20] ENCENDIDA POR DEFECTO. El dueño, con la sonda puesta y el modo de prueba apagado: «aún
// no lo siento 100 % fluido y rápido… en la app de Gemini se siente muy pero muy fluido». Su captura MIDE el porqué:
//   · al volver del selector, el alto del chat se quedó clavado en 597 px durante 80 ms (+5015 → +5095) — justo cuando
//     el hilo principal reduce y recodifica la foto — y acabó 70 ms después que el teclado;
//   · al abrir, +185 ms después del toque el alto seguía en 844: ni un fotograma pintado.
// Animar `height` necesita al hilo principal en CADA fotograma (y el WebView lo pinta a 60 Hz; el teclado del iPhone
// del dueño, ProMotion, va a 120). Un `transform` se le entrega UNA vez al compositor y corre allí, a la cadencia de la
// pantalla, pase lo que pase en el hilo principal. `/fluido` queda como interruptor de VUELTA (guarda '0').
export function coreografiaEncendida() {
    return safeLocalStorageGet(CLAVE_COREOGRAFIA, null) !== '0';
}

export function alternarCoreografia() {
    if (coreografiaEncendida()) {
        safeLocalStorageSet(CLAVE_COREOGRAFIA, '0');
        return false;
    }
    safeLocalStorageRemove(CLAVE_COREOGRAFIA);
    return true;
}

/**
 * [P1-PLAN-LOTE-138] Al ABRIR, el chat llega un poco ANTES que el teclado. La curva del teclado de iOS es privada y la
 * web solo puede aproximarla: si el chat va por detrás, el teclado TAPA la caja de escribir (se ve como retraso); si va
 * por delante, entre los dos asoma un instante el fondo del propio chat (no se ve). Ante la duda, por delante. Al
 * CERRAR es al revés —bajar antes que el teclado mete la caja detrás de él—, así que el cierre usa la duración entera.
 */
export const COREO_ADELANTO = 0.85;
export const COREO_MS_MIN = 140;
export function duracionDeApertura(msTeclado = 0) {
    const ms = Number(msTeclado) || 0;
    if (ms <= 0) return 0;
    return Math.max(COREO_MS_MIN, Math.round(ms * COREO_ADELANTO));
}

/**
 * [P1-PLAN-LOTE-138] Qué alto usar cuando UIKit anuncia que el teclado sube. MEDIDO al volver del selector de fotos:
 *     N+308·383 → N-0·0 → N+335·400      (tres avisos en 124 ms; el alto firme es 335)
 * El 308 es un teclado de paso (sin la barra de sugerencias). Obedecerlo y corregir 124 ms después RE-APUNTA una
 * animación que ya está en el compositor: la nueva arranca desde donde el hilo principal CREE que va la vieja, y si
 * entre medias hubo un atasco (los 80 ms medidos) la caja retrocede un tramo y vuelve a subir. Una apertura, UNA animación:
 *   · cerrado → si el anuncio se parece al alto firme recordado, vale el recordado;
 *   · apertura en vuelo → un anuncio parecido al destino NO re-apunta (la medición de asiento ajusta lo que falte);
 *   · abierto y quieto (cambio al teclado de emojis) → manda el anuncio.
 */
export const KB_ANUNCIO_PARECIDO_PX = 60;
export function insetDeApertura({ anunciado = 0, recordado = 0, vigente = 0, abierto = false, enApertura = false } = {}) {
    const a = Math.max(0, Math.round(Number(anunciado) || 0));
    const parecido = (b) => Number(b) > 0 && Math.abs(a - Number(b)) <= KB_ANUNCIO_PARECIDO_PX;
    if (abierto && enApertura) return parecido(vigente) ? Math.round(Number(vigente)) : a;
    if (!abierto && parecido(recordado)) return Math.round(Number(recordado));
    return a;
}

/**
 * Cuántos px suben la caja y la lista al abrirse el teclado. NO es el alto del teclado: con él abierto la caja suelta la
 * reserva de la barra de pestañas (su relleno inferior pasa de `padCerrado` a `padAbierto`), así que lo que de verdad
 * viaja el contenido es el teclado MENOS esa reserva que desaparece.
 */
export function recorridoDelTeclado({ inset = 0, padCerrado = 0, padAbierto = 0 } = {}) {
    const reserva = Math.max(0, (Number(padCerrado) || 0) - (Number(padAbierto) || 0));
    return Math.max(0, Math.round((Number(inset) || 0) - reserva));
}

/**
 * ¿La lista acompaña a la caja? Solo si está PEGADA al final: entonces encoger su ventana por abajo se ve igual que
 * subir su contenido, y el relevo no mueve nada. Si el usuario está leyendo más arriba, el contenido NO se mueve al
 * encoger la ventana (solo pierde lo de abajo): ahí sube la caja sola. Una lista que no llena su ventana tampoco se mueve,
 * y la virtualizada (`overflow: hidden`, la desplaza Virtuoso) queda fuera: no se le puede leer el final con fiabilidad.
 */
export function listaAcompana({ scrollHeight = 0, scrollTop = 0, clientHeight = 0, overflowY = 'auto', vaAlFinal = false } = {}) {
    if (overflowY === 'hidden') return false;
    if (scrollHeight <= clientHeight + 1) return false;
    return vaAlFinal || scrollHeight - scrollTop - clientHeight <= 4;
}
