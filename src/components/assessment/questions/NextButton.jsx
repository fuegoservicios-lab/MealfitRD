// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { ArrowRight } from 'lucide-react';

// --- Reusable Navigation Button for Manual Steps ---
// [FORM-CTA-UNIFY · 2026-07-02] `style` permite overrides puntuales (ej. el flow
// externo pasa marginTop:0 porque su contenedor ya aporta el espaciado). Este
// componente es el ÚNICO look válido para el CTA primario del formulario — el
// "Siguiente Paso" del flow lo reutiliza; no dupliques botones inline planos.
export const NextButton = ({ onClick, disabled, label = "Siguiente", icon: Icon = ArrowRight, style = {} }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        // [CTA-HOVER-GLOW · 2026-05-31 · calmado FORM-CTA-STATIC 2026-07-03] El
        // box-shadow (base/disabled/hover/active/focus) vive en la clase `.mf-cta-btn`
        // de index.css — NO inline — para que los estados puedan variarlo sin que la
        // especificidad del estilo inline lo gane. A pedido del usuario: sin
        // desplazamiento en hover/active y glow discreto (sombra tenue de un solo
        // color). El gradiente/padding siguen inline.
        className="mf-cta-btn"
        style={{
            padding: '1rem 3rem',
            // [FORM-CTA-CALM-GRADIENT · 2026-07-11] A pedido del usuario ("los siento
            // muy brillosos"): gradiente a las variantes `-dark` de marca (indigo/emerald
            // 500) en vez de las aclaradas 400 — menos neón en modo oscuro, look más
            // sobrio en claro. Scoped al CTA del formulario; no toca las vars globales.
            background: disabled ? 'var(--bg-muted)' : 'linear-gradient(135deg, var(--primary-dark) 0%, var(--secondary-dark) 100%)',
            color: disabled ? '#94A3B8' : 'white',
            border: 'none',
            borderRadius: '1rem',
            fontWeight: 800,
            fontSize: '1.15rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.8 : 1,
            transition: 'all 0.3s',
            marginTop: '2rem',
            justifyContent: 'center',
            width: '100%',
            ...style
        }}
    >
        {label} <Icon size={20} />
    </button>
);
