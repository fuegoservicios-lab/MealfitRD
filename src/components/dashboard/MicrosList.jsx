import { useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, FlaskConical } from 'lucide-react';
import { useT } from '../../i18n';
import { formatoMicro, filasMicros, cantidadMicro, coberturaMicro } from './microsShared';
import styles from './MicrosList.module.css';

const MINERALS = new Set(['sodium_mg', 'potassium_mg', 'calcium_mg', 'iron_mg', 'magnesium_mg', 'zinc_mg', 'selenium_mcg', 'iodine_mcg']);
const MicrosList = ({ micros, coverage, metas, compact = false, showNotes = true }) => {
    const t = useT();
    const [expanded, setExpanded] = useState(false);
    const [group, setGroup] = useState('all');
    const rows = filasMicros(t);
    const visible = (expanded ? rows : rows.slice(0, 8)).filter((f) => group === 'all' || (group === 'minerals' ? MINERALS.has(f.key) : f.key !== 'fiber_g' && !MINERALS.has(f.key)));
    const hayMetas = !!(metas && Object.keys(metas).length);
    return <div className={`${styles.wrap} ${compact ? styles.compact : ''}`}>
        {expanded && <div className={styles.filters} aria-label={t('Grupo de nutrientes')}>
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
                    <span className={styles.value}><b>{partial && value !== null ? '≥ ' : ''}{formatoMicro(value, unit)}</b>{target > 0 ? ` / ${formatoMicro(target, unit)}` : ''} {unit}</span>
                </div>
                <div className={styles.track} {...(value !== null && target > 0 ? { role: 'progressbar', 'aria-label': f.label, 'aria-valuemin': 0, 'aria-valuemax': target, 'aria-valuenow': Math.min(value, target), 'aria-valuetext': `${formatoMicro(value, unit)} ${unit} · ${status}` } : {})}>
                    <div className={`${styles.fill} ${state}`} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
                </div>
                <details className={styles.evidence}>
                    <summary>{status}<span aria-hidden="true">⌄</span></summary>
                    <p>{t('Datos de {known} de {total} comidas', { known: cov.known, total: cov.total })}</p>
                    {partial && <p>{t('Subtotal conocido; los alimentos sin datos no cuentan como cero.')}</p>}
                    {meta && <p>{techo ? t('Máximo recomendado') : t('Referencia diaria')}: {formatoMicro(target, unit)} {unit} · {meta.reference_type || 'DRI'}</p>}
                    {f.key === 'folate_mcg' && <p>{t('DFE: equivalentes de folato dietético; no es la cantidad de ácido fólico.')}</p>}
                    {f.key === 'vit_e_mg' && <p>{t('Vitamina E expresada como alfa-tocoferol.')}</p>}
                    {meta?.source && <a href={meta.source} target="_blank" rel="noopener noreferrer">{t('Consultar la referencia')} ↗</a>}
                    {(cov.sources || []).map((source, i) => <p key={i}>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.source} · {source.description || source.fdc_id} ↗</a> : source.source}{source.retrieved_at ? ` · ${source.retrieved_at.slice(0, 10)}` : ''}</p>)}
                </details>
                {techo && value !== null && target > 0 && value > target && <span className={styles.limitNote}>{t('Sobre el máximo recomendado')}</span>}
                {!compact && techo && !partial && value !== null && target > value && <span className={styles.ceilingRemaining}>{t('A {n} {unit} del máximo recomendado', { n: formatoMicro(target - value, unit), unit })}</span>}
            </li>;
        })}</ul>
        <button type="button" className={styles.expand} aria-expanded={expanded} onClick={() => { setExpanded(!expanded); setGroup('all'); }}>
            <span className={styles.expandIcon} aria-hidden="true"><FlaskConical size={19} strokeWidth={1.8} /></span>
            <span className={styles.expandLabel}>{expanded ? t('Mostrar menos') : t('Ver todos los nutrientes')}</span>
            <span className={styles.expandCount} aria-hidden="true">{rows.length}</span>
            <ChevronDown className={styles.expandChevron} size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        {showNotes && <details className={styles.explanation}>
            <summary>{t('Sobre las referencias y los datos')}</summary>
            <p>{t('Las referencias diarias orientan tu alimentación; superarlas no significa peligro. No son un diagnóstico ni un límite universal de seguridad.')}</p>
            <p>{t('El máximo de magnesio se aplica a suplementos, no al magnesio de los alimentos. B12 no tiene un máximo establecido; el folato requiere distinguir su forma.')}</p>
            <p>{t('Los datos se calculan con los ingredientes registrados y el catálogo. Las fotos sin ingredientes pueden quedar sin datos. Una actualización del catálogo puede corregir días anteriores.')}</p>
        </details>}
        {showNotes && !hayMetas && <p className={styles.note}>{t('Sin metas todavía: completa sexo y edad en Configuración.')}</p>}
    </div>;
};
MicrosList.propTypes = { micros: PropTypes.object, coverage: PropTypes.object, metas: PropTypes.object, compact: PropTypes.bool, showNotes: PropTypes.bool };
export default MicrosList;
