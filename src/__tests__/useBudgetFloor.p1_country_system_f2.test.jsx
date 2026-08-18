// [P1-COUNTRY-SYSTEM-F2 · 2026-08-17 (Task 9, F7)] `useBudgetFloor` lado-ENVÍO mandaba
// `formData.budgetCurrency` CRUDO al POST /api/plans/budget-floor — mientras que su PROPIO
// fallback estático (`staticMin`) ya usaba `effectiveBudgetCurrency` (sanitizada, F1-T6
// fix-round 1). El mismo bug-class que ese fix-round cerró para los lookups de
// `BUDGET_MIN_TOTAL`: una moneda beta STALE en `formData.budgetCurrency` (bandera
// COUNTRY_SYSTEM_UI apagada tras un rollback, o país cambiado sin limpiar el campo) enviaba al
// backend una moneda distinta a la que la UI acababa de mostrar — el piso PERSONALIZADO podía
// llegar en una moneda distinta al piso ESTÁTICO recién pintado.
//
// Lado-RECEPCIÓN: el backend responde `{..., currency, ...}` (routers/plans.py::api_budget_floor,
// docstring "Response: {ok, min_budget, min_budget_dop, currency, days, household,
// target_calories}") — la moneda AUTORITATIVA en la que `min_budget` está denominado
// (`budget_floor_in_currency`, el mismo SSOT que el gate 422). El hook la ignoraba por completo.
//
// Ambos fixes viven en useBudgetFloor.js; este archivo los ancla con fetch mockeado + fake
// timers (mismo patrón que usePlanPollLoop.test.jsx) — sin montar ningún componente.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBudgetFloor } from '../hooks/useBudgetFloor';

async function flushDebounce() {
    // El hook debounce-ea 400ms antes de disparar el fetch; tras eso, `fetch` + `res.json()`
    // son 2 rondas extra de microtasks que `advanceTimersByTimeAsync` no siempre agota en una
    // sola pasada (fake timers no controla la cola de microtasks de promesas ya en vuelo).
    await vi.advanceTimersByTimeAsync(400);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
}

describe('[P1-COUNTRY-SYSTEM-F2 Task 9 F7] useBudgetFloor — lado-envío effectiveBudgetCurrency', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        global.fetch = vi.fn();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('moneda beta STALE (bandera COUNTRY_SYSTEM_UI apagada en test) ⇒ el body enviado usa DOP, NO el crudo', async () => {
        // Reproduce el escenario de rollback: budgetCurrency='EUR' sobrevive en formData pero la
        // bandera está apagada (default en el entorno de test, sin VITE_COUNTRY_SYSTEM) —
        // effectiveBudgetCurrency('ES', 'EUR', false) === 'DOP' (anclado en
        // QBudget.p1_country_system_f1.test.jsx).
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, min_budget: 5000, currency: 'DOP', target_calories: 2200, tier_references: {} }),
        });
        const formData = {
            country: 'ES', budgetCurrency: 'EUR', groceryDuration: 'weekly',
            weight: 70, weightUnit: 'kg', height: 170, heightUnit: 'cm', age: 30,
            gender: 'male', activityLevel: 'moderate', mainGoal: 'maintain', householdSize: 1,
        };
        renderHook(() => useBudgetFloor(formData));
        await flushDebounce();

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [, options] = global.fetch.mock.calls[0];
        const sentBody = JSON.parse(options.body);
        expect(sentBody.budgetCurrency).toBe('DOP');
        expect(sentBody.budgetCurrency).not.toBe(formData.budgetCurrency);
    });

    it('moneda DOP/USD normal ⇒ el body enviado coincide (caso común, sin drift)', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, min_budget: 4500, currency: 'USD', target_calories: 2000, tier_references: {} }),
        });
        const formData = { country: 'DO', budgetCurrency: 'USD', groceryDuration: 'weekly' };
        renderHook(() => useBudgetFloor(formData));
        await flushDebounce();

        const [, options] = global.fetch.mock.calls[0];
        const sentBody = JSON.parse(options.body);
        expect(sentBody.budgetCurrency).toBe('USD');
    });

    it('MUTACIÓN: si el hook mandara formData.budgetCurrency crudo (comportamiento pre-fix), el body llevaría EUR — confirma que el fix cambió el valor enviado, no solo la firma', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, min_budget: 5000, currency: 'DOP' }),
        });
        const formData = { country: 'ES', budgetCurrency: 'EUR', groceryDuration: 'weekly' };
        renderHook(() => useBudgetFloor(formData));
        await flushDebounce();

        const [, options] = global.fetch.mock.calls[0];
        const sentBody = JSON.parse(options.body);
        // El comportamiento PRE-fix habría sido sentBody.budgetCurrency === 'EUR' (formData
        // crudo, vía el spread de FLOOR_FIELDS). Confirma que el fix real lo cambió a DOP.
        expect(sentBody.budgetCurrency).not.toBe('EUR');
        expect(sentBody.budgetCurrency).toBe('DOP');
    });
});

