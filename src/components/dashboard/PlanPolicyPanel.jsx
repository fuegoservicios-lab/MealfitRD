// [P1-ARQ25-F4-FORM · 2026-09-03] Pantalla «solicitaste / aplicamos / por qué» (roadmap §6.4 y
// Fase 4): lee `plan_data._plan_policy` (requested / effective / relaxations, Fase 2) y el sello
// `_fidelity_report.mode` (Fase 3) para decir con honestidad si el motor OBEDECIÓ la política
// (`enforce`) o solo la registró (`shadow`). Nunca inventa: si no hay política, no se pinta.
import { useState } from 'react';
import { Compass, ChevronDown, ChevronUp, AlertTriangle, ShoppingBasket, Snowflake, CookingPot, Leaf } from 'lucide-react';
import { useT } from '../../i18n';
import {
    modeLabel, slotLabel, freezerLabel, batchLabel, frequencyLabel, frequencyIdFor, preparationLabel,
    relaxationCopy, relaxationIsBlocking,
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
    const freqText = freq ? frequencyLabel(t, freq) : t('{min}-{max} veces por semana', { min: a.min_per_7d, max: a.max_per_7d });
    const slots = (a.slots || []).map((s) => slotLabel(t, s)).join(' · ');
    const changed = requested && applied && (
        requested.min_per_7d !== applied.min_per_7d || requested.max_per_7d !== applied.max_per_7d
        || (requested.slots || []).join(',') !== (applied.slots || []).join(',')
    );
    return (
        <li className={styles.anchor}>
            <span className={styles.anchorName}>{a.name}</span>
            <span className={styles.anchorMeta}>
                {slots || t('Cualquier comida')} · {freqText} · {preparationLabel(t, a.preparation_mode)}
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

    return (
        <section className={styles.card} aria-labelledby="plan-policy-title">
            <button type="button" className={styles.header} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="plan-policy-body">
                <span className={styles.icon}><Compass size={18} aria-hidden="true" /></span>
                <span className={styles.titleWrap}>
                    <span id="plan-policy-title" className={styles.title}>
                        {enforced ? t('Tu plan sigue tu política') : t('Lo que pediste para tu plan')}
                    </span>
                    <span className={styles.summary}>
                        {modeLabel(t, mode)} · {t('Compra cada {n} días', { n: shop.main_cycle_days ?? 7 })}
                        {shop.fresh_topup_days ? ` · ${t('Frescos cada {n} días', { n: shop.fresh_topup_days })}` : ''}
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
                        <li><ShoppingBasket size={15} aria-hidden="true" /> {t('Compra principal cada {n} días', { n: shop.main_cycle_days ?? 7 })}</li>
                        <li><Leaf size={15} aria-hidden="true" /> {shop.fresh_topup_days ? t('Reposición de frescos cada {n} días', { n: shop.fresh_topup_days }) : t('Sin reposiciones entre compras')}</li>
                        <li><Snowflake size={15} aria-hidden="true" /> {freezerLabel(t, shop.freezer_mode)}</li>
                        <li><CookingPot size={15} aria-hidden="true" /> {batchLabel(t, shop.batch_cooking)}</li>
                    </ul>
                    {anchorIds.length > 0 ? (
                        <>
                            <h4 className={styles.subhead}>{t('Tus básicos')}</h4>
                            <ul className={styles.anchors}>
                                {anchorIds.map((id) => (
                                    <AnchorLine key={id} t={t} requested={reqAnchors.get(id)} applied={appAnchors.get(id)} />
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p className={styles.muted}>{t('No marcaste básicos: el plan varía libremente dentro de tu perfil.')}</p>
                    )}
                    {soft.length > 0 && (
                        <>
                            <h4 className={styles.subhead}>{t('Por qué cambiamos algo')}</h4>
                            <ul className={styles.reasons}>
                                {soft.map((r, i) => <li key={i}>{relaxationCopy(t, r)}</li>)}
                            </ul>
                        </>
                    )}
                    {!enforced && (
                        <p className={styles.muted}>
                            {t('Guardamos estas preferencias con tu plan; el motor las aplica de forma gradual y aquí verás cuándo las sigue al pie de la letra.')}
                        </p>
                    )}
                    {onEdit && (
                        <button type="button" className={styles.editLink} onClick={() => onEdit('mealOrganization')}>
                            {t('Cambiar mis preferencias')}
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
