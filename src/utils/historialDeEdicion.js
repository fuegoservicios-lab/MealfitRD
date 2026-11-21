// [P1-PLAN-LOTE-1143 · 2026-11-21] Deshacer y rehacer en el editor de la historia (el dueño: «algo donde se le pueda
// dar para atrás y para alante a lo que hagamos»). Un paso = un estado COMPLETO de lo editable
// ({ encuadre, bloque, piezas, estilo, foto }); se apunta cuando el dedo se levanta y el estado se asienta, no en cada
// píxel del arrastre: deshacer un arrastre es UN toque. Los objetos del estado no se mutan (cada cambio crea uno nuevo),
// así que comparar por referencia campo a campo basta y restaurar un paso deja exactamente las mismas referencias.

export const PASOS_MAX = 50;

export const crearHistorial = (presente) => ({ pasado: [], presente, futuro: [] });

/** Mismos campos con las mismas referencias. */
export function mismoEstado(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of claves) if (a[k] !== b[k]) return false;
    return true;
}

/** Apunta `estado` como el paso nuevo (borra lo que se podía rehacer). Igual al presente: no hay paso. */
export function apuntar(h, estado, max = PASOS_MAX) {
    if (mismoEstado(h.presente, estado)) return h;
    return { pasado: [...h.pasado, h.presente].slice(-max), presente: estado, futuro: [] };
}

export function deshacer(h) {
    if (!h.pasado.length) return h;
    return { pasado: h.pasado.slice(0, -1), presente: h.pasado[h.pasado.length - 1], futuro: [h.presente, ...h.futuro] };
}

export function rehacer(h) {
    if (!h.futuro.length) return h;
    return { pasado: [...h.pasado, h.presente], presente: h.futuro[0], futuro: h.futuro.slice(1) };
}

export const puedeDeshacer = (h) => h.pasado.length > 0;
export const puedeRehacer = (h) => h.futuro.length > 0;

// [1143] La VISTA del editor a pantalla completa (agrandar para colocar con precisión, como CapCut): no toca la imagen,
// solo cómo se mira. `x`/`y` en px de pantalla; el centro de la pantalla nunca sale de la imagen agrandada, así se
// llega a cualquier esquina y nunca se pierde la imagen de vista.
export const VISTA_INICIAL = Object.freeze({ zoom: 1, x: 0, y: 0 });
export const VISTA_MAX = 4;
export const PASOS_DE_VISTA = [1, 1.5, 2, 3, 4];

export function acotarVista(v, ancho = 0, alto = 0) {
    const zoom = Math.min(VISTA_MAX, Math.max(1, Number(v?.zoom) || 1));
    if (zoom <= 1.001) return VISTA_INICIAL;
    const mx = (zoom * ancho) / 2;
    const my = (zoom * alto) / 2;
    const x = Math.max(-mx, Math.min(mx, Number(v?.x) || 0));
    const y = Math.max(-my, Math.min(my, Number(v?.y) || 0));
    return { zoom, x, y };
}

/** Otro zoom de vista conservando lo que se mira en el centro (el desplazamiento escala con el zoom). */
export function vistaConZoom(v, zoom, ancho = 0, alto = 0) {
    const z0 = Math.max(1, Number(v?.zoom) || 1);
    const z1 = Math.min(VISTA_MAX, Math.max(1, Number(zoom) || 1));
    return acotarVista({ zoom: z1, x: (Number(v?.x) || 0) * (z1 / z0), y: (Number(v?.y) || 0) * (z1 / z0) }, ancho, alto);
}

/** El paso siguiente (+1) o anterior (−1) de la escalera de zoom de vista. */
export function pasoDeVista(zoom, dir) {
    const z = Number(zoom) || 1;
    if (dir > 0) return PASOS_DE_VISTA.find((p) => p > z + 0.01) ?? VISTA_MAX;
    return [...PASOS_DE_VISTA].reverse().find((p) => p < z - 0.01) ?? 1;
}
