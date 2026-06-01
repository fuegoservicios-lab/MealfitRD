import React from 'react';
import { Utensils } from 'lucide-react';

export default function EmptyState({
    icon: Icon = Utensils,
    title = 'No hay nada para mostrar',
    description = '',
    cta = null,
    compact = false,
}) {
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
                color="var(--text-light)"
                strokeWidth={1.75}
                style={{ marginBottom: '0.5rem', opacity: 0.6 }}
            />
            <h3
                style={{
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    color: 'var(--text-main)',
                    margin: 0,
                }}
            >
                {title}
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
