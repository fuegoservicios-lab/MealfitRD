// [P3-RESTOCK-NUDGE · 2026-06-23] Tests CONDUCTUALES de la lógica de decisión del
// nudge para llenar la Nevera (banner / prompt / auto-fill / recordatorio). La
// aritmética de "cuándo mostrar qué" es frágil (fecha de compra, snooze, opt-out
// de último recurso) y debe vivir testeada fuera del Dashboard de 4000+ líneas.
//
// Inyectamos `nowMs` y `daysSinceGroceryStart` a mano (las funciones son puras —
// no llaman Date.now()), y usamos los setters reales (snooze/dismiss/...) que
// persisten en localStorage (jsdom) para verificar el estado de cada capa.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    PROMPT_AFTER_DAYS,
    SNOOZE_DAYS,
    AUTOFILL_GRACE_DAYS,
    planNudgeKey,
    shouldShowBanner,
    shouldShowPrompt,
    shouldAutoFill,
    shouldSendReminder,
    dismissBanner,
    setSnooze,
    markAutoFilled,
    markReminderSent,
    getSnoozeUntil,
} from '../utils/restockNudge';

const NOW = 1_750_000_000_000; // epoch fijo
const DAY = 86_400_000;

function ctx(over = {}) {
    return {
        planData: { id: 'plan-A' },
        // [P1-DAILY-NOT-CYCLE · 2026-07-28] userId por defecto — el snooze y el
        // recordatorio ahora se leen/escriben por usuario, no por plan.
        userId: 'user-1',
        hasPendingItems: true,
        restocked: false,
        daysSinceGroceryStart: 0,
        nowMs: NOW,
        ...over,
    };
}

beforeEach(() => {
    localStorage.clear();
});

describe('planNudgeKey', () => {
    it('prioriza cycle_start_date sobre id', () => {
        expect(planNudgeKey({ cycle_start_date: '2026-06-23', id: 'x' })).toBe('2026-06-23');
    });
    it('cae a plan_id/id/name si no hay cycle_start_date', () => {
        expect(planNudgeKey({ id: 'abc' })).toBe('abc');
        expect(planNudgeKey({ name: 'Mi Plan' })).toBe('Mi Plan');
    });
    it('null sin plan', () => {
        expect(planNudgeKey(null)).toBe(null);
    });
});

describe('shouldShowBanner (#1)', () => {
    it('se muestra cuando hay plan con compras pendientes y sin restock', () => {
        expect(shouldShowBanner(ctx())).toBe(true);
    });
    it('NO si ya está restocked', () => {
        expect(shouldShowBanner(ctx({ restocked: true }))).toBe(false);
    });
    it('NO si no hay nada pendiente que comprar', () => {
        expect(shouldShowBanner(ctx({ hasPendingItems: false }))).toBe(false);
    });
    it('NO si el usuario descartó el banner para este plan', () => {
        dismissBanner('plan-A');
        expect(shouldShowBanner(ctx())).toBe(false);
        // pero otro plan distinto sí lo muestra
        expect(shouldShowBanner(ctx({ planData: { id: 'plan-B' } }))).toBe(true);
    });
});

describe('shouldShowPrompt (#2)', () => {
    it('NO antes de la fecha de compra (daysSinceGroceryStart < 0)', () => {
        expect(shouldShowPrompt(ctx({ daysSinceGroceryStart: -2 }))).toBe(false);
    });
    it('sí el día de la fecha de compra (>= PROMPT_AFTER_DAYS)', () => {
        expect(shouldShowPrompt(ctx({ daysSinceGroceryStart: PROMPT_AFTER_DAYS }))).toBe(true);
    });
    it('NO durante el snooze, sí después', () => {
        // [P1-DAILY-NOT-CYCLE] el snooze se guarda por userId, no por plan key.
        setSnooze('user-1', NOW); // pospone SNOOZE_DAYS
        expect(getSnoozeUntil('user-1')).toBe(NOW + SNOOZE_DAYS * DAY);
        expect(shouldShowPrompt(ctx({ daysSinceGroceryStart: 1 }))).toBe(false);
        // tras vencer el snooze vuelve
        expect(shouldShowPrompt(ctx({ daysSinceGroceryStart: 3, nowMs: NOW + (SNOOZE_DAYS + 1) * DAY }))).toBe(true);
    });
});

