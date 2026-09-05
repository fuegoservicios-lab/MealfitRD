// [P1-ARQ25-F4-FORM · 2026-09-03] Pantalla «solicitaste / aplicamos / por qué» (roadmap §6.4 y
// Fase 4): lee `plan_data._plan_policy` (requested / effective / relaxations, Fase 2) y el sello
// `_fidelity_report.mode` (Fase 3) para decir con honestidad si el motor OBEDECIÓ la política
// (`enforce`) o solo la registró (`shadow`). Nunca inventa: si no hay política, no se pinta.
import { useState } from 'react';
import { Compass, ChevronDown, ChevronUp, AlertTriangle, ShoppingBasket, Snowflake, CookingPot, Leaf, Utensils, SlidersHorizontal } from 'lucide-react';
// [P1-ARQ25-F7-CULTURE · 2026-09-05] «Cocina: dominicana 70 % · española 30 %» desde culture_weights.
import { cultureWeightsSummary, cultureForCountry } from '../../config/cultures';
import { useT } from '../../i18n';
import {
    slotLabel, freezerFact, batchFact, topupFact, frequencyLabel, frequencyIdFor,
    relaxationCopy, relaxationTitle, relaxationIsBlocking,
} from '../../config/planPolicy';
import styles from './PlanPolicyPanel.module.css';

const _anchorsById = (policy) => {
    const map = new Map();
    for (const a of policy?.food_anchors || []) if (a?.ingredient_id) map.set(a.ingredient_id, a);
    return map;
};

const AnchorLine = ({ t, requested, applied }) => {
    const a = applied || requested;
    const freq = frequencyIdFor(a.min_per_7d, a.max_per_7d);
    // [P2-POLICY-PANEL-COPY · 2026-09-05] «2-7 veces por semana · Cualquier comida · Preparación variada» era una
    // ficha técnica. Se lee como una frase: «De 2 a 7 veces por semana · En distintas comidas y preparaciones».
    const freqText = freq ? frequencyLabel(t, freq) : t('De {min} a {max} veces por semana', { min: a.min_per_7d, max: a.max_per_7d });
    const slots = (a.slots || []).map((s) => slotLabel(t, s)).join(' · ');
    const changed = requested && applied && (
        requested.min_per_7d !== applied.min_per_7d || requested.max_per_7d !== applied.max_per_7d
        || (requested.slots || []).join(',') !== (applied.slots || []).join(',')
    );
    return (
        <li className={styles.anchor}>
            <span className={styles.anchorName}>{a.name}</span>
            <span className={styles.anchorMeta}>
                {freqText} · {slots
                    ? t('En {slots}', { slots })
                    : (a.preparation_mode === 'same_preparation'
                        ? t('En distintas comidas, siempre igual')
                        : t('En distintas comidas y preparaciones'))}
            </span>
            {changed && (
                <span className={styles.anchorDelta}>
                    {t('Solicitaste {min}-{max}; aplicamos {amin}-{amax}.', {
                        min: requested.min_per_7d, max: requested.max_per_7d, amin: applied.min_per_7d, amax: applied.max_per_7d,
                    })}
                </span>
            )}
            {requested && !applied && <span className={styles.anchorDelta}>{t('No se aplicó (ver motivos).')}</span>}
        </li>
    );
};

