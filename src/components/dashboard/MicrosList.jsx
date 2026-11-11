import { useState } from 'react';
import PropTypes from 'prop-types';
import { BookOpen, ChevronDown, FlaskConical, Info } from 'lucide-react';
import { useT, formatPercent } from '../../i18n';
import { healthSourcesFor } from '../../data/healthSources';
import { HealthSourcesPanel } from '../common/HealthSources';
import { formatoMicro, filasMicros, cantidadMicro, coberturaMicro, fuentesAgrupadas } from './microsShared';
import styles from './MicrosList.module.css';

const MINERALS = new Set(['sodium_mg', 'potassium_mg', 'calcium_mg', 'iron_mg', 'magnesium_mg', 'zinc_mg', 'selenium_mcg', 'iodine_mcg']);

/** Organismo de la referencia en el idioma de la app («WHO» → «OMS»); RDA/AI/DRI son siglas técnicas. */
const organismo = (tipo, t) => (tipo === 'WHO' ? t('OMS') : tipo || 'DRI');

/** [MICROS-ORIGEN · 2026-11-11] El detalle de un nutriente: de dónde vino, qué falta y con qué se calculó. */
const DetalleNutriente = ({ f, unit, value, cov, meta, target, techo, partial, t }) => {
    const top = Array.isArray(cov.top) ? cov.top : [];
    const otros = cov.others && cov.others.count > 0 ? cov.others : null;
    const faltan = Array.isArray(cov.missing) ? cov.missing : [];
    const base = value && value > 0 ? value : 0;
    const parte = (v) => (base > 0 ? Math.round((v / base) * 100) : 0);
    const fuentes = fuentesAgrupadas(cov.sources, t);
    const dominante = techo && top.length > 1 && parte(top[0].value) >= 30 ? top[0] : null;
    return <div className={styles.evidenceBody}>
        {value === null
            ? <p>{t('Ninguna comida registrada trae este dato todavía.')}</p>
            : partial
                ? <p>{t('Calculado con {known} de {total} comidas. Lo que no tiene datos no se suma, así que el total real puede ser mayor.', { known: cov.known, total: cov.total })}</p>
                : <p>{t('Calculado con todas tus comidas registradas.')}</p>}
        {top.length > 0 && <>
            <p className={styles.originTitle}>{t('Lo que más aportó')}</p>
            <ol className={styles.origin}>
                {top.map((a, i) => <li key={`${a.food}-${i}`} className={styles.originRow}>
                    <span className={styles.originName}>
                        <span className={styles.originFood}>{a.food}</span>
                        {a.meal && a.meal !== a.food && <span className={styles.originMeal}>{a.meal}</span>}
                    </span>
                    <span className={styles.originValue}>{formatoMicro(a.value, unit)} {unit}<small>{formatPercent(parte(a.value))}</small></span>
                    <span className={styles.originBar} aria-hidden="true"><span style={{ width: `${Math.max(2, parte(a.value))}%` }} /></span>
                </li>)}
                {otros && <li className={`${styles.originRow} ${styles.originOthers}`}>
                    <span className={styles.originName}><span className={styles.originFood}>{t('Otros alimentos ({n})', { n: otros.count })}</span></span>
                    <span className={styles.originValue}>{formatoMicro(otros.value, unit)} {unit}<small>{formatPercent(parte(otros.value))}</small></span>
                </li>}
            </ol>
            {dominante && <p className={styles.insight}>{t('{food} aportó el {pct} de tu {nutrient} registrado.', { food: dominante.food, pct: formatPercent(parte(dominante.value)), nutrient: f.label.toLowerCase() })}</p>}
        </>}
        {faltan.length > 0 && <>
            <p className={styles.originTitle}>{t('Sin datos de {nutrient}', { nutrient: f.label.toLowerCase() })}</p>
            <ul className={styles.missing}>
                {faltan.map((m, i) => <li key={`${m.meal}-${i}`}>
                    <b>{m.meal || t('Comida sin nombre')}</b>{' · '}<span>{m.whole_meal ? t('toda la comida (foto o registro sin ingredientes)') : m.foods.join(', ')}</span>
                </li>)}
            </ul>
        </>}
        {meta && <p className={styles.reference}>{techo ? t('Máximo recomendado') : t('Referencia diaria')}: {formatoMicro(target, unit)} {unit} · {organismo(meta.reference_type, t)}
            {meta.source && <> · <a href={meta.source} target="_blank" rel="noopener noreferrer">{t('Ver la referencia')} ↗</a></>}</p>}
        {f.key === 'folate_mcg' && <p>{t('DFE: equivalentes de folato dietético; no es la cantidad de ácido fólico.')}</p>}
        {f.key === 'vit_e_mg' && <p>{t('Vitamina E expresada como alfa-tocoferol.')}</p>}
        {fuentes.length > 0 && <p className={styles.sources}>{t('Composición')}: {fuentes.map((g, i) => <span key={g.nombre}>{i > 0 ? ' · ' : ''}{g.url ? <a href={g.url} target="_blank" rel="noopener noreferrer">{g.nombre}</a> : g.nombre}{g.n > 1 ? ` (${g.n})` : ''}</span>)}</p>}
    </div>;
};
DetalleNutriente.propTypes = { f: PropTypes.object, unit: PropTypes.string, value: PropTypes.number, cov: PropTypes.object, meta: PropTypes.object, target: PropTypes.number, techo: PropTypes.bool, partial: PropTypes.bool, t: PropTypes.func };
const MicrosList = ({ micros, coverage, metas, compact = false, showNotes = true, sourcesContext = null }) => {
    const t = useT();
    const [expanded, setExpanded] = useState(false);
    const [group, setGroup] = useState('all');
    const [panel, setPanel] = useState(null);
    // El detalle se monta al abrirlo: 17 listas ocultas inflaban el DOM y repetían nombres de comidas.
    const [abiertos, setAbiertos] = useState(() => new Set());
    const alternar = (key, open) => setAbiertos((prev) => { const n = new Set(prev); if (open) n.add(key); else n.delete(key); return n; });
    const nSources = sourcesContext ? healthSourcesFor(sourcesContext, '').length : 0;
    const rows = filasMicros(t);
    const visible = (expanded ? rows : rows.slice(0, 8)).filter((f) => group === 'all' || (group === 'minerals' ? MINERALS.has(f.key) : f.key !== 'fiber_g' && !MINERALS.has(f.key)));
    const hayMetas = !!(metas && Object.keys(metas).length);
    return <div className={`${styles.wrap} ${compact ? styles.compact : ''}`}>
        {expanded && <div className={styles.filters} role="group" aria-label={t('Grupo de nutrientes')}>
            {[['all', t('Todos')], ['minerals', t('Minerales')], ['vitamins', t('Vitaminas')]].map(([id, label]) => <button type="button" key={id} aria-pressed={group === id} onClick={() => setGroup(id)}>{label}</button>)}
        </div>}
        <ul className={styles.list}>{visible.map((f) => {
            const value = cantidadMicro(micros?.[f.key]);
            const cov = coberturaMicro(f.key, value, coverage);
            const meta = metas?.[f.key];
            const target = cantidadMicro(meta?.target) || 0;
            const ratio = value !== null && target > 0 ? value / target : 0;
            const techo = meta?.kind === 'ceiling';
            const partial = cov.status === 'partial';
            const status = value === null ? t('Sin datos') : partial ? t('Datos parciales') : t('Con datos');
            const unit = f.key === 'vit_a_mcg' ? 'mcg RAE' : f.unit;
            const state = value === null || !target ? '' : techo ? (ratio > 1 ? styles.over : ratio > .85 ? styles.near : styles.ok) : ratio >= 1 ? styles.done : '';
            return <li className={styles.row} key={f.key}>
                <div className={styles.rowTop}>
                    <span className={styles.label}>{f.label}{techo && <span className={styles.tag} title={t('Máximo recomendado')}>{t('máx.')}</span>}</span>
                    <span className={styles.value}><b>{formatoMicro(value, unit)}{partial && value !== null ? <span className={styles.atLeast} title={t('Al menos: faltan datos de alguna comida')}>+</span> : ''}</b>{target > 0 ? ` / ${formatoMicro(target, unit)}` : ''} {unit}</span>
                </div>
                <div className={styles.track} {...(value !== null && target > 0 ? { role: 'progressbar', 'aria-label': f.label, 'aria-valuemin': 0, 'aria-valuemax': target, 'aria-valuenow': Math.min(value, target), 'aria-valuetext': `${partial ? t('al menos') + ' ' : ''}${formatoMicro(value, unit)} ${unit} · ${status}` } : {})}>
                    <div className={`${styles.fill} ${state}`} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
                    {/* Pasado el máximo, la barra se reescala: la marca indica dónde queda el límite. */}
                    {techo && ratio > 1 && <span className={styles.limitMark} style={{ left: `${Math.round(100 / ratio)}%` }} aria-hidden="true" />}
                </div>
                <details className={styles.evidence} onToggle={(e) => alternar(f.key, e.currentTarget.open)}>
                    <summary>
                        <span className={`${styles.dot} ${value === null ? styles.dotNone : partial ? styles.dotPartial : styles.dotFull}`} aria-hidden="true" />
                        <span>{status}</span>
                        <ChevronDown className={styles.evidenceChevron} size={14} strokeWidth={2.2} aria-hidden="true" />
                    </summary>
                    {abiertos.has(f.key) && <DetalleNutriente f={f} unit={unit} value={value} cov={cov} meta={meta} target={target} techo={techo} partial={partial} t={t} />}
                </details>
                {techo && value !== null && target > 0 && value > target && <span className={styles.limitNote}>{`${t('{n} {unit} sobre el máximo recomendado ({pct})', { n: formatoMicro(value - target, unit), unit, pct: formatPercent(Math.round(ratio * 100)) })}${partial ? ` · ${t('puede ser más')}` : ''}`}</span>}
                {!compact && techo && !partial && value !== null && target > value && <span className={styles.ceilingRemaining}>{t('A {n} {unit} del máximo recomendado', { n: formatoMicro(target - value, unit), unit })}</span>}
            </li>;
        })}</ul>
        <button type="button" className={styles.expand} aria-expanded={expanded} onClick={() => { setExpanded(!expanded); setGroup('all'); }}>
            <span className={styles.expandIcon} aria-hidden="true"><FlaskConical size={17} strokeWidth={2.2} /></span>
            <span className={styles.expandLabel}>{expanded ? t('Mostrar menos') : t('Ver todos los nutrientes')}</span>
            <span className={styles.expandCount} aria-hidden="true">{rows.length}</span>
            <ChevronDown className={styles.expandChevron} size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {/* Pie discreto: «Sobre los datos» y «Fuentes» en una sola fila; se abre un panel debajo. */}
        {showNotes && <div className={styles.footer}>
            <div className={styles.footerLinks}>
                <button type="button" className={styles.footerLink} aria-expanded={panel === 'refs'} aria-controls="micros-panel" onClick={() => setPanel(panel === 'refs' ? null : 'refs')}>
                    <Info size={14} aria-hidden="true" />
                    <span>{t('Sobre los datos')}</span>
                    <ChevronDown className={styles.footerChevron} size={13} strokeWidth={2.2} aria-hidden="true" />
                </button>
                {nSources > 0 && <>
                    <span className={styles.footerSep} aria-hidden="true">·</span>
                    <button type="button" className={styles.footerLink} aria-expanded={panel === 'sources'} aria-controls="micros-panel" aria-label={t('Fuentes de salud y nutrición')} onClick={() => setPanel(panel === 'sources' ? null : 'sources')}>
                        <BookOpen size={14} aria-hidden="true" />
                        <span>{t('Fuentes')} ({nSources})</span>
                        <ChevronDown className={styles.footerChevron} size={13} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                </>}
            </div>
            {panel && <div id="micros-panel" className={styles.explanationBody}>
                {panel === 'refs' ? <>
                    <p>{t('Las referencias diarias orientan tu alimentación; superarlas no significa peligro. No son un diagnóstico ni un límite universal de seguridad.')}</p>
                    <p>{t('El máximo de magnesio se aplica a suplementos, no al magnesio de los alimentos. B12 no tiene un máximo establecido; el folato requiere distinguir su forma.')}</p>
                    <p>{t('Los datos se calculan con los ingredientes registrados y el catálogo. Las fotos sin ingredientes pueden quedar sin datos. Una actualización del catálogo puede corregir días anteriores.')}</p>
                </> : <HealthSourcesPanel context={sourcesContext} />}
            </div>}
        </div>}
        {showNotes && !hayMetas && <p className={styles.note}>{t('Sin metas todavía: completa sexo y edad en Configuración.')}</p>}
    </div>;
};
MicrosList.propTypes = { micros: PropTypes.object, coverage: PropTypes.object, metas: PropTypes.object, compact: PropTypes.bool, showNotes: PropTypes.bool, sourcesContext: PropTypes.string };
export default MicrosList;
