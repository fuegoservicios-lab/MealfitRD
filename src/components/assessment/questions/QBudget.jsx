// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useEffect } from 'react';
import { UnitToggle } from './_shared';
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard, Input, Label } from '../../common/FormUI';
// [P1-COUNTRY-SYSTEM-F1 · 2026-08-16, fix-round 1] `currencyOptionsForCountry` (qué
// monedas ofrecer) y `effectiveBudgetCurrency` (qué moneda está REALMENTE vigente)
// viven en formValidation.js, no aquí — InteractiveAssessmentFlow.jsx y
// useBudgetFloor.js también las necesitan y ambos ya importan de ese módulo.
// COUNTRY_SYSTEM_UI sigue haciendo falta AQUÍ para pasárselo explícito a currencyOptionsForCountry.
import { budgetCycleDays, currencyOptionsForCountry, effectiveBudgetCurrency } from '../../../config/formValidation';
// [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Mínimo personalizado por las metas (backend).
import { useBudgetFloor } from '../../../hooks/useBudgetFloor';
import { Banknote, Infinity as InfinityIcon, Landmark, SlidersHorizontal, Wallet } from 'lucide-react';
import { formatNumber, useT } from '../../../i18n';
// [P1-COUNTRY-SYSTEM-F1 · 2026-08-16] Bandera dark del frontend (mismo SSOT que
// QCountry.jsx/Settings.jsx).
import { COUNTRY_SYSTEM_UI } from '../../../config/countries';

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
    const t = useT();
    const isCustom = formData.budget === 'custom';
    // [BUDGET-CURRENCY · 2026-05-31] Moneda del monto custom. Default 'DOP'
    // (peso dominicano, RD$) — el usuario puede cambiar a 'USD' (US$). Se envía
    // al backend y `build_budget_context` la usa para el símbolo + escala.
    const budgetCurrency = formData.budgetCurrency || 'DOP';
    // [P1-COUNTRY-SYSTEM-F1 · 2026-08-16] Oscuro (COUNTRY_SYSTEM_UI=false, default) ⇒
    // `options` es EXACTAMENTE [DOP, USD] — el toggle de hoy. Ver `currencyOptionsForCountry`
    // (formValidation.js).
    const { options: currencyOptions } = currencyOptionsForCountry(formData.country, COUNTRY_SYSTEM_UI);
    // [P1-COUNTRY-SYSTEM-F1 · fix-round 1 · review] La moneda REALMENTE vigente — NUNCA
    // `budgetCurrency` crudo. Cierra la ventana de rollback: `budgetCurrency='EUR'` puede
    // sobrevivir en formData/localStorage aunque COUNTRY_SYSTEM_UI se haya apagado de
    // nuevo o el usuario haya cambiado de país sin re-tocar el toggle — en ese caso deja
    // de ser una opción legítima. Símbolo, resaltado del toggle, placeholder y aria-label
    // pasan TODOS por aquí (ver `effectiveBudgetCurrency` en formValidation.js).
    const effectiveCurrency = effectiveBudgetCurrency(formData.country, budgetCurrency);
    const currencySymbol = effectiveCurrency === 'USD' ? 'US$'
        : effectiveCurrency === 'DOP' ? 'RD$'
        : `${effectiveCurrency} `;
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
        return t('≈ {simbolo}{monto} / {dias} días (referencia estimada)', {
            simbolo: currencySymbol,
            monto: formatNumber(Number(ref)),
            dias: cycleDays,
        });
    };
    useEffect(() => {
        if (Number(formData._budgetFloorMin) !== Number(minBudget)) {
            updateData('_budgetFloorMin', minBudget);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [minBudget]);
    // [P1-BUDGET-BANDS-RECALIBRATE · 2026-08-09] Costo típico = la referencia del
    // tier medio que devuelve el backend. Tras la recalibración de bandas esa
    // cifra ES el costo real medido, así que sirve de expectativa sin duplicar
    // ninguna constante aquí. `null` si el fetch no ha vuelto: la frase se omite.
    const typicalCost = tierReferences && Number(tierReferences.medium) > 0
        ? Math.round(Number(tierReferences.medium))
        : null;

    const _amountNum = Number(formData.budgetAmount);
    const belowMin = isCustom && formData.budgetAmount !== '' && formData.budgetAmount != null
        && _amountNum > 0 && _amountNum < minBudget;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                    { val: 'low', label: t('Económico'), desc: t('Lo básico y esencial'), icon: Wallet },
                    { val: 'medium', label: t('Moderado'), desc: t('Equilibrio calidad/precio'), icon: Banknote },
                    { val: 'high', label: t('Alto'), desc: t('Mayor variedad'), icon: Landmark },
                    { val: 'unlimited', label: t('Sin límite'), desc: t('Sin restricciones'), icon: InfinityIcon }
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
                name="budget" value="custom" label={t('Personalizar')}
                desc={t('Define tu monto total de compras')}
                icon={SlidersHorizontal}
                checked={isCustom}
                onChange={() => updateData('budget', 'custom')}
                onClick={() => updateData('budget', 'custom')}
            />
            {isCustom && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Label htmlFor="budgetAmount" style={{ margin: 0 }}>{t('Tu presupuesto total por ciclo de compras')}</Label>
                        {/* [BUDGET-CURRENCY · 2026-05-31] Toggle RD$ (peso dominicano,
                            default) / US$ (dólar). Mismo patrón visual que LB/KG. */}
                        <UnitToggle
                            ariaLabel={t('Moneda del presupuesto')}
                            value={effectiveCurrency}
                            onChange={(v) => updateData('budgetCurrency', v)}
                            options={currencyOptions}
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <span aria-hidden="true" style={{
                            position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.95rem', pointerEvents: 'none'
                        }}>{currencySymbol}</span>
                        <Input
                            id="budgetAmount" type="number" inputMode="numeric"
                            placeholder={
                                effectiveCurrency === 'USD' ? t('Ej. 100')
                                    // [P1-COUNTRY-SYSTEM-F1] EUR reusa el mismo ejemplo que USD (ambos son
                                    // números de 2-3 cifras) — cero clave i18n nueva para esa rama. MXN/COP
                                    // sí necesitan la suya (5000 sería absurdo en COP: ~1/70 del piso real).
                                    : effectiveCurrency === 'EUR' ? t('Ej. 100')
                                        : effectiveCurrency === 'MXN' ? t('Ej. 2000')
                                            : effectiveCurrency === 'COP' ? t('Ej. 400000')
                                                : t('Ej. 5000')
                            }
                            min={minBudget} max={BUDGET_AMOUNT_MAX} step="1"
                            value={formData.budgetAmount || ''}
                            // [P1-BUDGET-INPUT-HARDEN · 2026-07-09] Sanea a entero (sin e/+/-/./absurdos) en cada
                            // cambio (cubre teclado Y paste) + bloquea las teclas inválidas de `type=number`.
                            onChange={(e) => updateData('budgetAmount', sanitizeBudgetAmount(e.target.value))}
                            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault(); }}
                            aria-label={
                                effectiveCurrency === 'USD' ? t('Presupuesto total en dólares')
                                    : effectiveCurrency === 'EUR' ? t('Presupuesto total en euros')
                                        : effectiveCurrency === 'MXN' ? t('Presupuesto total en pesos mexicanos')
                                            : effectiveCurrency === 'COP' ? t('Presupuesto total en pesos colombianos')
                                                : t('Presupuesto total en pesos dominicanos')
                            }
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
                        {/* [P1-BUDGET-BANDS-RECALIBRATE · 2026-08-09] El mensaje da el
                            piso Y la expectativa. Antes solo daba el piso, y eso creaba
                            un hueco medido: el mínimo queda ~15 % POR DEBAJO del costo
                            real típico (piso RD$13.650 vs típico RD$15.747 a 30 días),
                            así que quien ponía exactamente el mínimo veía su plan salir
                            por encima y la reconciliación se lo reprochaba como
                            «excedido». El sistema le aceptaba un número y luego lo
                            regañaba por él.

                            El «típico» sale de `tierReferences.medium` (backend), no de
                            una constante repetida aquí: tras la recalibración esa
                            referencia ES el costo típico medido, así que citarla
                            mantiene un solo sitio de verdad. Si falta (fetch en vuelo o
                            caído) se omite la frase — mejor dar solo el piso que
                            inventar una cifra. */}
                        {/* [P1-I18N-DASHBOARD · 2026-08-15] Cada rama es UNA frase completa
                            en el catálogo (la variante «(según tus calorías y metas)» va
                            dentro de su clave, no concatenada): un fragmento suelto entre
                            paréntesis no se puede traducir sin ver la oración. El formato
                            del número sigue en `en-US` a propósito — cambiarlo aquí sería
                            un cambio de comportamiento, no una traducción. */}
                        {belowMin
                            ? `${t('⚠️ El mínimo para {dias} días es {simbolo}{monto}.', { dias: cycleDays, simbolo: currencySymbol, monto: formatNumber(minBudget) })}${typicalCost ? ` ${t('Un plan típico ronda {simbolo}{monto}.', { simbolo: currencySymbol, monto: formatNumber(typicalCost) })}` : ''} ${t('Súbelo para poder crear un plan viable.')}`
                            : `${t('La IA ajustará los ingredientes para acercarse a este monto.')} ${budgetIsPersonalized
                                ? t('Mínimo {simbolo}{monto} para {dias} días (según tus calorías y metas).', { simbolo: currencySymbol, monto: formatNumber(minBudget), dias: cycleDays })
                                : t('Mínimo {simbolo}{monto} para {dias} días.', { simbolo: currencySymbol, monto: formatNumber(minBudget), dias: cycleDays })
                            }${typicalCost ? ` ${t('Un plan típico ronda {simbolo}{monto}.', { simbolo: currencySymbol, monto: formatNumber(typicalCost) })}` : ''}`}
                    </span>
                </div>
            )}
        </div>
    );
};
