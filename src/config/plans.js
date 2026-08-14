// [P0-ANNUAL-PLANS-MISCONFIGURED · 2026-07-30] SSOT de qué tiers NO ofrecen
// plan anual.
//
// LO QUE PASÓ
// Los tres planes "Anual" de PayPal estaban creados con `interval_unit: MONTH`
// en vez de `YEAR`. O sea: cobraban el precio ANUAL todos los MESES.
//
//     Básico Anual   89.99 USD  cada 1 MONTH   (debía ser 1 YEAR)
//     Plus Anual    179.99 USD  cada 1 MONTH
//     Ultra Anual   449.99 USD  cada 1 MONTH
//
// La aritmética confirma la intención: el mensual Básico son 9.99, y
// 9.99 × 12 × 0.75 = 89.91 ≈ 89.99 — el precio de un año con el 25% de
// descuento que promete la propia descripción del plan. Quien lo contratara
// habría pagado ~1.080 USD al año en vez de 89.99. Nueve veces de más.
//
// Nadie llegó a ser cobrado: había CERO suscripciones activas (verificado en
// `user_profiles.paypal_subscription_id` y en la columna "Active
// subscriptions" del panel de PayPal). Los tres quedaron INACTIVE.
//
// CÓMO SE CERRÓ (mismo día)
// PayPal no permite editar ni el nombre ni la frecuencia de un plan, así que
// hubo que crearlos de nuevo. Se recrearon DOS, ya con la marca Bioboros y
// verificados por API con `interval_unit: YEAR`:
//
//     Bioboros Básico Anual   89.99 USD / 1 YEAR   P-4GY51674NG929162SNJV7MIY
//     Bioboros Plus Anual    179.99 USD / 1 YEAR   P-7U538659AK696615ENJV7OUA
//
// POR QUÉ `ultra` SIGUE EN EL SET
// Max NO tiene plan anual y no es un descuido: nunca se recreó. Su env var
// `VITE_PAYPAL_PLAN_ULTRA_ANNUAL` está comentada en `.env.production`, así que
// ofrecer el anual de Max mandaría a PayPal un plan id `undefined`. El set y
// la env var son dos mitades del mismo interruptor y el test las obliga a
// coincidir: para encender el anual de Max hay que crear el plan en PayPal
// (49.99 × 12 × 0.75 = 449.91, con `interval_unit: YEAR`), poner su id en la
// env var y SÓLO ENTONCES quitarlo de aquí.
//
// Vive en un módulo propio porque estaba DUPLICADO en `Pricing.jsx` y
// `Upgrade.jsx`: dos copias del mismo interruptor garantizan que un día se
// apague uno y no el otro, y aquí eso significaría seguir vendiendo un plan
// que cobra nueve veces de más.

/** Tiers sin opción de pago anual. Vacío = todos ofrecen anual. */
export const ANNUAL_DISABLED_TIERS = new Set(['ultra']);

// [P1-CREDITS-LADDER · 2026-07-31] Créditos/mes por tier — PARIDAD con
// backend/auth.py::_TIER_LIMITS (test_p1_credits_ladder.py ancla ambos lados).
// Vive aquí (módulo compartido) porque estaba a punto de duplicarse en
// Upgrade.jsx + Pricing.jsx — dos copias del mismo número garantizan drift.
// Max ya NO es "ilimitado": 500/mes (≈16/día) — inalcanzable para uso humano
// real, acotado para abuso. El copy de venta usa estos números.
export const TIER_CREDITS = { gratis: 10, basic: 50, plus: 200, ultra: 500 };

// [P2-TIER-DISPLAY-NAME · 2026-07-31] Nombre COMERCIAL por tier. La clave
// `ultra` no se renombra (la usan PayPal, `user_profiles.plan_tier` y los
// knobs); lo que se traduce es la capa visible. Vive aquí porque lo necesitan
// la landing Y el dashboard: tenerlo dos veces es garantía de que un día
// digan cosas distintas.
export const TIER_DISPLAY_NAME = {
    gratis: 'Gratis',
    basic: 'Básico',
    plus: 'Plus',
    ultra: 'Max',
};

// [P2-LADDER-VS-PREDECESSOR · 2026-07-31] Cada plan se compara con el escalón
// ANTERIOR, no con Gratis (pedido del owner: el salto que importa al decidir
// es el que separa de donde estás, no del principio de la escalera).
export const TIER_PREDECESSOR = { basic: 'gratis', plus: 'basic', ultra: 'plus' };

/** Múltiplo de créditos frente al tier anterior, DERIVADO de `TIER_CREDITS`.
 *  Se calcula en vez de escribirse porque los tres números y los créditos son
 *  el mismo dato: tocar el ladder sin tocar el copy dejaría la página
 *  prometiendo saltos que ya no existen. `null` si el tier no tiene anterior
 *  (Gratis) o si el ladder dejara de crecer — nunca se inventa un salto. */
export function creditsVsPredecessor(tier) {
    const prev = TIER_PREDECESSOR[tier];
    if (!prev) return null;
    const ratio = TIER_CREDITS[tier] / TIER_CREDITS[prev];
    if (!Number.isFinite(ratio) || ratio <= 1) return null;
    const factor = Number.isInteger(ratio) ? String(ratio) : ratio.toFixed(1).replace('.', ',');
    return `${factor}× más créditos que ${TIER_DISPLAY_NAME[prev]}`;
}

/** "Todo lo incluido en <anterior>" — misma razón: el nombre del escalón
 *  anterior se deriva, no se repite. */
export function includesPredecessor(tier) {
    const prev = TIER_PREDECESSOR[tier];
    return prev ? `Todo lo incluido en ${TIER_DISPLAY_NAME[prev]}` : null;
}