describe('shouldAutoFill (#3 — opt-out de último recurso)', () => {
    it('NO antes del periodo de gracia', () => {
        expect(shouldAutoFill(ctx({ daysSinceGroceryStart: AUTOFILL_GRACE_DAYS - 1 }))).toBe(false);
    });
    it('sí pasado el periodo de gracia, sin snooze ni auto-fill previo', () => {
        expect(shouldAutoFill(ctx({ daysSinceGroceryStart: AUTOFILL_GRACE_DAYS }))).toBe(true);
    });
    it('NO si el usuario dijo "todavía no" (snooze vigente bloquea el opt-out, por userId)', () => {
        setSnooze('user-1', NOW + AUTOFILL_GRACE_DAYS * DAY); // snooze que aún no vence
        expect(shouldAutoFill(ctx({ daysSinceGroceryStart: AUTOFILL_GRACE_DAYS, nowMs: NOW + AUTOFILL_GRACE_DAYS * DAY }))).toBe(false);
    });
    it('NO si ya se auto-llenó (one-shot, por plan)', () => {
        markAutoFilled('plan-A');
        expect(shouldAutoFill(ctx({ daysSinceGroceryStart: AUTOFILL_GRACE_DAYS + 5 }))).toBe(false);
    });
    it('NO si ya está restocked', () => {
        expect(shouldAutoFill(ctx({ daysSinceGroceryStart: AUTOFILL_GRACE_DAYS, restocked: true }))).toBe(false);
    });
});

describe('shouldSendReminder (#4)', () => {
    it('sí una vez al llegar la fecha de compra', () => {
        expect(shouldSendReminder(ctx())).toBe(true);
    });
    it('NO una segunda vez (one-shot por userId — [P1-DAILY-NOT-CYCLE] antes era por plan)', () => {
        markReminderSent('user-1');
        expect(shouldSendReminder(ctx())).toBe(false);
    });
    it('NO antes de la fecha de compra', () => {
        expect(shouldSendReminder(ctx({ daysSinceGroceryStart: -1 }))).toBe(false);
    });
});

describe('[P1-DAILY-NOT-CYCLE · 2026-07-28] snooze/recordatorio sobreviven una renovación de plan', () => {
    it('un snooze previo sigue bloqueando el prompt Y el auto-fill tras renovar (el plan key cambia, el userId no)', () => {
        setSnooze('user-1', NOW); // "Todavía no" ANTES de renovar.

        const afterRenewal = ctx({
            planData: { id: 'plan-B' }, // renovación ⇒ nuevo plan key
            daysSinceGroceryStart: AUTOFILL_GRACE_DAYS,
            nowMs: NOW + 1 * DAY, // dentro de la ventana de SNOOZE_DAYS=2
        });
        expect(planNudgeKey(afterRenewal.planData)).not.toBe(planNudgeKey(ctx().planData));
        expect(shouldShowPrompt(afterRenewal)).toBe(false);
        expect(shouldAutoFill(afterRenewal)).toBe(false);
    });

    it('un recordatorio ya entregado tampoco se re-envía tras renovar', () => {
        markReminderSent('user-1');
        const afterRenewal = ctx({ planData: { id: 'plan-B' } });
        expect(shouldSendReminder(afterRenewal)).toBe(false);
    });

    it('banner_dismissed SÍ sigue siendo por-plan: descartar el banner del plan viejo no oculta el del plan nuevo', () => {
        dismissBanner(planNudgeKey({ id: 'plan-A' }));
        expect(shouldShowBanner(ctx({ planData: { id: 'plan-A' } }))).toBe(false);
        expect(shouldShowBanner(ctx({ planData: { id: 'plan-B' } }))).toBe(true);
    });
});
