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
// El baile imperativo está en `pages/AgentPage.jsx` (efecto del teclado). Es un modo de PRUEBA: se enciende con `/fluido`.
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from './safeLocalStorage';

export const CLAVE_COREOGRAFIA = 'mf_kb_coreografia';
/** La misma curva que ya comparten el alto del chat, el relleno de la caja y la barra de pestañas. */
export const CURVA_TECLADO = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** Relleno inferior de la caja con el teclado abierto — espejo de la regla CSS `html[data-kb-open] .input-wrapper`
 *  (1.1rem). Un test comprueba que los dos números siguen siendo el mismo. */
export const KB_PAD_ABIERTO_REM = 1.1;
/** Margen tras la animación antes del relevo: un par de fotogramas, para no cortar la cola de la curva. */
export const RELEVO_MARGEN_MS = 34;

export function coreografiaEncendida() {
    return safeLocalStorageGet(CLAVE_COREOGRAFIA, null) === '1';
}

export function alternarCoreografia() {
    if (coreografiaEncendida()) {
        safeLocalStorageRemove(CLAVE_COREOGRAFIA);
        return false;
    }
    safeLocalStorageSet(CLAVE_COREOGRAFIA, '1');
    return true;
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