export default function PlanPolicyPanel({ policy, fidelity = null, onEdit = null }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const effective = policy?.effective;
    if (!effective || !effective.recurrence) return null;
    const requested = policy?.requested || {};
    const relaxations = Array.isArray(policy?.relaxations) ? policy.relaxations : [];
    const enforced = fidelity?.mode === 'enforce' || fidelity?.enforced === true;
    const mode = effective.recurrence?.global_mode;
    const shop = effective.shopping || {};
    const reqAnchors = _anchorsById(requested);
    const appAnchors = _anchorsById(effective);
    const anchorIds = [...new Set([...reqAnchors.keys(), ...appAnchors.keys()])];
    const blocking = relaxations.filter(relaxationIsBlocking);
    const soft = relaxations.filter((r) => !relaxationIsBlocking(r));
    const count = relaxations.length;
    const cultureText = cultureWeightsSummary(t, effective.culture_weights);
    const cultureIsMarketDefault = Array.isArray(effective.culture_weights) && effective.culture_weights.length === 1
        && effective.culture_weights[0]?.profile_id === cultureForCountry(effective.market_country);

    return (
        <section className={styles.card} aria-labelledby="plan-policy-title">
            <button type="button" className={styles.header} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="plan-policy-body">
                <span className={styles.icon}><Compass size={18} aria-hidden="true" /></span>
                <span className={styles.titleWrap}>
                    {/* [P2-POLICY-PANEL-COPY · 2026-09-05] «Tu plan sigue tu política» / «Rutina · Compra cada 15
                        días» hablaba el idioma del motor (política, modo de recurrencia). El usuario reconoce su
                        plan, no su política: título en su lengua y subtítulo con lo que de verdad organiza su
                        semana. La cocina vive en su fila (repetirla arriba la mostraba dos veces). */}
                    <span id="plan-policy-title" className={styles.title}>
                        {enforced ? t('Tu plan, a tu medida') : t('Lo que pediste para tu plan')}
                    </span>
                    <span className={styles.summary}>
                        {t('Organizado para comprar cada {n} días', { n: shop.main_cycle_days ?? 7 })}
                    </span>
                </span>
                {count > 0 && (
                    <span className={blocking.length ? styles.badgeWarn : styles.badge}>
                        {t('{n} ajustes', { n: count })}
                    </span>
                )}
                {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
            </button>

            {blocking.length > 0 && (
                <div className={styles.blocking} role="alert">
                    <AlertTriangle size={18} aria-hidden="true" />
                    <div>
                        <strong>{t('Necesitamos tu decisión')}</strong>
                        <ul className={styles.plain}>
                            {blocking.map((r, i) => <li key={i}>{relaxationCopy(t, r)}</li>)}
                        </ul>
                        {onEdit && (
                            <button type="button" className={styles.editBtn} onClick={() => onEdit(blocking[0]?.field || 'budget')}>
                                {t('Ajustar en el formulario')}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {open && (
                <div id="plan-policy-body" className={styles.body}>
                    <ul className={styles.facts}>
                        <li><ShoppingBasket size={15} aria-hidden="true" />
                            <span><b>{t('Compra principal:')}</b> {t('cada {n} días', { n: shop.main_cycle_days ?? 7 })}</span></li>
                        <li><Leaf size={15} aria-hidden="true" /> <span>{topupFact(t, shop.fresh_topup_days)}</span></li>
                        <li><Snowflake size={15} aria-hidden="true" /> <span>{freezerFact(t, shop.freezer_mode)}</span></li>
                        <li><CookingPot size={15} aria-hidden="true" /> <span>{batchFact(t, shop.batch_cooking)}</span></li>
                        {/* [P2-POLICY-PANEL-UI · 2026-09-05 · r2] Sin la etiqueta «Cocina:»: los nombres de perfil YA
                            empiezan por «Cocina …» («Cocina estadounidense cotidiana»), así que la fila leía «Cocina:
                            Cocina estadounidense cotidiana». El icono de cubiertos da el contexto. */}
                        {cultureText && (
                            <li><Utensils size={15} aria-hidden="true" />
                                <span><b>{t('Estilo de cocina:')}</b> {cultureIsMarketDefault
                                    ? t('{resumen} (la de tu país de compra)', { resumen: cultureText })
                                    : cultureText}</span></li>
                        )}
                    </ul>
                    {anchorIds.length > 0 ? (
                        <>
                            <h4 className={styles.subhead}>{t('Tus alimentos habituales')}</h4>
                            <ul className={styles.anchors}>
                                {anchorIds.map((id) => (
                                    <AnchorLine key={id} t={t} requested={reqAnchors.get(id)} applied={appAnchors.get(id)} />
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p className={styles.muted}>{t('No marcaste alimentos habituales: el plan varía libremente dentro de tu perfil.')}</p>
                    )}
                    {soft.length > 0 && (
                        <>
                            <h4 className={styles.subhead}>{t('Así adaptamos tu plan')}</h4>
                            <ul className={styles.reasons}>
                                {soft.map((r, i) => (
                                    <li key={i}>
                                        <span className={styles.reasonTitle}>{relaxationTitle(t, r)}</span>
                                        <span className={styles.reasonDetail}>{relaxationCopy(t, r)}</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    {!enforced && (
                        <p className={styles.muted}>
                            {t('Guardamos estas preferencias con tu plan; el motor las aplica de forma gradual y aquí verás cuándo las sigue al pie de la letra.')}
                        </p>
                    )}
                    {onEdit && (
                        <button type="button" className={styles.editCta} onClick={() => onEdit('mealOrganization')}>
                            <SlidersHorizontal size={15} aria-hidden="true" />
                            {t('Ajustar mi plan')}
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
