// [P3-RESTOCK-NUDGE · 2026-06-23] SSOT de la lógica del "nudge" para que el
// usuario llene su Nevera tras hacer las compras. Resuelve el modo de fallo:
// el usuario crea un plan, va al súper, y se le OLVIDA tocar "Ya compré la
// lista" → la Nevera queda vacía y el plan no usa lo que tiene (la lista delta
// no descuenta, la regeneración no aprovecha su comida, etc.).
//
// Cuatro capas leen su estado de aquí (todo client-side, sin backend nuevo):
//   #1 Banner      — aviso persistente/descartable mientras el plan no esté restocked.
//   #2 Prompt      — al abrir la app EN o DESPUÉS de la fecha de compra, pregunta 1-toque.
//   #3 Auto-fill   — último recurso opt-out: si pasaron varios días y sigue vacía,
//                    llena la Nevera sola (reversible: el usuario quita lo que no compró).
//   #4 Recordatorio — entrada en el centro de notificaciones (campana), re-leíble.
//
// Señales que ya existen en Dashboard: `plan.is_restocked` (quién NO ha llenado)
// y `daysSinceCreation` (días desde `grocery_start_date`; >= 0 ⇒ la fecha llegó).
// El restock backend es idempotente (solo agrega el delta), así que disparar el
// nudge varias veces NO duplica ingredientes.

import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';

const DAY_MS = 24 * 60 * 60 * 1000;

// Knobs (en días). Conservadores a propósito: el auto-llenado opt-out solo entra
// como ÚLTIMO recurso para no introducir el error opuesto (creer que tienes
// comida que no compraste) salvo que el usuario claramente no esté actuando.
export const PROMPT_AFTER_DAYS = 0; // el prompt aparece desde el día de la fecha de compra
export const SNOOZE_DAYS = 2; // "Todavía no" pospone el prompt 2 días
export const AUTOFILL_GRACE_DAYS = 3; // auto-llenar solo si pasaron 3+ días sin acción

const _key = (kind, planKey) => `mealfit_restock_${kind}_${planKey}`;

// Clave estable por plan (espeja el patrón de Dashboard.jsx: cycle_start_date
// primero porque es inmutable entre remontajes y cambia al regenerar).
export function planNudgeKey(planData) {
    if (!planData) return null;
    return (
        planData.cycle_start_date ||
        planData.plan_id ||
        planData.id ||
        planData.grocery_start_date ||
        planData.name ||
        null
    );
}

function _readFlag(kind, key) {
    return key ? safeLocalStorageGet(_key(kind, key), '') : '';
}
function _writeFlag(kind, key, val) {
    if (key) safeLocalStorageSet(_key(kind, key), String(val));
}

// ── Estado persistido ──
// [P1-DAILY-NOT-CYCLE · 2026-07-28 · corregido el mismo día tras code review]
// La granularidad por flag es DELIBERADA y NO simétrica entre las cuatro. La
// primera vuelta de este fix emparejó `snooze_until` y `reminder_sent` "por
// analogía" (las dos hablan de restock, ¿no deberían moverse juntas?) sin
// mirar que tienen naturalezas distintas — ese emparejamiento era el error.
// No lo repitas.
//
//   - `banner_dismissed`/`autofilled` (justo debajo) y `reminder_sent` (más
//     abajo) son por-PLAN (`planNudgeKey`): una lista de compras nueva es,
//     genuinamente, algo nuevo — correcto que un plan renovado recupere su
//     banner, sea candidato a su propio auto-llenado, Y vuelva a timbrar el
//     recordatorio de restock. Que la campana suene otra vez tras una
//     renovación REAL no es un bug: es una lista de compras nueva, avisar de
//     nuevo es lo correcto. Además, `reminder_sent` NO tiene mecanismo de
//     caducidad propio (booleano que solo se setea, nunca se limpia) — a
//     diferencia del snooze de abajo, moverlo a nivel-usuario lo convertiría
//     de "una vez por ciclo de compras" a "una vez en la vida del usuario":
//     un plan genuinamente nuevo semanas después, que el usuario vuelve a
//     olvidar llenar, JAMÁS volvería a notificar. Esa regresión es peor que
//     el bug original (reportado y revertido el mismo día).
//   - `snooze_until` (justo debajo) SÍ es por-USUARIO: los callers de
//     decisión (`shouldShowPrompt`/`shouldAutoFill`, más abajo) lo invocan
//     con `ctx.userId`, NO con `planNudgeKey`. Es la única de las dos que
//     bloquea el auto-fill (#3) — el opt-out que puede escribir INVENTARIO
//     FANTASMA en la Nevera si dispara sobre un "todavía no" que el usuario
//     ya dijo minutos antes de renovar. Por eso es la única que DEBE
//     sobrevivir una renovación same-day. Como es un timestamp absoluto
//     (no un booleano sin caducidad como `reminder_sent`), moverlo a
//     nivel-usuario no cambia CUÁNDO expira, solo QUÉ lo invalidaba
//     prematuramente antes (cualquier renovación de plan; ahora, nada salvo
//     el paso del tiempo).
//
// Las funciones de bajo nivel se mantienen puras y genéricas sobre una `key`
// opaca — el fix vive enteramente en QUÉ key les pasa cada caller, no en su
// implementación.
export function isBannerDismissed(planKey) { return _readFlag('banner_dismissed', planKey) === '1'; }
export function dismissBanner(planKey) { _writeFlag('banner_dismissed', planKey, '1'); }

