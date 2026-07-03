import styles from './FormUI.module.css';
import PropTypes from 'prop-types';

export const Label = ({ children, htmlFor }) => (
    <label htmlFor={htmlFor} className={styles.label}>
        {children}
    </label>
);

export const Input = ({ type = 'text', ...props }) => (
    <input type={type} className={styles.input} {...props} />
);

export const Select = ({ children, ...props }) => (
    <div className={styles.selectWrapper}>
        <select className={styles.select} {...props}>
            {children}
        </select>
    </div>
);

// [P6-FORM-RADIO-CLICK-FIX] `onClick` opcional para usos que necesitan
// disparar acción (ej. auto-advance) en CADA click, no solo cuando el
// `value` cambia. Bug observable: si `formData.gender` ya está pre-seteado
// (sesión anterior, default, hidratación), `onChange` no fire al re-clickear
// la misma opción → usuario stuck sin botón "Siguiente". Permitir `onClick`
// en el `<label>` (que envuelve el radio) garantiza el callback en cada
// interacción independiente del estado React previo.
export const RadioCard = ({ name, value, checked, onChange, onClick, label, icon: Icon, desc }) => (
    <label
        className={`${styles.radioCard} ${checked ? styles.checked : ''}`}
        onClick={onClick}
    >
        <input
            type="radio"
            name={name}
            value={value}
            checked={checked}
            onChange={onChange}
            className={styles.radioHidden}
        />
        {/* [FORM-VISUAL-V2 · 2026-07-02] El icono vive en un chip circular que se
            llena de primary al seleccionar — mismo lenguaje que DietOption en
            InteractiveQuestions, antes el icono iba "flotando" sin contenedor. */}
        {Icon && (
            <span className={styles.iconChip} aria-hidden="true">
                <Icon className={styles.icon} size={24} strokeWidth={checked ? 2.5 : 1.75} />
            </span>
        )}
        <div className={styles.radioTextContent}>
            <span className={styles.radioLabel}>{label}</span>
            {desc && <span className={styles.radioDesc}>{desc}</span>}
        </div>
    </label>
);

export const Checkbox = ({ name, value, checked, onChange, label, desc }) => (
    <label className={styles.checkboxWrapper}>
        <input
            type="checkbox"
            name={name}
            value={value}
            checked={checked}
            onChange={onChange}
            className={styles.checkboxInput}
        />
        <span className={styles.checkboxCustom} />
        <div className={styles.checkTextContent}>
            <span className={styles.checkboxLabel}>{label}</span>
            {desc && <span className={styles.checkboxDesc}>{desc}</span>}
        </div>
    </label>
);

export const TextArea = ({ ...props }) => (
    <textarea className={styles.textarea} {...props} />
);

Label.propTypes = { children: PropTypes.node, htmlFor: PropTypes.string };
Input.propTypes = { type: PropTypes.string };
Select.propTypes = { children: PropTypes.node };
TextArea.propTypes = { rows: PropTypes.number };
RadioCard.propTypes = {
    name: PropTypes.string,
    value: PropTypes.string,
    checked: PropTypes.bool,
    onChange: PropTypes.func,
    onClick: PropTypes.func,
    label: PropTypes.string,
    icon: PropTypes.elementType
};
Checkbox.propTypes = {
    name: PropTypes.string,
    value: PropTypes.string,
    checked: PropTypes.bool,
    onChange: PropTypes.func,
    label: PropTypes.string
};
