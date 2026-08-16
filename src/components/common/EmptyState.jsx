import React from 'react';
import { Utensils } from 'lucide-react';
import { useT } from '../../i18n';

// [P1-I18N-DASHBOARD · 2026-08-15] El default de `title` se resuelve DENTRO del
// cuerpo (no en la firma): un default de parámetro no puede llamar al hook, y el
// hook es lo que suscribe el componente al cambio de idioma.
// [P1-DASH-GENERATING-HONESTY · 2026-08-16] `live` = algo está ocurriendo AHORA
// mismo del lado del servidor. El icono gira y sube de opacidad: un vacío quieto y
// un vacío que está trabajando se leían IGUAL, y por eso el usuario reportaba que
// "parecía congelado". Se apoya en `.spin-animation` (index.css), que ya cae bajo
// el bloque global de `prefers-reduced-motion: reduce`.
//
// Solo debe pasarse cuando el servidor confirma trabajo en curso. Un giro
// permanente sobre algo que en realidad está dormido es la misma mentira de antes,
// ahora animada.
export default function EmptyState({
    icon: Icon = Utensils,
    title = null,
    description = '',
    cta = null,
    compact = false,
    live = false,
}) {
    const t = useT();
    return (
        <div
            role="status"
            style={{
                textAlign: 'center',
                padding: compact ? '2.5rem 1.5rem' : '4rem 2rem',
                background: 'var(--bg-page)',
                borderRadius: '1.5rem',
                border: '1px dashed var(--border)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.4rem',
            }}
        >
            <Icon
                size={44}
                color={live ? 'var(--primary)' : 'var(--text-light)'}
                strokeWidth={1.75}
                className={live ? 'spin-animation' : undefined}
                style={{ marginBottom: '0.5rem', opacity: live ? 0.95 : 0.6 }}
            />
            <h3
                style={{
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    color: 'var(--text-main)',
                    margin: 0,
                }}
            >
                {title ?? t('No hay nada para mostrar')}
            </h3>
            {description && (
                <p
                    style={{
                        color: 'var(--text-muted)',
                        margin: '0.25rem 0 0',
                        fontWeight: 500,
                        fontSize: '0.9rem',
                        maxWidth: '420px',
                        lineHeight: 1.5,
                    }}
                >
                    {description}
                </p>
            )}
            {cta && cta.label && (
                <button
                    onClick={cta.onClick}
                    // [CTA-HOVER-GLOW · 2026-05-31] El box-shadow vive en la clase
                    // .mf-empty-cta (index.css), NO inline, para que :hover pueda
                    // intensificarlo (lift + glow indigo + brillo). El fondo
                    // var(--primary) funciona en claro y oscuro.
                    className="mf-empty-cta"
                    style={{
                        marginTop: '1.25rem',
                        padding: '0.7rem 1.4rem',
                        background: 'var(--primary)',
                        color: 'var(--bg-card)',
                        border: 'none',
                        borderRadius: '99px',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                    }}
                >
                    {cta.label}
                </button>
            )}
        </div>
    );
}
