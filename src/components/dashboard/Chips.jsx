// [P1-PLAN-LOTE-99 · 2026-09-18 · compartido P1-PLAN-LOTE-106] Un grupo de chips excluyentes («¿Qué comida es?»,
// «¿Cuándo?»). Botones con `aria-pressed` y no radios: el valor ya vive en el estado del padre y un botón se toca
// igual en el teléfono y con el teclado. Nació dentro del componedor; el escáner de fotos lo usa desde el lote 106
// para las mismas dos preguntas, así que se extrae (no se copia).
import PropTypes from 'prop-types';
import styles from './Chips.module.css';

const Chips = ({ label, options, value, onChange, disabled = false }) => (
    <div className={styles.chips} role="group" aria-label={label}>
        {options.map((o) => (
            <button
                key={String(o.value)}
                type="button"
                className={o.value === value ? `${styles.chip} ${styles.chipOn}` : styles.chip}
                aria-pressed={o.value === value}
                disabled={disabled}
                onClick={() => onChange(o.value)}
            >
                {o.label}
            </button>
        ))}
    </div>
);

Chips.propTypes = {
    label: PropTypes.string.isRequired,
    options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.any, label: PropTypes.node })).isRequired,
    value: PropTypes.any,
    onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};

export default Chips;
