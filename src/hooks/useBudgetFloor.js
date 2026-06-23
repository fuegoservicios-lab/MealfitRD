// [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Hook que devuelve el piso de presupuesto
// PERSONALIZADO por las metas del usuario (calorías objetivo × hogar × ciclo), pidiéndolo al
// backend (`POST /api/plans/budget-floor`) que usa la MISMA `min_budget_for_goals` que el gate
// de generación. Así el formulario y el dashboard muestran el MISMO mínimo que el backend exige
// → cero "422 sorpresa" para usuarios de calorías altas (antes se mostraba el piso a 2000 kcal
// sin escalar). Fail-open: mientras carga o si falla, cae al mínimo ESTÁTICO `minBudgetFor`
// (lower bound, siempre disponible sin red). El valor solo sube al personalizarse (cal_scale>=1).
import { useState, useEffect, useRef } from 'react';
import { api } from '../config/api';
import { minBudgetFor } from '../config/formValidation';

// Campos del form que afectan el piso (biometría + meta + ciclo + moneda + hogar).
const FLOOR_FIELDS = [
    'weight', 'weightUnit', 'height', 'heightUnit', 'age', 'gender',
    'activityLevel', 'mainGoal', 'groceryDuration', 'householdSize', 'budgetCurrency',
];

export function useBudgetFloor(formData) {
    const currency = formData?.budgetCurrency || 'DOP';
    const groceryDuration = formData?.groceryDuration || 'weekly';
    // Fallback estático (sin red): piso a la caloría de referencia, mismo SSOT que el gate base.
    const staticMin = minBudgetFor(currency, groceryDuration);

    const [result, setResult] = useState({ min: staticMin, isPersonalized: false, targetCalories: null });
    const debounceRef = useRef(null);

    // Key estable: solo re-pedimos cuando cambia un campo que mueve el piso.
    const key = FLOOR_FIELDS.map((f) => formData?.[f] ?? '').join('|');

    useEffect(() => {
        // Refleja de inmediato el cambio de duración/moneda con el estático (sin esperar la red).
        // [P1-DASH-BUDGET-AUTOFILL · 2026-06-23] isPersonalized=false hasta que llegue el valor
        // real del backend para ESTOS inputs → el Dashboard espera ese flanco para auto-marcar el
        // monto al mínimo PERSONALIZADO de la nueva duración (no al estático).
        setResult((r) => ({ ...r, min: staticMin, isPersonalized: false }));
        if (debounceRef.current) clearTimeout(debounceRef.current);
        let cancelled = false;
        debounceRef.current = setTimeout(async () => {
            try {
                const body = {};
                FLOOR_FIELDS.forEach((f) => {
                    const v = formData?.[f];
                    if (v != null && v !== '') body[f] = v;
                });
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
                });
            } catch {
                /* red caída → conservar el estático */
            }
        }, 400);
        return () => {
            cancelled = true;
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // staticMin se deriva de currency+groceryDuration (ya en key); evitamos re-runs espurios.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return result;
}
