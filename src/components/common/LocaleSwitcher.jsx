// [P2-I18N-SIN-SELECTOR-ANTES-DE-TENER-CUENTA · 2026-08-23] El selector de idioma para quien
// todavía NO tiene cuenta.
//
// Hasta hoy el único selector vivía en Configuración → Idioma, que exige sesión. El
// invitado y el visitante sin cuenta dependían de la autodetección — y la autodetección es
// el SUELO, no una elección: quien tiene el móvil en inglés pero quiere el formulario en
// portugués no tenía dónde decirlo, y recorría login, registro y formulario enteros en un
// idioma que no eligió. Compone con `P1-I18N-ARRANQUE-EN-RAIZ-MATA-LA-AUTODETECCION`: ahí se
// arregló que la detección corriera; aquí, que el usuario pueda corregirla.
//
// Lo que NO hace: persistir en el perfil. `setLocale` guarda en este dispositivo
// (`mealfit_locale`), y cuando el usuario crea la cuenta, `localeParaEstampar` estampa lo
// activo en su perfil si éste nace sin idioma — la elección hecha ANTES de la cuenta viaja
// a la cuenta sola. Por eso no hay PATCH aquí: no hay a quién.
//
// Un `<select>` nativo a propósito: es el control más accesible y el que mejor se comporta
// en móvil (el SO pone su propia rueda), sin un solo byte de dependencia nueva. Las
// etiquetas van en su PROPIO idioma (`native`), porque quien busca su idioma en una lista
// no sabe leer la que tiene delante.
import { useState } from 'react';
import { useI18n } from '../../i18n';
import { LOCALES } from '../../i18n/locales';
import styles from './LocaleSwitcher.module.css';

export default function LocaleSwitcher({ className = '', id = 'mf-locale-switcher' }) {
    const { locale, setLocale, t } = useI18n();
    const [pendiente, setPendiente] = useState(null);

    const onChange = async (e) => {
        const code = e.target.value;
        if (!code || code === locale) return;
        setPendiente(code);
        try {
            await setLocale(code);
        } finally {
            setPendiente(null);
        }
    };

    return (
        <label className={`${styles.switcher} ${className}`.trim()} htmlFor={id}>
            <span className={styles.srOnly}>{t('Idioma')}</span>
            <select
                id={id}
                className={styles.select}
                value={pendiente || locale}
                onChange={onChange}
                disabled={pendiente !== null}
                aria-busy={pendiente !== null || undefined}
                data-testid="locale-switcher"
            >
                {LOCALES.map((l) => (
                    <option key={l.code} value={l.code} lang={l.code}>{l.native}</option>
                ))}
            </select>
        </label>
    );
}