/** Epoch ms hasta el cual NO mostrar el prompt (0 = sin snooze). `key` es
 *  opaca — el caller pasa `userId` (ver nota arriba), NO un plan. */
export function getSnoozeUntil(key) {
    const v = Number(_readFlag('snooze_until', key));
    return Number.isFinite(v) ? v : 0;
}
export function setSnooze(key, nowMs, days = SNOOZE_DAYS) {
    _writeFlag('snooze_until', key, nowMs + days * DAY_MS);
}

export function wasAutoFilled(planKey) { return _readFlag('autofilled', planKey) === '1'; }
export function markAutoFilled(planKey) { _writeFlag('autofilled', planKey, '1'); }

/** `key` opaca — el caller pasa `planNudgeKey(planData)` (por-plan, a
 *  propósito — ver nota de "Estado persistido"; NO emparejar con el snooze
 *  de arriba, que sí es por-usuario). */
export function wasReminderSent(planKey) { return _readFlag('reminder_sent', planKey) === '1'; }
export function markReminderSent(planKey) { _writeFlag('reminder_sent', planKey, '1'); }

// ── Decisiones (puras: el caller inyecta `nowMs`, no hay Date.now() aquí) ──
// ctx = { planData, hasPendingItems, restocked, daysSinceGroceryStart, nowMs, userId }
//   restocked              = plan.is_restocked || sessionRestocked
//   daysSinceGroceryStart  = daysSinceCreation (>= 0 ⇒ la fecha de compra llegó)
//   userId                 = [P1-DAILY-NOT-CYCLE · 2026-07-28] identidad estable
//                            del usuario — a diferencia de `planNudgeKey(planData)`,
//                            NO cambia al renovar el plan. Solo la lee el snooze
//                            (#2/#3) — el recordatorio (#4) sigue siendo por-plan
//                            a propósito (ver nota de "Estado persistido").

/** Base común: hay un plan con cosas que comprar y que aún no se ha "restocked". */
function _isUnstocked(ctx) {
    return !!ctx.planData && !ctx.restocked && !!ctx.hasPendingItems;
}

/** #1 Banner: visible siempre que el plan esté sin llenar y no lo hayan descartado.
 *  Plan-scoped a propósito — ver nota de "Estado persistido". */
export function shouldShowBanner(ctx) {
    if (!_isUnstocked(ctx)) return false;
    return !isBannerDismissed(planNudgeKey(ctx.planData));
}

/** #2 Prompt: al abrir la app en/después de la fecha de compra, salvo snooze.
 *  [P1-DAILY-NOT-CYCLE · 2026-07-28] El snooze se lee por `ctx.userId`, no por
 *  plan (ver nota de "Estado persistido"). `snooze_until` sigue siendo un
 *  timestamp absoluto — mover la key a nivel-usuario no cambia CUÁNDO expira,
 *  solo QUÉ lo invalidaba prematuramente antes (cualquier renovación de plan;
 *  ahora, nada salvo el paso del tiempo). */
export function shouldShowPrompt(ctx) {
    if (!_isUnstocked(ctx)) return false;
    if (!(ctx.daysSinceGroceryStart >= PROMPT_AFTER_DAYS)) return false;
    return ctx.nowMs >= getSnoozeUntil(ctx.userId);
}

/** #3 Auto-fill (opt-out, último recurso): varios días sin acción NI snooze
 *  explícito. El "Todavía no" (snooze, por-usuario — ver nota de arriba)
 *  BLOQUEA el auto-fill: si el usuario dijo que no ha comprado, no asumimos
 *  lo contrario. `autofilled` SÍ sigue siendo por-plan: cada plan trae una
 *  lista de compras nueva que aún no se ha auto-llenado — auto-llenar de
 *  nuevo para un plan distinto es el comportamiento correcto, no un bug. */
export function shouldAutoFill(ctx) {
    if (!_isUnstocked(ctx)) return false;
    if (!(ctx.daysSinceGroceryStart >= AUTOFILL_GRACE_DAYS)) return false;
    const planKey = planNudgeKey(ctx.planData);
    if (wasAutoFilled(planKey)) return false;
    if (ctx.nowMs < getSnoozeUntil(ctx.userId)) return false; // el usuario dijo "todavía no"
    return true;
}

/** #4 Recordatorio (campana): una sola vez por PLAN, al llegar la fecha de
 *  compra. [P1-DAILY-NOT-CYCLE · 2026-07-28] Deliberadamente por-plan, a
 *  diferencia del snooze de arriba — ver nota de "Estado persistido" para
 *  por qué NO deben emparejarse: que la campana vuelva a sonar tras una
 *  renovación real (plan nuevo, lista de compras nueva) es el comportamiento
 *  correcto, no el bug. `reminder_sent` tampoco tiene mecanismo de caducidad
 *  propio (a diferencia de `snooze_until`), así que moverlo a nivel-usuario
 *  lo volvería "una vez en la vida" en lugar de "una vez por ciclo". */
export function shouldSendReminder(ctx) {
    if (!_isUnstocked(ctx)) return false;
    if (!(ctx.daysSinceGroceryStart >= PROMPT_AFTER_DAYS)) return false;
    return !wasReminderSent(planNudgeKey(ctx.planData));
}
