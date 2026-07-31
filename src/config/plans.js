// [P0-ANNUAL-PLANS-MISCONFIGURED · 2026-07-30] SSOT de qué tiers NO ofrecen
// plan anual.
//
// POR QUÉ ESTÁN LOS TRES APAGADOS AHORA MISMO
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
// subscriptions" del panel de PayPal). Los tres planes quedaron INACTIVE en
// PayPal el 2026-07-30.
//
// PayPal NO permite editar ni el nombre ni la frecuencia de un plan, así que
// reactivar el anual exige CREARLOS DE NUEVO con `interval_unit: YEAR`. Cuando
// eso ocurra:
//   1. crear los 3 planes nuevos (y aprovechar para el nombre "Bioboros")
//   2. actualizar `VITE_PAYPAL_PLAN_*_ANNUAL` y `PAYPAL_PLAN_*_ANNUAL_ID`
//   3. quitar de este set los tiers que vuelvan a tener anual
//
// Vive en un módulo propio porque estaba DUPLICADO en `Pricing.jsx` y
// `Upgrade.jsx`: dos copias del mismo interruptor garantizan que un día se
// apague uno y no el otro, y aquí eso significaría seguir vendiendo un plan
// que cobra nueve veces de más.

/** Tiers sin opción de pago anual. Vacío = todos ofrecen anual. */
export const ANNUAL_DISABLED_TIERS = new Set(['basic', 'plus', 'ultra']);

export default ANNUAL_DISABLED_TIERS;
