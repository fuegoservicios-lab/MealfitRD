import { useState } from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { applyThemePref, getStoredThemePref } from '../../utils/theme';
import { safeLocalStorageSet } from '../../utils/safeLocalStorage';
import styles from './GuestAppearanceToggle.module.css';

/* [P1-GUEST-APPEARANCE · 2026-06-15] Único ajuste relevante para un invitado
   efímero: la apariencia (tema). El resto de Settings (cuenta, suscripción,
   memoria del agente, notificaciones) requiere cuenta y hace fetches
   autenticados que fallarían sin sesión. Este control inline vive en el menú de
   cuenta del invitado y reusa el MISMO motor de tema que la página Settings
   (applyThemePref → html[data-theme] + persiste en localStorage 'mealfit_theme').
   Sin backend, sin auth — seguro para invitados. */

const OPTIONS = [
    { value: 'system', label: 'Sistema', Icon: Monitor },
    { value: 'light', label: 'Claro', Icon: Sun },
    { value: 'dark', label: 'Oscuro', Icon: Moon },
];

export default function GuestAppearanceToggle() {
    const [pref, setPref] = useState(() => getStoredThemePref());

    const choose = (value) => {
        if (value === pref) return;
        setPref(value);
        safeLocalStorageSet('mealfit_theme', value);
        applyThemePref(value); // fija html[data-theme] en vivo + dispara mealfit-theme-change
    };

    return (
        <div className={styles.wrap} role="group" aria-label="Apariencia">
            <span className={styles.label}>Apariencia</span>
            <div className={styles.seg}>
                {OPTIONS.map(({ value, label, Icon }) => (
                    <button
                        key={value}
                        type="button"
                        className={`${styles.opt} ${pref === value ? styles.optActive : ''}`}
                        onClick={() => choose(value)}
                        aria-pressed={pref === value}
                        title={label}
                    >
                        <Icon size={14} strokeWidth={2.25} aria-hidden="true" />
                        <span>{label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
