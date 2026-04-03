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

export const RadioCard = ({ name, value, checked, onChange, label, icon: Icon, desc }) => (
    <label className={`${styles.radioCard} ${checked ? styles.checked : ''}`}>
        <input
            type="radio"
            name={name}
            value={value}
            checked={checked}
            onChange={onChange}
            className={styles.radioHidden}
        />
        {Icon && <Icon className={styles.icon} size={28} strokeWidth={checked ? 2.5 : 1.5} />}
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
