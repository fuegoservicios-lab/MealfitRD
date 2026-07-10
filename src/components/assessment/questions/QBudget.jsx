// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useEffect } from 'react';
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard, Input, Label } from '../../common/FormUI';
import { budgetCycleDays } from '../../../config/formValidation';
// [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Mínimo personalizado por las metas (backend).
import { useBudgetFloor } from '../../../hooks/useBudgetFloor';
import { Banknote, Infinity as InfinityIcon, Landmark, SlidersHorizontal, Wallet } from 'lucide-react';

// [P1-BUDGET-INPUT-HARDEN · 2026-07-09] Sanea el monto custom a ENTERO de dígitos (un presupuesto total
// es un número redondo, sin centavos/exponentes/negativos): descarta todo lo no-dígito, quita ceros a la
// izquierda y capea a BUDGET_AMOUNT_MAX para prevenir desbordes / fat-finger (el tier "Sin límite" cubre el
// caso legítimo sin-cap). Blinda contra `type=number` que acepta `e`/`+`/`-`/`.` y valores absurdos por
// teclado o paste. Devuelve string ('' si vacío) — el resto del flujo ya usa Number(budgetAmount).
export const BUDGET_AMOUNT_MAX = 100_000_000; // techo defensivo (RD$/US$); "Sin límite" es el caso real sin cap
export function sanitizeBudgetAmount(raw) {
    const digits = String(raw ?? '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
    if (!digits) return '';
    return String(Math.min(Number(digits), BUDGET_AMOUNT_MAX));
}

export const QBudget = ({ onAutoAdvance }) => {
    const { formData, updateData } = useAssessment();
    const isCustom = formData.budget === 'custom';
    // [BUDGET-CURRENCY · 2026-05-31] Moneda del monto custom. Default 'DOP'
    // (peso dominicano, RD$) — el usuario puede cambiar a 'USD' (US$). Se envía
    // al backend y `build_budget_context` la usa para el símbolo + escala.
    const budgetCurrency = formData.budgetCurrency || 'DOP';
    const currencySymbol = budgetCurrency === 'USD' ? 'US$' : 'RD$';
    // [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Mínimo PERSONALIZADO por las metas (calorías ×
    // hogar × ciclo) vía backend — el MISMO número que exige el gate de generación; fail-open al
    // estático mientras carga / si falla. Lo sincronizamos a `_budgetFloorMin` para que el gate
    // "Siguiente Paso" (validateExtra del flow) use EXACTAMENTE el mismo piso que mostramos
    // (evita "warning pero puede avanzar" → luego 422 del backend).
    const { min: minBudget, isPersonalized: budgetIsPersonalized, tierReferences } = useBudgetFloor(formData);
    const cycleDays = budgetCycleDays(formData.groceryDuration);
    // [P2-AUDIT-V6-BATCH · 2026-07-03] (P2-I) Referencia estimada por ciclo de cada tier categórico
    // (misma fórmula piso×banda del banner del Dashboard) → el usuario ve el "RD$Y" contra el que
    // se comparará su plan ANTES de elegir el tier, en vez de descubrirlo en el banner.
    const tierRefLabel = (val) => {
        const ref = tierReferences && tierReferences[val];
        if (!ref || !(ref > 0)) return null;
        return `≈ ${currencySymbol}${Number(ref).toLocaleString('en-US')} / ${cycleDays} días (referencia estimada)`;
    };
    useEffect(() => {
        if (Number(formData._budgetFloorMin) !== Number(minBudget)) {
            updateData('_budgetFloorMin', minBudget);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [minBudget]);
    const _amountNum = Number(formData.budgetAmount);
    const belowMin = isCustom && formData.budgetAmount !== '' && formData.budgetAmount != null
        && _amountNum > 0 && _amountNum < minBudget;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                    { val: 'low', label: 'Económico', desc: 'Lo básico y esencial', icon: Wallet },
                    { val: 'medium', label: 'Moderado', desc: 'Equilibrio calidad/precio', icon: Banknote },
                    { val: 'high', label: 'Alto', desc: 'Mayor variedad', icon: Landmark },
                    { val: 'unlimited', label: 'Sin límite', desc: 'Sin restricciones', icon: InfinityIcon }
                ].map(opt => (
                    <RadioCard
                        key={opt.val} name="budget" value={opt.val} label={opt.label}
                        desc={tierRefLabel(opt.val) ? `${opt.desc} · ${tierRefLabel(opt.val)}` : opt.desc}
                        icon={opt.icon}
                        checked={formData.budget === opt.val}
                        onChange={(e) => { updateData('budget', e.target.value); onAutoAdvance(); }}
                        onClick={() => { if (formData.budget === opt.val) onAutoAdvance(); }}
                    />
                ))}
            </div>
            {/* [BUDGET-CUSTOM · 2026-05-31] "Personalizar": el usuario define su
                monto total de compras (RD$). NO auto-avanza — escribe el monto y
                avanza con el botón externo "Siguiente Paso" (gateado por
                `validateExtra` en InteractiveAssessmentFlow). `budget='custom'` +
                `budgetAmount` se envían al backend, que los inyecta al prompt del
                LLM (`build_budget_context`) para ajustar ingredientes al presupuesto. */}
            <RadioCard
                name="budget" value="custom" label="Personalizar"
                desc="Define tu monto total de compras"
                icon={SlidersHorizontal}
                checked={isCustom}
                onChange={() => updateData('budget', 'custom')}
                onClick={() => updateData('budget', 'custom')}
            />
            {isCustom && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Label htmlFor="budgetAmount" style={{ margin: 0 }}>Tu presupuesto total por ciclo de compras</Label>
                        {/* [BUDGET-CURRENCY · 2026-05-31] Toggle RD$ (peso dominicano,
                            default) / US$ (dólar). Mismo patrón visual que LB/KG. */}
                        <div style={{ display: 'flex', background: 'var(--bg-muted)', borderRadius: '0.5rem', padding: '3px', flexShrink: 0 }}>
                            <button
                                type="button"
                                onClick={() => updateData('budgetCurrency', 'DOP')}
                                aria-pressed={budgetCurrency !== 'USD'}
                                style={{ border: 'none', background: budgetCurrency !== 'USD' ? 'var(--bg-card)' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: budgetCurrency !== 'USD' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                            >RD$</button>
                            <button
                                type="button"
                                onClick={() => updateData('budgetCurrency', 'USD')}
                                aria-pressed={budgetCurrency === 'USD'}
                                style={{ border: 'none', background: budgetCurrency === 'USD' ? 'var(--bg-card)' : 'transparent', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: budgetCurrency === 'USD' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                            >US$</button>
                        </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <span aria-hidden="true" style={{
                            position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.95rem', pointerEvents: 'none'
                        }}>{currencySymbol}</span>
                        <Input
                            id="budgetAmount" type="number" inputMode="numeric"
                            placeholder={budgetCurrency === 'USD' ? 'Ej. 100' : 'Ej. 5000'}
                            min={minBudget} max={BUDGET_AMOUNT_MAX} step="1"
                            value={formData.budgetAmount || ''}
                            // [P1-BUDGET-INPUT-HARDEN · 2026-07-09] Sanea a entero (sin e/+/-/./absurdos) en cada
                            // cambio (cubre teclado Y paste) + bloquea las teclas inválidas de `type=number`.
                            onChange={(e) => updateData('budgetAmount', sanitizeBudgetAmount(e.target.value))}
                            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault(); }}
                            aria-label={`Presupuesto total en ${budgetCurrency === 'USD' ? 'dólares' : 'pesos dominicanos'}`}
                            aria-required="true"
                            aria-invalid={belowMin || undefined}
                            aria-describedby="budgetAmountHelp"
                            autoComplete="off"
                            style={{ paddingLeft: '3.25rem', ...(belowMin ? { borderColor: 'var(--warning)' } : {}) }}
                        />
                    </div>
                    {/* [P1-BUDGET-A11Y · 2026-07-09] Mensaje ÚNICO con id estable (aria-describedby del input) +
                        aria-live: el lector de pantalla anuncia el cambio below-min/válido sin re-enfocar. */}
                    <span
                        id="budgetAmountHelp"
                        role={belowMin ? 'alert' : undefined}
                        aria-live="polite"
                        style={{
                            fontSize: '0.75rem', lineHeight: 1.4,
                            color: belowMin ? 'var(--warning)' : 'var(--text-muted)',
                            fontWeight: belowMin ? 600 : 400,
                        }}
                    >
                        {belowMin
                            ? `⚠️ El mínimo para ${cycleDays} días es ${currencySymbol}${minBudget.toLocaleString('en-US')}. Súbelo para poder crear un plan viable.`
                            : `La IA ajustará los ingredientes para acercarse a este monto. Mínimo ${currencySymbol}${minBudget.toLocaleString('en-US')} para ${cycleDays} días${budgetIsPersonalized ? ' (según tus calorías y metas)' : ''}.`}
                    </span>
                </div>
            )}
        </div>
    );
};
