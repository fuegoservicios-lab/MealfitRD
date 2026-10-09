// [P2-4 · 2026-07-09] Extraído de InteractiveQuestions.jsx (split mecánico un-archivo-por-Q*; ese archivo quedó como barrel de re-export).
import { ArrowRight } from 'lucide-react';
import { useT } from '../../../i18n';

// --- Reusable Navigation Button for Manual Steps ---
// [FORM-CTA-UNIFY · 2026-07-02] `style` permite overrides puntuales (ej. el flow
// externo pasa marginTop:0 porque su contenedor ya aporta el espaciado). Este
// componente es el ÚNICO look válido para el CTA primario del formulario — el
// "Siguiente Paso" del flow lo reutiliza; no dupliques botones inline planos.
// [P1-I18N-DASHBOARD · 2026-08-15] El default de `label` se resuelve DENTRO del
// cuerpo (no en la firma): un default de parámetro no puede llamar al hook, y el
// hook es lo que suscribe el botón al cambio de idioma.
export const NextButton = ({ onClick, disabled, label, icon: Icon = ArrowRight, style = {} }) => {
    const t = useT();
    return (
    <button
        onClick={onClick}
        disabled={disabled}
        // [CTA-HOVER-GLOW · 2026-05-31 · calmado FORM-CTA-STATIC 2026-07-03] El
        // box-shadow (base/disabled/hover/active/focus) vive en la clase `.mf-cta-btn`
        // de index.css — NO inline — para que los estados puedan variarlo sin que la
        // especificidad del estilo inline lo gane. A pedido del usuario: sin
        // desplazamiento en hover/active y glow discreto (sombra tenue de un solo
        // color). El fondo y el padding siguen inline.
        className="mf-cta-btn"
        // [P1-PLAN-LOTE-151] `.mf-cta-btn` ya traía su resplandor; `data-hover` añade
        // el brillo y el relieve del resto de la app, que ahora SE SUMAN al suyo.
        data-hover="boton"
        style={{
            padding: '1rem 3rem',
            background: disabled
                ? 'var(--bg-muted)'
                : 'var(--button-primary-bg)',
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
        {label ?? t('Siguiente')} <Icon size={20} />
    </button>
    );
};
