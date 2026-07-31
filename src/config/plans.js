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

// [P1-LAUNCH-OFFER · 2026-07-31] Anclaje "precio de lanzamiento": las
// tarjetas muestran el precio FUTURO tachado + la fecha en que sube.
// ⚠️ HONESTIDAD: mantener esto activo obliga a SUBIR los precios de verdad
// en esa fecha (o mover la fecha ANTES de que llegue). Una urgencia que
// nunca se cumple es un dark pattern y un riesgo de disputa. Apagar:
// `active: false` (las tarjetas vuelven al precio simple).
export const LAUNCH_OFFER = {
    active: true,
    deadlineLabel: '15 de septiembre',
    futureMonthly: { basic: '14.99', plus: '29.99', ultra: '69.99' },
};

export default ANNUAL_DISABLED_TIERS;
