/**
 * [P1-MACRO-BARS-SEMAFORO · 2026-11-27] El estado de una macro en las IMÁGENES para compartir (tarjeta e historia del
 * día): la misma regla que las barras de la app — gris en curso, verde cumplida, rojo pasada —, en tinta fija porque
 * es un PNG/JPEG con su propio fondo (no interfaz: el tema no le aplica).
 *
 * Una imagen compartida no sabe si el día ya cerró, así que por debajo de la meta NO se pinta en rojo: queda en gris.
 */
import { getMacroGoalState } from './macroGoalStatus';

export const TONO_IMAGEN = Object.freeze({
    progress: ['rgb(226, 232, 240)', 'rgb(148, 163, 184)'],
    done: ['rgb(110, 231, 183)', 'rgb(16, 185, 129)'],
    over: ['rgb(252, 165, 165)', 'rgb(220, 38, 38)'],
});

/** `mc` = { clave, valor, meta }: calorías con banda 90–110 %, macros con la regla de `getMacroGoalState`. */
export function estadoDeMacroCompartida(mc) {
    const valor = Number(mc?.valor) || 0;
    const meta = Number(mc?.meta) || 0;
    if (!(meta > 0) || !(valor > 0)) return 'progress';
    if (mc?.clave === 'calories') {
        const r = valor / meta;
        if (r > 1.1) return 'over';
        return r >= 0.9 ? 'done' : 'progress';
    }
    return getMacroGoalState(valor, meta);
}

export const tonoDeMacroCompartida = (mc) => TONO_IMAGEN[estadoDeMacroCompartida(mc)];