describe('[P1-COUNTRY-SYSTEM-F2 Task 9 F7] useBudgetFloor — lado-recepción consume data.currency', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        global.fetch = vi.fn();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('respuesta personalizada trae currency ⇒ result.currency refleja la AUTORITATIVA del backend', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, min_budget: 6000, currency: 'DOP', target_calories: 2400, tier_references: {} }),
        });
        // formData pide USD localmente — pero el backend, contra su propio piso, resolvió DOP
        // (p.ej. un householdComposition o ciclo que cae fuera de su tabla de monedas beta).
        const formData = { country: 'DO', budgetCurrency: 'USD', groceryDuration: 'weekly' };
        const { result } = renderHook(() => useBudgetFloor(formData));
        await flushDebounce();

        expect(result.current.isPersonalized).toBe(true);
        expect(result.current.currency).toBe('DOP');
        expect(result.current.min).toBe(6000);
    });

    it('respuesta SIN currency (contrato roto/versión vieja del backend) ⇒ fallback a la currency local sanitizada', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, min_budget: 4500, target_calories: 2000 }), // sin `currency`
        });
        const formData = { country: 'DO', budgetCurrency: 'USD', groceryDuration: 'weekly' };
        const { result } = renderHook(() => useBudgetFloor(formData));
        await flushDebounce();

        expect(result.current.isPersonalized).toBe(true);
        expect(result.current.currency).toBe('USD');
    });

    it('antes de que llegue la red (estado inicial) ⇒ currency ya refleja la sanitizada, no undefined', () => {
        global.fetch.mockImplementation(() => new Promise(() => {})); // nunca resuelve
        const formData = { country: 'ES', budgetCurrency: 'EUR', groceryDuration: 'weekly' };
        const { result } = renderHook(() => useBudgetFloor(formData));

        expect(result.current.isPersonalized).toBe(false);
        expect(result.current.currency).toBe('DOP'); // bandera apagada en test ⇒ colapsa
    });

    it('fetch falla (red caída) ⇒ conserva currency estática, no queda undefined ni revienta', async () => {
        global.fetch.mockRejectedValue(new Error('network down'));
        const formData = { country: 'DO', budgetCurrency: 'USD', groceryDuration: 'weekly' };
        const { result } = renderHook(() => useBudgetFloor(formData));
        await flushDebounce();

        expect(result.current.isPersonalized).toBe(false);
        expect(result.current.currency).toBe('USD');
    });

    it('res.ok=false (429/5xx) ⇒ conserva currency estática', async () => {
        global.fetch.mockResolvedValue({ ok: false });
        const formData = { country: 'DO', budgetCurrency: 'USD', groceryDuration: 'weekly' };
        const { result } = renderHook(() => useBudgetFloor(formData));
        await flushDebounce();

        expect(result.current.isPersonalized).toBe(false);
        expect(result.current.currency).toBe('USD');
    });
});
