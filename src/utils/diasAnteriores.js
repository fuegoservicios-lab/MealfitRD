// [P1-PLAN-LOTE-162 · 2026-09-22] «Ver mis días anteriores» desde el Historial vacío del modo contador.
//
// El cajón de días anteriores vive DENTRO de la tarjeta de progreso del dashboard (`TrackingProgress`), no en una
// ruta propia. Para abrirlo desde otra pantalla se deja una marca con fecha y se navega; la tarjeta la consume al
// montarse. Con fecha y caducidad corta a propósito: una marca vieja (la persona se fue a otra pestaña) no puede
// abrir el cajón horas después por sorpresa. Sin estado del router: la tarjeta se monta también en pruebas y en
// sitios sin `Router`, y `useLocation` la ataría a uno.
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from './safeLocalStorage';

const CLAVE = 'mealfit_abrir_dias_anteriores';
const VIGENCIA_MS = 15_000;

export function pedirAbrirDiasAnteriores(ahora = Date.now()) {
    safeLocalStorageSet(CLAVE, String(ahora));
}

/** ¿Hay que abrir el cajón? Consume la marca (una sola vez) y solo responde que sí si es reciente. */
export function consumirAbrirDiasAnteriores(ahora = Date.now()) {
    const marca = Number(safeLocalStorageGet(CLAVE, null));
    safeLocalStorageRemove(CLAVE);
    return Number.isFinite(marca) && marca > 0 && ahora - marca >= 0 && ahora - marca <= VIGENCIA_MS;
}
