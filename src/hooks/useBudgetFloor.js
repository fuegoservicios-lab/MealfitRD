// [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Hook que devuelve el piso de presupuesto
// PERSONALIZADO por las metas del usuario (calorías objetivo × hogar × ciclo), pidiéndolo al
// backend (`POST /api/plans/budget-floor`) que usa la MISMA `min_budget_for_goals` que el gate
// de generación. Así el formulario y el dashboard muestran el MISMO mínimo que el backend exige
// → cero "422 sorpresa" para usuarios de calorías altas (antes se mostraba el piso a 2000 kcal
// sin escalar). Fail-open: mientras carga o si falla, cae al mínimo ESTÁTICO `minBudgetFor`
// (lower bound, siempre disponible sin red). El valor solo sube al personalizarse (cal_scale>=1).
import { useState, useEffect, useRef } from 'react';
import { api } from '../config/api';
import { minBudgetFor, effectiveBudgetCurrency } from '../config/formValidation';

// Campos del form que afectan el piso (biometría + meta + ciclo + moneda + hogar).
const FLOOR_FIELDS = [
    'weight', 'weightUnit', 'height', 'heightUnit', 'age', 'gender',
    'activityLevel', 'mainGoal', 'groceryDuration', 'householdSize', 'budgetCurrency',
];

export function useBudgetFloor(formData) {
    // [P1-COUNTRY-SYSTEM-F1 · fix-round 1 · review] `effectiveBudgetCurrency`, no
    // `formData?.budgetCurrency` crudo — mismo motivo que QBudget/InteractiveAssessmentFlow:
    // una moneda beta STALE (bandera apagada tras un rollback, país cambiado) debe colapsar
    // a DOP aquí también, o el piso ESTÁTICO que este hook expone como fallback mentiría.
    const currency = effectiveBudgetCurrency(formData?.country, formData?.budgetCurrency);
    const groceryDuration = formData?.groceryDuration || 'weekly';
    // Fallback estático (sin red): piso a la caloría de referencia, mismo SSOT que el gate base.
    const staticMin = minBudgetFor(currency, groceryDuration);

    // [P2-AUDIT-V6-BATCH · 2026-07-03] (P2-I) tierReferences: referencia estimada por ciclo de cada
    // tier categórico (piso × banda low/medium/high, misma fórmula del banner del Dashboard) para
    // mostrarla al ELEGIR el tier — el usuario ya no descubre un "RD$Y" que nunca declaró.
    const [result, setResult] = useState({ min: staticMin, isPersonalized: false, targetCalories: null, tierReferences: null, currency });
    const debounceRef = useRef(null);

    // Key estable: solo re-pedimos cuando cambia un campo que mueve el piso.
    const key = FLOOR_FIELDS.map((f) => formData?.[f] ?? '').join('|');

    useEffect(() => {
        // Refleja de inmediato el cambio de duración/moneda con el estático (sin esperar la red).
        // [P1-DASH-BUDGET-AUTOFILL · 2026-06-23] isPersonalized=false hasta que llegue el valor
        // real del backend para ESTOS inputs → el Dashboard espera ese flanco para auto-marcar el
        // monto al mínimo PERSONALIZADO de la nueva duración (no al estático).
        setResult((r) => ({ ...r, min: staticMin, isPersonalized: false, tierReferences: null, currency }));
        if (debounceRef.current) clearTimeout(debounceRef.current);
        let cancelled = false;
        debounceRef.current = setTimeout(async () => {
            try {
                const body = {};
                FLOOR_FIELDS.forEach((f) => {
                    const v = formData?.[f];
                    if (v != null && v !== '') body[f] = v;
                });
                // [P1-COUNTRY-SYSTEM-F2 · 2026-08-17 (Task 9, F7)] Lado-ENVÍO: `budgetCurrency`
                // crudo del loop de arriba se sobre-escribe con `currency` (ya sanitizada vía
                // `effectiveBudgetCurrency`, línea 23) — mismo bug-class que el review de F1-T6
                // cerró para los lookups de `BUDGET_MIN_TOTAL`: una moneda beta STALE en
                // `formData.budgetCurrency` (bandera apagada tras rollback, o país cambiado sin
                // limpiar el campo) enviaría al backend una moneda que el fallback ESTÁTICO de
                // este mismo hook (`staticMin`, arriba) ya no usa — el piso personalizado
                // llegaría en una moneda distinta a la que la UI acaba de mostrar.
                body.budgetCurrency = currency;
                const res = await fetch(api('/api/plans/budget-floor'), {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!res.ok) return; // 429/5xx → conservar el estático
                const data = await res.json().catch(() => null);
                if (cancelled || !data || !data.ok) return;
                setResult({
                    min: data.min_budget,
                    isPersonalized: true,
                    targetCalories: data.target_calories ?? null,
                    tierReferences: data.tier_references ?? null,
                    // [P1-COUNTRY-SYSTEM-F2 · 2026-08-17 (Task 9, F7)] Lado-RECEPCIÓN: la moneda
                    // AUTORITATIVA es la que el backend efectivamente usó para calcular
                    // `min_budget` (`budget_floor_in_currency`, el mismo SSOT que el gate 422) —
                    // no necesariamente la `currency` que se envió (p.ej. un `budgetCurrency`
                    // reconocible localmente pero sin piso propio en `_BUDGET_CYCLE_FLOOR_
                    // DEFAULTS_BY_CURRENCY` server-side cae a DOP ahí). Fallback a `currency`
                    // local solo si el backend, contra su propio contrato documentado
                    // (`Response: {..., currency, ...}`), no la trae.
                    currency: data.currency || currency,
                });
            } catch {
                /* red caída → conservar el estático */
            }
        }, 400);
        return () => {
            cancelled = true;
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // staticMin/currency se derivan de formData (ya en key); evitamos re-runs espurios.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return result;
}