// [P2-LANDING-COPY-TRUTH · 2026-08-14] Precios por tier y periodo.
//
// Vivían DUPLICADOS byte a byte en `Pricing.jsx` y `Upgrade.jsx`, más una
// tercera copia en prosa dentro de los Términos. Y ya habían divergido de
// verdad: `getMonthlyEquiv` tenía dos implementaciones distintas. Con la subida
// de precio AGENDADA, tres copias significan tres sitios que editar justo cuando
// más caro sale equivocarse.
//
// ⚠️ `ultra.annual` sigue aquí y está INERTE a propósito: `ANNUAL_DISABLED_TIERS`
// incluye `ultra`, así que ninguna superficie debe ofrecerlo. Se conserva el dato
// (no el ofrecimiento) para que el día que se cree el plan anual de Max en PayPal
// el importe no haya que reinventarlo. NO derives de aquí ningún texto de venta:
// quien decide si un tier tiene anual es `ANNUAL_DISABLED_TIERS`, no este objeto.
export const PRICING = {
    basic: {
        monthly: { price: '9.99', label: '/mes' },
        annual: { price: '89.99', label: '/año', monthlyEquiv: '7.50' },
    },
    plus: {
        monthly: { price: '19.99', label: '/mes' },
        annual: { price: '179.99', label: '/año', monthlyEquiv: '15.00' },
    },
    ultra: {
        monthly: { price: '49.99', label: '/mes' },
        annual: { price: '449.99', label: '/año', monthlyEquiv: '37.50' },
    },
};

// [PAY-MODAL-PERSIST · 2026-06-18 · movido al SSOT P2-LANDING-COPY-TRUTH] Nombre
// del plan para re-derivar el `name` del modal al rehidratarlo desde la URL tras
// un refresh. Estaba duplicado en las dos superficies que abren checkout.
export const NAME_BY_TIER = {
    basic: 'Suscripción Básico',
    plus: 'Suscripción Plus',
    ultra: 'Suscripción Max',
};

// [P2-LANDING-COPY-TRUTH · 2026-08-14] Orden de la escalera. Se llamaba
// `tierRank` en una superficie y `TIER_RANK` en la otra: dos nombres para el
// mismo mapa es exactamente cómo empieza una divergencia que nadie ve.
export const TIER_RANK = { gratis: 1, basic: 2, plus: 3, ultra: 4, admin: 5 };

/** ¿Ofrece este tier facturación anual? Pregunta al interruptor, no a `PRICING`. */
export const hasAnnualBilling = (tier) => !ANNUAL_DISABLED_TIERS.has(tier);

/** Precio mensual equivalente del anual, o `null` si el tier no tiene anual. */
export function monthlyEquivalent(tier) {
    return hasAnnualBilling(tier) ? PRICING[tier]?.annual?.monthlyEquiv ?? null : null;
}

// [P1-LAUNCH-OFFER · 2026-07-31] Anclaje "precio de lanzamiento": las
// tarjetas muestran el precio FUTURO tachado + la fecha en que sube.
// ⚠️ HONESTIDAD: mantener esto activo obliga a SUBIR los precios de verdad
// en esa fecha (o mover la fecha ANTES de que llegue). Una urgencia que
// nunca se cumple es un dark pattern y un riesgo de disputa. Apagar:
// `active: false` (las tarjetas vuelven al precio simple).
// `deadlineShort` es para las tarjetas (columnas estrechas: un texto largo que
// no cabe empuja el ancho de su columna y desbalancea la grid — pasó en prod);
// `deadlineLabel` es para la landing, que tiene más aire.
//
// [P2-LANDING-COPY-TRUTH · 2026-08-14] `active` dejó de ser la última palabra.
// Era un booleano a mano y la fecha una cadena SIN AÑO: cero `Date`, cero
// comparación, cero test. O sea que la advertencia de honestidad de arriba
// dependía de que alguien se acordara el día 15 — y pasado ese día el sitio
// seguiría anunciando una subida ya ocurrida, que es el dark pattern que el
// propio comentario dice querer evitar. Ahora `active` es el interruptor MANUAL
// (apagar antes de tiempo) y la fecha es el techo automático.
export const LAUNCH_OFFER = {
    active: true,
    deadlineISO: '2026-09-15',
    deadlineLabel: '15 de septiembre',
    deadlineShort: '15 sep',
    futureMonthly: { basic: '14.99', plus: '29.99', ultra: '69.99' },
};

// La oferta vence al FINAL del día 15 en República Dominicana (UTC−4, sin horario
// de verano). El offset es load-bearing y no cosmético: `new Date('2026-09-15')`
// se interpreta como medianoche UTC, que son las 20:00 del día 14 en RD — la
// urgencia moriría a media tarde de la víspera. Es el mismo «¿día de quién?» que
// ya se pagó en P1-AGENT-SESSION-DAY.
const RD_UTC_OFFSET = '-04:00';

/**
 * ¿Sigue viva la oferta de lanzamiento?
 *
 * `now` se inyecta para que el guard pueda probar el antes y el después sin
 * tocar el reloj del sistema.
 */
export function isLaunchOfferActive(now = new Date()) {
    if (!LAUNCH_OFFER.active) return false;
    const vence = Date.parse(`${LAUNCH_OFFER.deadlineISO}T23:59:59${RD_UTC_OFFSET}`);
    if (Number.isNaN(vence)) return false; // fecha ilegible ⇒ no anunciamos urgencia
    return now.getTime() <= vence;
}

export default ANNUAL_DISABLED_TIERS;
