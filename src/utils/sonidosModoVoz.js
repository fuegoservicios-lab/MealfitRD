import { DURACION_ABRIR_MS, sonarAperturaVoz, sonarCierreVoz } from './sonidosDeVoz';

/** Both voice transports own their lifecycle, including automatic closure. */
export const DURACION_SONIDO_VOZ_MS = DURACION_ABRIR_MS;
export function sonarModoVoz(tipo) {
    return tipo === 'abrir' ? sonarAperturaVoz() : sonarCierreVoz();
}
