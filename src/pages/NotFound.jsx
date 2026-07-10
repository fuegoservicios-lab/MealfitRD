// [P3-10 · 2026-07-09] Página 404 real. Antes el wildcard hacía
// `<Navigate to="/" replace />` — un typo en la URL o un link muerto
// (ej. el viejo /pricing) redirigía a la home SIN feedback, y el usuario
// no sabía que el destino no existía. Liviana a propósito: sin framer,
// solo tokens del theme (dark-mode gratis).
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

const NotFound = () => (
    <main
        id="main-content"
        style={{
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '4rem 1.5rem',
            textAlign: 'center',
            background: 'var(--bg-page)',
            color: 'var(--text-main)',
        }}
    >
        <Compass size={44} strokeWidth={1.5} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            Esta página no existe
        </h1>
        <p style={{ color: 'var(--text-muted)', maxWidth: '38ch', margin: 0 }}>
            El enlace puede estar roto o la página fue movida. Revisa la dirección
            o vuelve al inicio.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link
                to="/"
                style={{
                    padding: '0.6rem 1.2rem',
                    borderRadius: '0.6rem',
                    background: 'var(--primary)',
                    color: '#fff',
                    fontWeight: 600,
                    textDecoration: 'none',
                }}
            >
                Ir al inicio
            </Link>
            <Link
                to="/dashboard"
                style={{
                    padding: '0.6rem 1.2rem',
                    borderRadius: '0.6rem',
                    border: '1px solid var(--text-light)',
                    color: 'var(--text-main)',
                    fontWeight: 600,
                    textDecoration: 'none',
                }}
            >
                Ir a mi panel
            </Link>
        </div>
    </main>
);

export default NotFound;
