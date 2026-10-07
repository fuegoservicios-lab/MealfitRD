import { Link, useInRouterContext, useLocation } from 'react-router-dom';
import { BookOpen, ChevronDown, ExternalLink, ArrowRight } from 'lucide-react';
import { useT } from '../../i18n';
import { healthSourcesFor } from '../../data/healthSources';
import styles from './HealthSources.module.css';

export default function HealthSources({ context = 'plan', text = '', expanded = false }) {
    const sources = healthSourcesFor(context, text);
    if (!sources.length) return null;
    return <SourceDetails context={context} sources={sources} expanded={expanded} />;
}

function SourceDetails({ context, sources, expanded }) {
    const t = useT();
    const inRouter = useInRouterContext();
    return (
        <details className={styles.sources} open={expanded || undefined}>
            <summary aria-label={t('Fuentes de salud y nutrición')}>
                <span className={styles.sourceIcon} aria-hidden="true"><BookOpen size={17} /></span>
                <span className={styles.heading}>{context === 'chat' ? t('Fuentes de salud') : t('Fuentes de salud y nutrición')}</span>
                <span className={styles.count} aria-hidden="true">{sources.length}</span>
                <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
            </summary>
            <div className={styles.content}>
                <p>{t('Estas referencias explican los cálculos y las recomendaciones generales. Las estimaciones de la IA y las necesidades individuales pueden variar; no constituyen un diagnóstico.')}</p>
                <ul>
                    {sources.map(source => (
                        <li key={source.id}>
                            <span className={styles.publisher}>{source.publisher}</span>
                            <a className={styles.reference} href={source.url} target="_blank" rel="noopener noreferrer">
                                <span>{t(source.title)}</span><ExternalLink size={14} aria-hidden="true" />
                            </a>
                        </li>
                    ))}
                </ul>
                <p>{t('Consulta a tu médico o nutricionista antes de cambiar tu alimentación, especialmente si tienes una condición médica o tomas medicamentos.')}</p>
                {context !== 'all' && (inRouter
                    ? <SourcesLink>{t('Ver todas las fuentes y los límites de las estimaciones')}<ArrowRight size={15} aria-hidden="true" /></SourcesLink>
                    : <a className={styles.more} href="/medical#fuentes">{t('Ver todas las fuentes y los límites de las estimaciones')}<ArrowRight size={15} aria-hidden="true" /></a>)}
            </div>
        </details>
    );
}

function SourcesLink({ children }) {
    const location = useLocation();
    return <Link className={styles.more} to="/medical#fuentes" state={{ from: location.pathname }}>{children}</Link>;
}
