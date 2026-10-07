import { Link, useInRouterContext, useLocation } from 'react-router-dom';
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
            <summary>{t('Fuentes de salud y nutrición')}</summary>
            <p>{t('Estas referencias explican los cálculos y las recomendaciones generales. Las estimaciones de la IA y las necesidades individuales pueden variar; no constituyen un diagnóstico.')}</p>
            <ul>
                {sources.map(source => (
                    <li key={source.id}>
                        <a href={source.url} target="_blank" rel="noopener noreferrer">{t(source.title)}</a>
                        <span>{source.publisher}</span>
                    </li>
                ))}
            </ul>
            <p>{t('Consulta a tu médico o nutricionista antes de cambiar tu alimentación, especialmente si tienes una condición médica o tomas medicamentos.')}</p>
            {context !== 'all' && (inRouter
                ? <SourcesLink>{t('Ver todas las fuentes y los límites de las estimaciones')}</SourcesLink>
                : <a href="/medical#fuentes">{t('Ver todas las fuentes y los límites de las estimaciones')}</a>)}
        </details>
    );
}

function SourcesLink({ children }) {
    const location = useLocation();
    return <Link to="/medical#fuentes" state={{ from: location.pathname }}>{children}</Link>;
}
