// [P1-FIX-DAY-ONLY-IF-SODIUM · 2026-08-05] "Arreglar este día" solo cuando arregla algo.
//
// Reporte del dueño, en vivo: «le doy a arreglar día y no pasa nada». El aviso era
// por un techo de AZÚCARES AÑADIDOS y el endpoint detrás del botón solo sabe arreglar
// SODIO — devolvía `ceiling_not_sodium` y el único resultado del clic era un mensaje
// diciendo que el botón no aplicaba. El dato para saberlo de antemano ya llegaba al
// cliente (`_quality_degraded_panel_detail = "día 1: free_sugars_g"`, leído de
// producción); nadie lo miraba.
//
// Se prueba la DECISIÓN, no el texto del gate: un test parser-based sobre Dashboard.jsx
// habría pasado en verde con el arreglo borrado — pasó tres veces en esta misma sesión.

import { describe, it, expect } from 'vitest';
import { fixDayCtaApplies } from '../utils/fixDayCta';

const conTecho = (detalle) => ({
    _quality_degraded: true,
    _quality_degraded_reason: 'micro_worst_day_ceiling',
    _quality_degraded_panel_detail: detalle,
});

describe('[P1-FIX-DAY-ONLY-IF-SODIUM] fixDayCtaApplies', () => {
    it('sodio: el boton aparece, porque el endpoint SI sabe arreglarlo', () => {
        expect(fixDayCtaApplies(conTecho('día 1: sodium_mg'))).toBe(true);
        expect(fixDayCtaApplies(conTecho('día 3: sodium_mg'))).toBe(true);
    });

    it('el caso REAL del reporte: azucar anadida NO muestra el boton', () => {
        // Payload literal medido en produccion el 2026-08-05.
        expect(fixDayCtaApplies(conTecho('día 1: free_sugars_g'))).toBe(false);
    });

    it('los otros dos techos del mismo motivo tampoco', () => {
        expect(fixDayCtaApplies(conTecho('día 2: saturated_fat_g'))).toBe(false);
        expect(fixDayCtaApplies(conTecho('día 4: potassium_mg'))).toBe(false);
    });

    it('varios techos a la vez: si sodio esta entre ellos, el arreglo sirve', () => {
        // `worst_day.high` es una LISTA. Con sodio dentro el swap sodio-consciente
        // sigue siendo util aunque ademas se pase de azucar.
        expect(fixDayCtaApplies(conTecho('día 1: sodium_mg,free_sugars_g'))).toBe(true);
        expect(fixDayCtaApplies(conTecho('día 1: free_sugars_g,sodium_mg'))).toBe(true);
    });

    it('otras razones de aviso nunca muestran este boton', () => {
        expect(fixDayCtaApplies({
            _quality_degraded_reason: 'high_sodium_sugar',
            _quality_degraded_panel_detail: 'sodium_mg',
        })).toBe(false);
        expect(fixDayCtaApplies({
            _quality_degraded_reason: 'vitamin_k_inconsistent',
            _quality_degraded_panel_detail: 'vitamin_k',
        })).toBe(false);
    });

    it('sin detalle o con shape rara: no se muestra', () => {
        // No poder confirmar que es sodio NO es lo mismo que confirmar que lo es.
        // El banner ya explica como arreglarlo a mano, y esa via siempre funciona.
        expect(fixDayCtaApplies(conTecho(undefined))).toBe(false);
        expect(fixDayCtaApplies(conTecho(''))).toBe(false);
        expect(fixDayCtaApplies(conTecho('día 1: '))).toBe(false);
        expect(fixDayCtaApplies(conTecho(null))).toBe(false);
        expect(fixDayCtaApplies(conTecho(['sodium_mg']))).toBe(false);
        expect(fixDayCtaApplies(null)).toBe(false);
        expect(fixDayCtaApplies(undefined)).toBe(false);
        expect(fixDayCtaApplies({})).toBe(false);
    });
});
