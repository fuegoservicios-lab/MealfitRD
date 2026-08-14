/**
 * [P2-LANDING-COPY-TRUTH · 2026-08-14] La urgencia comercial tiene que caducar sola.
 *
 * `LAUNCH_OFFER.active` era un booleano a mano y `deadlineLabel` una cadena SIN
 * AÑO («15 de septiembre»): no había ni un `Date`, ni una comparación, ni un
 * test. Pasado el día, las tres tarjetas seguirían anunciando una subida ya
 * ocurrida — que es el dark pattern contra el que advierte el comentario del
 * propio knob, dependiendo de que alguien se acordara.
 *
 * ⚠️ EL CASO QUE DA VALOR A ESTE FICHERO es el de la zona horaria.
 * `new Date('2026-09-15')` se interpreta como medianoche UTC, que en República
 * Dominicana (UTC−4) son las **20:00 del día 14**. Una implementación ingenua
 * mata la oferta a media tarde de la víspera, y eso es invisible en cualquier
 * revisión de código: sólo se ve escribiendo el caso.
 */
import { describe, it, expect } from 'vitest';
import { isLaunchOfferActive, LAUNCH_OFFER } from '../config/plans';

/** Un instante concreto expresado en hora de RD (UTC−4). */
const enRD = (iso) => new Date(`${iso}-04:00`);

describe('[P2-LANDING-COPY-TRUTH] caducidad de la oferta de lanzamiento', () => {
    it('sigue viva bien dentro del plazo', () => {
        expect(isLaunchOfferActive(enRD('2026-08-14T10:00:00'))).toBe(true);
    });

    it('sigue viva la MAÑANA del último día', () => {
        expect(isLaunchOfferActive(enRD('2026-09-15T09:00:00'))).toBe(true);
    });

    it('sigue viva a las 20:01 del día ANTERIOR — el caso que mata a UTC', () => {
        // Justo después de la medianoche UTC del día 15. Una comparación contra
        // `Date.parse('2026-09-15')` daría la oferta por vencida aquí, con el
        // usuario dominicano cenando y la promesa todavía en pie.
        expect(isLaunchOfferActive(enRD('2026-09-14T20:01:00'))).toBe(true);
    });

    it('sigue viva a las 23:59 del último día', () => {
        expect(isLaunchOfferActive(enRD('2026-09-15T23:59:00'))).toBe(true);
    });

    it('ha vencido en cuanto empieza el día siguiente en RD', () => {
        expect(isLaunchOfferActive(enRD('2026-09-16T00:01:00'))).toBe(false);
    });

    it('ha vencido semanas después', () => {
        expect(isLaunchOfferActive(enRD('2026-10-01T12:00:00'))).toBe(false);
    });

    it('el interruptor manual sigue mandando dentro del plazo', () => {
        // Apagar antes de tiempo tiene que seguir siendo posible: la fecha es un
        // techo automático, no un sustituto del control del dueño.
        const original = LAUNCH_OFFER.active;
        try {
            LAUNCH_OFFER.active = false;
            expect(isLaunchOfferActive(enRD('2026-08-14T10:00:00'))).toBe(false);
        } finally {
            LAUNCH_OFFER.active = original;
        }
    });

    it('una fecha ilegible NO anuncia urgencia', () => {
        // Fail-safe: ante la duda, no prometer una subida. Lo contrario sería
        // anunciar un plazo que nadie puede verificar.
        const original = LAUNCH_OFFER.deadlineISO;
        try {
            LAUNCH_OFFER.deadlineISO = 'cuando sea';
            expect(isLaunchOfferActive(enRD('2026-08-14T10:00:00'))).toBe(false);
        } finally {
            LAUNCH_OFFER.deadlineISO = original;
        }
    });

    it('la etiqueta que se muestra y la fecha real hablan del mismo día', () => {
        // Si alguien mueve `deadlineISO` y olvida el rótulo, la página anunciaría
        // una fecha y caducaría en otra.
        const dia = Number(LAUNCH_OFFER.deadlineISO.slice(8, 10));
        expect(LAUNCH_OFFER.deadlineLabel).toContain(String(dia));
        expect(LAUNCH_OFFER.deadlineShort).toContain(String(dia));
    });
});
