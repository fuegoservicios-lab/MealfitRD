/* [P1-HIST-DAY-IDENTITY · 2026-08-13] El modal del Historial decía que HOY
 * jueves tocaba el menú de AYER miércoles.
 *
 * Dos causas apiladas, y la de código es la que este guard fija:
 *
 *  1. DATO: `_archived_days` del plan activo traía el martes 11 DUPLICADO con
 *     dos menús distintos — residuo de las dos generaciones del incidente del
 *     8 de agosto (P1-CHUNK-REBASE-PAUSED). 9 archivados + 2 vivos = 11 días
 *     donde debían ser 10. (Reparado por SQL aparte.)
 *  2. CÓDIGO: el modal etiquetaba los días por ÍNDICE (inicio + posición), no
 *     por la fecha ESTAMPADA en cada día. Con un duplicado en medio, todo lo
 *     posterior se corre +1: la posición 9 (miércoles 12, «Batido Espeso…»)
 *     salía rotulada «Jueves», y el viernes salía «Sábado». El Dashboard ancla
 *     por fecha real y por eso no mentía.
 *
 * El contrato nuevo: la IDENTIDAD de un día es su fecha, no su posición.
 *  - `_fullHistoryDays` dedupa por fecha (la ÚLTIMA versión gana: es la
 *    generación más reciente, y si la misma fecha vive en archivo Y en vivos,
 *    gana la viva — los vivos van después en la concatenación).
 *  - Las etiquetas leen `day.date` cuando existe; el índice queda como
 *    fallback para planes legacy sin fechas estampadas.
 */
import { describe, it, expect } from 'vitest';
import { _fullHistoryDays, _dayNameForDay } from '../pages/History.jsx';
import { parseStartLocal } from '../utils/chunkWindow';

const dia = (date, nombre) => ({ date, meals: [{ name: nombre }] });

describe('[P1-HIST-DAY-IDENTITY] _fullHistoryDays dedupa por fecha', () => {
    it('una fecha duplicada en el archivo queda UNA vez, con la versión más reciente', () => {
        const out = _fullHistoryDays({
            _archived_days: [
                dia('2026-08-10', 'lunes v1'),
                dia('2026-08-11', 'martes GENERACIÓN VIEJA'),
                dia('2026-08-11', 'martes GENERACIÓN NUEVA'),
                dia('2026-08-12', 'miércoles v1'),
            ],
            days: [dia('2026-08-13', 'jueves vivo')],
        });
        expect(out.map((d) => d.date)).toEqual(
            ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'],
        );
        expect(out[1].meals[0].name).toBe('martes GENERACIÓN NUEVA');
    });

    it('si la misma fecha vive en archivo Y en vivos, gana la viva', () => {
        // El caso del dueño en versión extrema: el shift archiva un día que una
        // generación posterior reescribió. Lo que el Dashboard muestra (vivo)
        // es lo que el Historial debe mostrar para esa fecha.
        const out = _fullHistoryDays({
            _archived_days: [dia('2026-08-13', 'jueves ARCHIVADO VIEJO')],
            days: [dia('2026-08-13', 'jueves VIVO')],
        });
        expect(out).toHaveLength(1);
        expect(out[0].meals[0].name).toBe('jueves VIVO');
    });

    it('los días legacy SIN fecha sobreviven al dedup (no hay clave que los colisione)', () => {
        const out = _fullHistoryDays({
            _archived_days: [dia(undefined, 'legacy 1'), dia(undefined, 'legacy 2')],
            days: [dia('2026-08-13', 'jueves')],
        });
        expect(out).toHaveLength(3);
        expect(out.map((d) => d.meals[0].name)).toEqual(['legacy 1', 'legacy 2', 'jueves']);
    });

    it('sin duplicados, el timeline queda idéntico (no reordena ni pierde)', () => {
        const entrada = {
            _archived_days: [dia('2026-08-11', 'a'), dia('2026-08-12', 'b')],
            days: [dia('2026-08-13', 'c'), dia('2026-08-14', 'd')],
        };
        expect(_fullHistoryDays(entrada).map((d) => d.meals[0].name))
            .toEqual(['a', 'b', 'c', 'd']);
    });
});

describe('[P1-HIST-DAY-IDENTITY] la etiqueta sale de la fecha del día, no del índice', () => {
    const inicio = parseStartLocal('2026-08-05'); // miércoles

    it('con fecha estampada, la etiqueta es SU día de la semana aunque el índice mienta', () => {
        // El bug real: posición 9 con fecha 2026-08-12 (miércoles). Por índice
        // saldría inicio+9 = viernes 14... y con el timeline corrido salía
        // «Jueves». Por fecha sale lo que ES.
        expect(_dayNameForDay(dia('2026-08-12', 'x'), inicio, 9)).toBe('Miércoles');
        expect(_dayNameForDay(dia('2026-08-13', 'x'), inicio, 9)).toBe('Jueves');
    });

    it('sin fecha estampada (legacy), cae al índice como antes', () => {
        expect(_dayNameForDay(dia(undefined, 'x'), inicio, 1)).toBe('Jueves'); // 5 ago + 1
        expect(_dayNameForDay(null, inicio, 2)).toBe('Viernes');
    });

    it('una fecha ilegible no revienta: cae al índice', () => {
        expect(_dayNameForDay(dia('no-es-fecha', 'x'), inicio, 0)).toBe('Miércoles');
    });
});
