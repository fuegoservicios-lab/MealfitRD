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

function _readFlag(kind, planKey) {
    return planKey ? safeLocalStorageGet(_key(kind, planKey), '') : '';
}
function _writeFlag(kind, planKey, val) {
    if (planKey) safeLocalStorageSet(_key(kind, planKey), String(val));
}

// ── Estado persistido por plan ──
export function isBannerDismissed(planKey) { return _readFlag('banner_dismissed', planKey) === '1'; }
export function dismissBanner(planKey) { _writeFlag('banner_dismissed', planKey, '1'); }

/** Epoch ms hasta el cual NO mostrar el prompt (0 = sin snooze). */
export function getSnoozeUntil(planKey) {
    const v = Number(_readFlag('snooze_until', planKey));
    return Number.isFinite(v) ? v : 0;
}
export function setSnooze(planKey, nowMs, days = SNOOZE_DAYS) {
    _writeFlag('snooze_until', planKey, nowMs + days * DAY_MS);
}

export function wasAutoFilled(planKey) { return _readFlag('autofilled', planKey) === '1'; }
export function markAutoFilled(planKey) { _writeFlag('autofilled', planKey, '1'); }

export function wasReminderSent(planKey) { return _readFlag('reminder_sent', planKey) === '1'; }
export function markReminderSent(planKey) { _writeFlag('reminder_sent', planKey, '1'); }

// ── Decisiones (puras: el caller inyecta `nowMs`, no hay Date.now() aquí) ──
// ctx = { planData, hasPendingItems, restocked, daysSinceGroceryStart, nowMs }
//   restocked              = plan.is_restocked || sessionRestocked
//   daysSinceGroceryStart  = daysSinceCreation (>= 0 ⇒ la fecha de compra llegó)

/** Base común: hay un plan con cosas que comprar y que aún no se ha "restocked". */
function _isUnstocked(ctx) {
    return !!ctx.planData && !ctx.restocked && !!ctx.hasPendingItems;
}

/** #1 Banner: visible siempre que el plan esté sin llenar y no lo hayan descartado. */
export function shouldShowBanner(ctx) {
    if (!_isUnstocked(ctx)) return false;
    return !isBannerDismissed(planNudgeKey(ctx.planData));
}

/** #2 Prompt: al abrir la app en/después de la fecha de compra, salvo snooze. */
export function shouldShowPrompt(ctx) {
    if (!_isUnstocked(ctx)) return false;
    if (!(ctx.daysSinceGroceryStart >= PROMPT_AFTER_DAYS)) return false;
    return ctx.nowMs >= getSnoozeUntil(planNudgeKey(ctx.planData));
}

/** #3 Auto-fill (opt-out, último recurso): varios días sin acción NI snooze
 *  explícito. El "Todavía no" (snooze) BLOQUEA el auto-fill: si el usuario dijo
 *  que no ha comprado, no asumimos lo contrario. */
export function shouldAutoFill(ctx) {
    if (!_isUnstocked(ctx)) return false;
    if (!(ctx.daysSinceGroceryStart >= AUTOFILL_GRACE_DAYS)) return false;
    const k = planNudgeKey(ctx.planData);
    if (wasAutoFilled(k)) return false;
    if (ctx.nowMs < getSnoozeUntil(k)) return false; // el usuario dijo "todavía no"
    return true;
}

/** #4 Recordatorio (campana): una sola vez por plan, al llegar la fecha de compra. */
export function shouldSendReminder(ctx) {
    if (!_isUnstocked(ctx)) return false;
    if (!(ctx.daysSinceGroceryStart >= PROMPT_AFTER_DAYS)) return false;
    return !wasReminderSent(planNudgeKey(ctx.planData));
}
