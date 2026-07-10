// [P2-4 · 2026-07-09] Helpers internos COMPARTIDOS por los steps del wizard,
// extraídos de InteractiveQuestions.jsx en el split mecánico un-archivo-por-Q*.
// NO son API pública del formulario: se importan solo desde los Q*.jsx hermanos
// (el barrel InteractiveQuestions.jsx no los re-exporta, igual que antes del split).
import { Check } from 'lucide-react';

// [P2-A] Activación por teclado para `<div role="button|switch">`. Replica el
// comportamiento nativo de <button>: Enter dispara el callback, Space también
// (con preventDefault para evitar scroll de página). Sin esto, los selectores
// tipo card son alcanzables con Tab pero NO se pueden activar con teclado —
// usuarios de lectores de pantalla y de keyboard-only quedan bloqueados.
export const handleActivationKey = (callback) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        callback();
    }
};

// --- Componentes Reutilizables Extraídos de los Steps Originales ---
// [FORM-OPT-HOVER · 2026-07-03] Base (border/fondo/hover/focus-ring/transition)
// vive en `.mf-opt-card` (index.css); inline solo va el estado SELECCIONADO,
// que gana sobre la clase y anula el hover mientras está activo.
export const DietOption = ({ val, label, icon: Icon, desc, isSelected, onSelect }) => (
    <div
        onClick={() => onSelect(val)}
        onKeyDown={handleActivationKey(() => onSelect(val))}
        role="button"
        aria-pressed={isSelected}
        tabIndex={0}
        className="mf-opt-card"
        style={{
            padding: '1rem', borderRadius: 'var(--radius-md)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.5rem',
            position: 'relative',
            ...(isSelected ? { border: '2px solid var(--primary)', backgroundColor: 'rgba(37, 99, 235, 0.12)' } : {})
        }}
    >
        {/* [FORM-ICON-CIRCLE-CENTER · 2026-07-03] display:flex + centrado: sin esto el
            SVG inline se asienta en la baseline de texto y el line-height agrega espacio
            fantasma debajo → el círculo se vuelve óvalo y el icono queda descentrado. */}
        <div style={{ padding: '0.75rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSelected ? 'var(--primary)' : 'var(--bg-muted)', color: isSelected ? 'white' : 'var(--text-muted)' }}>
            <Icon size={24} />
        </div>
        <div>
            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>{label}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{desc}</div>
        </div>
        {isSelected && <div style={{ position: 'absolute', top: 8, right: 8, color: 'var(--primary)' }}><Check size={16} /></div>}
    </div>
);

// [FORM-OPT-HOVER · 2026-07-03] Base en `.mf-opt-chip` (index.css); inline solo
// el estado seleccionado (ver DietOption).
export const ChipOption = ({ val, label, icon: Icon, isSelected, onToggle }) => (
    <div
        onClick={() => onToggle(val)}
        onKeyDown={handleActivationKey(() => onToggle(val))}
        role="button"
        aria-pressed={isSelected}
        tabIndex={0}
        className="mf-opt-chip"
        style={{
            padding: '0.75rem 1rem', borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            ...(isSelected ? { border: '1px solid var(--secondary)', backgroundColor: 'rgba(16, 185, 129, 0.12)' } : {})
        }}
    >
        {Icon && <Icon size={18} color={isSelected ? 'var(--secondary)' : 'var(--text-muted)'} />}
        <span style={{ fontSize: '0.9rem', fontWeight: isSelected ? 600 : 400, color: isSelected ? 'var(--secondary)' : 'var(--text-main)' }}>
            {label}
        </span>
    </div>
);

// [FORM-OPT-HOVER · 2026-07-03] Base en `.mf-opt-card`; el seleccionado inline
// usa el `color` dinámico de cada objetivo (por eso no puede vivir en CSS).
export const GoalCard = ({ val, label, icon: Icon, color, isSelected, onSelect }) => (
    <div
        onClick={() => onSelect(val)}
        onKeyDown={handleActivationKey(() => onSelect(val))}
        role="button"
        aria-pressed={isSelected}
        tabIndex={0}
        className="mf-opt-card"
        style={{
            padding: '1.25rem', borderRadius: 'var(--radius-lg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', textAlign: 'center',
            position: 'relative',
            ...(isSelected ? { border: `2px solid ${color}`, backgroundColor: `${color}22` } : {})
        }}
    >
        {/* [FORM-ICON-CIRCLE-CENTER · 2026-07-03] mismo fix de centrado que DietOption. */}
        <div style={{ padding: '0.75rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSelected ? color : 'var(--bg-muted)', color: isSelected ? 'white' : 'var(--text-muted)' }}>
            <Icon size={28} />
        </div>
        <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>{label}</span>
        {isSelected && <div style={{ position: 'absolute', top: 10, right: 10, color: color }}><Check size={18} /></div>}
    </div>
);

// --- [P0-B1] Helper de toggle para multi-select con valor sentinel exclusivo ---
//
// Antes, `QAllergies`, `QMedical` y `QStruggles` cada uno tenía su propio
// `handleCheckboxChange` (toggle simple) más un `onToggle` inline para el chip
// "Ninguna"/"Ninguno". Cuando el usuario hacía:
//   1. Marcar "Ninguna" (lista pasa a `["Ninguna"]`)
//   2. Marcar "Lácteos" después
// el handler de Lácteos llamaba `handleCheckboxChange('allergies', 'Lácteos')`,
// que NO filtraba "Ninguna" — la lista quedaba `["Ninguna", "Lácteos"]`.
// El backend / RAG entonces inyectaba al prompt LITERAL "ALERGIA: Ninguna" Y
// "ALERGIA: Lácteos" simultáneamente — contradicción visible al revisor médico
// y ruido para el LLM.
//
// Este helper centraliza la regla:
//   - Item ya en la lista → toggle off (quita).
//   - Sentinel agregado → reemplaza la lista entera por `[sentinel]`.
//   - Item real agregado → push + filtra el sentinel si estaba.
// Resultado: marcar Ninguna → marcar Lácteos da exactamente `["Lácteos"]`.
export const toggleArrayWithExclusiveSentinel = (currentArr, value, sentinel) => {
    const arr = Array.isArray(currentArr) ? currentArr : [];
    if (arr.includes(value)) {
        return arr.filter(item => item !== value);
    }
    if (value === sentinel) {
        return [sentinel];
    }
    return [...arr.filter(item => item !== sentinel), value];
};

// [P1-PREGNANCY-INTAKE-CAPTURE · 2026-06-19] SSOT de los labels de embarazo/lactancia (chips de QMedical,
// gender-gated). Compartido con QGender para limpiar el huérfano si el usuario vuelve atrás y cambia el
// género a hombre tras haber marcado embarazo (evita un override silencioso e irrecuperable-vía-UI: el
// chip se oculta pero el valor seguía vivo en medicalConditions → forzaba maintenance + FS9 a un varón).
export const PREGNANCY_CHIP_LABELS = ['Embarazo', 'Lactancia'];
