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
// [P2-LOCALE-LISTBOX-DESKTOP · 2026-09-04] DOS controles según el puntero. En táctil, el
// <select> nativo: el SO pone su propia rueda y es lo más accesible. Con puntero fino, un
// listbox PROPIO: el popup nativo del <select> en escritorio (Windows/Chrome) no sigue al
// tema, no se puede vestir y salía blanco con el texto de la píldora encima (captura del
// dueño); el listbox sigue los tokens, se abre nítido y se maneja con teclado (flechas,
// Enter, Escape, Home/End). Las etiquetas van en su PROPIO idioma (`native`), porque quien
// busca su idioma en una lista no sabe leer la que tiene delante.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { LOCALES } from '../../i18n/locales';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import styles from './LocaleSwitcher.module.css';

const Chevron = () => (
    <svg className={styles.chev} width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
        <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const Check = () => (
    <svg className={styles.check} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export default function LocaleSwitcher({ className = '', id = 'mf-locale-switcher' }) {
    const { locale, setLocale, t } = useI18n();
    const [pendiente, setPendiente] = useState(null);
    const coarse = useMediaQuery('(pointer: coarse)');
    const [open, setOpen] = useState(false);
    const currentIdx = Math.max(0, LOCALES.findIndex((l) => l.code === (pendiente || locale)));
    const [hi, setHi] = useState(currentIdx);
    const rootRef = useRef(null);
    const btnRef = useRef(null);
    const menuRef = useRef(null);
    // [P2-LOCALE-MENU-RIGHTWARD · 2026-09-04] El menú nace alineado al borde IZQUIERDO de la
    // píldora y crece hacia la derecha (hacia el margen de la página), no hacia la izquierda
    // sobre la tarjeta del login. Si no cabe en el viewport, se corre a la izquierda solo lo
    // justo (clamp), y nunca más allá de quedar alineado al borde derecho de la píldora.
    const [menuShift, setMenuShift] = useState(0);
    const listId = `${id}-listbox`;

    const cambiar = async (code) => {
        if (!code || code === locale) return;
        setPendiente(code);
        try {
            await setLocale(code);
        } finally {
            setPendiente(null);
        }
    };

    // cierre por clic fuera y por Escape; el foco vuelve a la píldora
    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => {
            if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    useLayoutEffect(() => {
        if (!open) return undefined;
        const place = () => {
            const btn = btnRef.current;
            const menu = menuRef.current;
            if (!btn || !menu) return;
            const b = btn.getBoundingClientRect();
            const w = menu.getBoundingClientRect().width;
            const margin = 12;
            const maxLeft = window.innerWidth - margin - w;
            const left = Math.max(b.right - w, Math.min(b.left, maxLeft));
            setMenuShift(Math.round(left - b.left));
        };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, [open]);

    if (coarse) {
        return (
            <label className={`${styles.switcher} ${className}`.trim()} htmlFor={id}>
                <span className={styles.srOnly}>{t('Idioma')}</span>
                <select
                    id={id}
                    className={styles.select}
                    value={pendiente || locale}
                    onChange={(e) => cambiar(e.target.value)}
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

    const current = LOCALES[currentIdx] || LOCALES[0];
    const abrir = (idx = currentIdx) => { setHi(idx); setOpen(true); };
    const elegir = (code) => { setOpen(false); btnRef.current?.focus(); cambiar(code); };
    const onKeyDown = (e) => {
        const last = LOCALES.length - 1;
        switch (e.key) {
            case 'ArrowDown': e.preventDefault(); if (!open) abrir(); else setHi((i) => Math.min(last, i + 1)); break;
            case 'ArrowUp': e.preventDefault(); if (!open) abrir(); else setHi((i) => Math.max(0, i - 1)); break;
            case 'Home': if (open) { e.preventDefault(); setHi(0); } break;
            case 'End': if (open) { e.preventDefault(); setHi(last); } break;
            case 'Enter':
            case ' ': e.preventDefault(); if (open) elegir(LOCALES[hi].code); else abrir(); break;
            case 'Tab': if (open) setOpen(false); break;
            default: break;
        }
    };

    return (
        <div className={`${styles.switcher} ${className}`.trim()} ref={rootRef}>
            <button
                type="button"
                id={id}
                ref={btnRef}
                className={styles.pill}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-label={t('Idioma')}
                aria-busy={pendiente !== null || undefined}
                disabled={pendiente !== null}
                onClick={() => (open ? setOpen(false) : abrir())}
                onKeyDown={onKeyDown}
                data-testid="locale-switcher"
            >
                <span className={styles.pillLabel} lang={current.code}>{current.native}</span>
                <Chevron />
            </button>
            {open && (
                <ul
                    role="listbox"
                    id={listId}
                    ref={menuRef}
                    className={styles.menu}
                    style={{ left: menuShift }}
                    aria-labelledby={id}
                    aria-activedescendant={`${id}-opt-${(LOCALES[hi] || current).code}`}
                >
                    {LOCALES.map((l, i) => (
                        <li
                            key={l.code}
                            id={`${id}-opt-${l.code}`}
                            role="option"
                            aria-selected={l.code === locale}
                            lang={l.code}
                            className={`${styles.item}${i === hi ? ` ${styles.itemHi}` : ''}${l.code === locale ? ` ${styles.itemOn}` : ''}`}
                            onMouseEnter={() => setHi(i)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => elegir(l.code)}
                        >
                            <span>{l.native}</span>
                            {l.code === locale && <Check />}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
