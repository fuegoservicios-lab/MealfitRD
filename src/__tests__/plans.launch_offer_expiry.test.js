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

// [P2-I18N-CI-HERMANOS-ROJO-PERMANENTE · 2026-08-22] El huso se INYECTA también aquí.
//
// Estos casos construyen el instante en hora de RD, pero `isLaunchOfferActive` sigue —desde
// `P3-LAUNCH-OFFER-LOCAL-DAY`— el día LOCAL DEL USUARIO, y sin segundo argumento lo lee del
// reloj del PROCESO. O sea que «23:59 del último día en RD» sólo daba `true` en una máquina
// puesta en RD: en un runner en UTC ese instante ya es el día 16 y la oferta está vencida.
//
// El CI del repo hermano llevaba en rojo por exactamente esto (medido con `gh run view`, no
// deducido). La mitad de abajo de este mismo fichero ya inyecta el huso y su comentario dice
// la lección entera: «un caso cuyo resultado depende de dónde corra no es una defensa, es un
// intermitente». La mitad de arriba es anterior y nunca la aprendió.
//
// No se pone `TZ` global en la config de vitest: eso cambiaría el huso de las 294 suites
// para arreglar una, y el resto empezaría a mentir en la dirección contraria.
const RD_OFFSET = 240; // UTC−4, convención `getTimezoneOffset` (POSITIVO = oeste)

describe('[P2-LANDING-COPY-TRUTH] caducidad de la oferta de lanzamiento', () => {
    it('sigue viva bien dentro del plazo', () => {
        expect(isLaunchOfferActive(enRD('2026-08-14T10:00:00'), RD_OFFSET)).toBe(true);
    });

    it('sigue viva la MAÑANA del último día', () => {
        expect(isLaunchOfferActive(enRD('2026-09-15T09:00:00'), RD_OFFSET)).toBe(true);
    });

    it('sigue viva a las 20:01 del día ANTERIOR — el caso que mata a UTC', () => {
        // Justo después de la medianoche UTC del día 15. Una comparación contra
        // `Date.parse('2026-09-15')` daría la oferta por vencida aquí, con el
        // usuario dominicano cenando y la promesa todavía en pie.
        expect(isLaunchOfferActive(enRD('2026-09-14T20:01:00'), RD_OFFSET)).toBe(true);
    });

    it('sigue viva a las 23:59 del último día', () => {
        expect(isLaunchOfferActive(enRD('2026-09-15T23:59:00'), RD_OFFSET)).toBe(true);
    });

    it('ha vencido en cuanto empieza el día siguiente en RD', () => {
        expect(isLaunchOfferActive(enRD('2026-09-16T00:01:00'), RD_OFFSET)).toBe(false);
    });

    it('ha vencido semanas después', () => {
        expect(isLaunchOfferActive(enRD('2026-10-01T12:00:00'), RD_OFFSET)).toBe(false);
    });

    // ── [P3-LAUNCH-OFFER-LOCAL-DAY · 2026-08-22] El día es el DEL USUARIO ──────────────────
    //
    // La caducidad estaba anclada a las 23:59:59 de RD para todo el mundo, y eso rompe en la
    // dirección que el comentario del propio knob dice querer evitar: para quien vive al OESTE de
    // RD la oferta muere ANTES de que acabe su día 15. En California (UTC−7) se apaga a las 19:59
    // del 15 mientras las tarjetas siguen diciendo «sube el 15 de septiembre» — cuatro horas de
    // urgencia que el copy promete y el código no da. EE. UU. es uno de los seis países del
    // selector.
    //
    // Al ESTE pasa lo contrario y es benigno: un español la conserva hasta las 05:59 del 16. Pero
    // «sube el 15» tampoco es cierto ahí, así que la regla honesta es la misma para todos: la
    // oferta vive mientras la fecha LOCAL del usuario no pase del plazo.
    //
    // El huso se INYECTA (2º parámetro) en vez de leerse del reloj del runner. Es la lección de
    // `test_el_signo_es_el_de_getTimezoneOffset`: un caso cuyo resultado depende de dónde corra no
    // es una defensa, es un intermitente.
    const enHuso = (iso, offsetMin) => {
        // `iso` es hora LOCAL del usuario; se convierte al instante absoluto correspondiente.
        const abs = Math.abs(offsetMin);
        const hh = String(Math.floor(abs / 60)).padStart(2, '0');
        const mm = String(abs % 60).padStart(2, '0');
        // getTimezoneOffset: POSITIVO = OESTE, así que UTC−4 (RD, 240) es el sufijo `-04:00`.
        return new Date(`${iso}${offsetMin >= 0 ? '-' : '+'}${hh}:${mm}`);
    };

    const RD = 240;        // UTC−4
    const PACIFICO = 420;  // UTC−7 (California en septiembre)
    const MADRID = -120;   // UTC+2 (España en verano)

    it('el usuario de California la conserva TODO su día 15 — el caso que la ancla a RD rompía', () => {
        // 20:00 del 15 en California = 23:00 del 15 en RD (todavía viva por casualidad), pero
        // 23:30 del 15 en California = 02:30 del 16 en RD: con el ancla dominicana, muerta.
        expect(isLaunchOfferActive(enHuso('2026-09-15T23:30:00', PACIFICO), PACIFICO)).toBe(true);
    });

    it('y le vence en cuanto empieza SU día 16', () => {
        expect(isLaunchOfferActive(enHuso('2026-09-16T00:30:00', PACIFICO), PACIFICO)).toBe(false);
    });

    it('el usuario de Madrid tampoco la arrastra hasta su día 16', () => {
        // Con el ancla dominicana la conservaba hasta las 05:59 del 16 en Madrid.
        expect(isLaunchOfferActive(enHuso('2026-09-16T00:30:00', MADRID), MADRID)).toBe(false);
    });

    it('el dominicano ve exactamente lo de siempre — byte-identidad de conducta', () => {
        expect(isLaunchOfferActive(enHuso('2026-09-15T23:59:00', RD), RD)).toBe(true);
        expect(isLaunchOfferActive(enHuso('2026-09-16T00:01:00', RD), RD)).toBe(false);
    });

    it('sin huso inyectado sigue funcionando (los dos call sites llaman sin argumentos)', () => {
        // No se afirma el veredicto —depende del reloj— sino que no revienta y decide algo.
        expect(typeof isLaunchOfferActive()).toBe('boolean');
    });

    it('el interruptor manual sigue mandando dentro del plazo', () => {
        // Apagar antes de tiempo tiene que seguir siendo posible: la fecha es un
        // techo automático, no un sustituto del control del dueño.
        const original = LAUNCH_OFFER.active;
        try {
            LAUNCH_OFFER.active = false;
            expect(isLaunchOfferActive(enRD('2026-08-14T10:00:00'), RD_OFFSET)).toBe(false);
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
            expect(isLaunchOfferActive(enRD('2026-08-14T10:00:00'), RD_OFFSET)).toBe(false);
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
