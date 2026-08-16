// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { useEffect } from 'react';
import { UnitToggle } from './_shared';
import { useAssessment } from '../../../context/AssessmentContext';
import { RadioCard, Input, Label } from '../../common/FormUI';
import { budgetCycleDays } from '../../../config/formValidation';
// [P1-BUDGET-FLOOR-PERSONALIZED · 2026-06-23] Mínimo personalizado por las metas (backend).
import { useBudgetFloor } from '../../../hooks/useBudgetFloor';
import { Banknote, Infinity as InfinityIcon, Landmark, SlidersHorizontal, Wallet } from 'lucide-react';
import { useT } from '../../../i18n';
// [P1-COUNTRY-SYSTEM-F1 · 2026-08-16] Bandera dark del frontend + normalizador de país
// (mismo SSOT que QCountry.jsx/Settings.jsx). NO se importa `COUNTRY_PROFILES` de
// backend (no existe del lado JS) — la moneda por país beta vive en
// `BETA_CURRENCY_BY_COUNTRY` abajo, acotada a los 3 pares que activan un toggle nuevo.
import { COUNTRY_SYSTEM_UI, coerceCountry } from '../../../config/countries';

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

// [P1-COUNTRY-SYSTEM-F1 · 2026-08-16] Moneda del perfil BETA de cada país — espejo
// minimal de `COUNTRY_PROFILES[cc]['currency']` (backend constants.py), acotado a los
// 3 pares que habilitan una moneda nueva AQUÍ (ES→EUR, MX→MXN, CO→COP). US/PR ya usan
// USD (toggle preexistente, no se duplica); DO usa DOP (toggle preexistente). NO vive
// en config/countries.js (SSOT del spine F0, fuera del alcance de F1-T6) — un drift
// contra COUNTRY_PROFILES lo detecta test_p1_country_system_f1.py (sección T6).
export const BETA_CURRENCY_BY_COUNTRY = { ES: 'EUR', MX: 'MXN', CO: 'COP' };

/**
 * [P1-COUNTRY-SYSTEM-F1] Qué monedas ofrece el toggle de presupuesto. PURA —
 * sin AssessmentContext/fetch/i18n — exportada para test unitario ligero
 * (QBudget.p1_country_system_f1.test.jsx) sin montar el componente, mismo
 * patrón que `sanitizeBudgetAmount`.
 *
 * `countrySystemUI=false` (oscuro, default) ⇒ `betaCurrency` SIEMPRE undefined
 * y `options` es EXACTAMENTE [DOP, USD] — el toggle de hoy, byte-idéntico,
 * sin importar el país. Encendido + país beta con moneda propia (ES/MX/CO) ⇒
 * 3ª opción con el código de esa moneda. DO (nativo) y US/PR (ya usan USD)
 * quedan en [DOP, USD] incluso encendido — no hay moneda nueva que ofrecerles.
 */
export function currencyOptionsForCountry(rawCountry, countrySystemUI) {
    const betaCurrency = countrySystemUI ? BETA_CURRENCY_BY_COUNTRY[coerceCountry(rawCountry)] : undefined;
    return {
        betaCurrency,
        options: [
            { value: 'DOP', label: 'RD$' },
            { value: 'USD', label: 'US$' },
            ...(betaCurrency ? [{ value: betaCurrency, label: betaCurrency }] : []),
        ],
    };
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
    // `betaCurrency` siempre undefined y `currencyOptions` es EXACTAMENTE [DOP, USD] —
    // el toggle de hoy. Ver `currencyOptionsForCountry` arriba.
    const { betaCurrency, options: currencyOptions } = currencyOptionsForCountry(formData.country, COUNTRY_SYSTEM_UI);
    const currencySymbol = budgetCurrency === 'USD' ? 'US$'
        : (betaCurrency && budgetCurrency === betaCurrency) ? `${betaCurrency} `
        : 'RD$';
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
            monto: Number(ref).toLocaleString('en-US'),
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
                            value={currencyOptions.some((o) => o.value === budgetCurrency) ? budgetCurrency : 'DOP'}
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
                                budgetCurrency === 'USD' ? t('Ej. 100')
                                    // [P1-COUNTRY-SYSTEM-F1] EUR reusa el mismo ejemplo que USD (ambos son
                                    // números de 2-3 cifras) — cero clave i18n nueva para esa rama. MXN/COP
                                    // sí necesitan la suya (5000 sería absurdo en COP: ~1/70 del piso real).
                                    : budgetCurrency === 'EUR' ? t('Ej. 100')
                                        : budgetCurrency === 'MXN' ? t('Ej. 2000')
                                            : budgetCurrency === 'COP' ? t('Ej. 400000')
                                                : t('Ej. 5000')
                            }
                            min={minBudget} max={BUDGET_AMOUNT_MAX} step="1"
                            value={formData.budgetAmount || ''}
                            // [P1-BUDGET-INPUT-HARDEN · 2026-07-09] Sanea a entero (sin e/+/-/./absurdos) en cada
                            // cambio (cubre teclado Y paste) + bloquea las teclas inválidas de `type=number`.
                            onChange={(e) => updateData('budgetAmount', sanitizeBudgetAmount(e.target.value))}
                            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault(); }}
                            aria-label={
                                budgetCurrency === 'USD' ? t('Presupuesto total en dólares')
                                    : budgetCurrency === 'EUR' ? t('Presupuesto total en euros')
                                        : budgetCurrency === 'MXN' ? t('Presupuesto total en pesos mexicanos')
                                            : budgetCurrency === 'COP' ? t('Presupuesto total en pesos colombianos')
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
                            ? `${t('⚠️ El mínimo para {dias} días es {simbolo}{monto}.', { dias: cycleDays, simbolo: currencySymbol, monto: minBudget.toLocaleString('en-US') })}${typicalCost ? ` ${t('Un plan típico ronda {simbolo}{monto}.', { simbolo: currencySymbol, monto: typicalCost.toLocaleString('en-US') })}` : ''} ${t('Súbelo para poder crear un plan viable.')}`
                            : `${t('La IA ajustará los ingredientes para acercarse a este monto.')} ${budgetIsPersonalized
                                ? t('Mínimo {simbolo}{monto} para {dias} días (según tus calorías y metas).', { simbolo: currencySymbol, monto: minBudget.toLocaleString('en-US'), dias: cycleDays })
                                : t('Mínimo {simbolo}{monto} para {dias} días.', { simbolo: currencySymbol, monto: minBudget.toLocaleString('en-US'), dias: cycleDays })
                            }${typicalCost ? ` ${t('Un plan típico ronda {simbolo}{monto}.', { simbolo: currencySymbol, monto: typicalCost.toLocaleString('en-US') })}` : ''}`}
                    </span>
                </div>
            )}
        </div>
    );
};
