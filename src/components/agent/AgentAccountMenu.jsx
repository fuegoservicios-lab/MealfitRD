import { Fragment, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronRight, HelpCircle, Info, LogOut } from 'lucide-react';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { moreInfoGroups } from '../dashboard/moreInfoLinks';
import { apexUrl } from '../../config/site';
import { useT } from '../../i18n';
import CoachQuotaMeter from './CoachQuotaMeter';
import styles from './AgentAccountMenu.module.css';

export default function AgentAccountMenu({ items, quota, triggerRef, onClose, onNavigate, onHelp, onLogout, logoutLabel }) {
    const t = useT();
    const [showInfo, setShowInfo] = useState(false);
    const [position, setPosition] = useState({ top: 80, right: 16, maxHeight: 'calc(100dvh - 104px)' });
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose, returnFocusRef: triggerRef });
    useLayoutEffect(() => {
        containerRef.current?.querySelector('button, a')?.focus({ preventScroll: true });
    }, [showInfo, containerRef]);

    useLayoutEffect(() => {
        const place = () => {
            const rect = triggerRef.current?.getBoundingClientRect();
            const viewport = window.visualViewport;
            const bottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
            const top = Math.max((viewport?.offsetTop || 0) + 12, Math.min((rect?.bottom || 72) + 10, bottom - 180));
            setPosition({ top, right: Math.max(16, window.innerWidth - (rect?.right || window.innerWidth - 16)), maxHeight: Math.max(160, bottom - top - 20) });
        };
        place();
        window.addEventListener('resize', place);
        window.visualViewport?.addEventListener('resize', place);
        window.visualViewport?.addEventListener('scroll', place);
        return () => {
            window.removeEventListener('resize', place);
            window.visualViewport?.removeEventListener('resize', place);
            window.visualViewport?.removeEventListener('scroll', place);
        };
    }, [triggerRef]);

    const run = (action) => { onClose(); action?.(); };
    const moveFocus = (event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const options = Array.from(containerRef.current.querySelectorAll('[role="menuitem"]'));
        if (!options.length) return;
        event.preventDefault();
        const current = options.indexOf(document.activeElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[index].focus();
    };

    return createPortal(
        <>
            <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
            <div id="agent-account-menu" className={styles.panel} style={position} role="dialog" aria-modal="true"
                aria-label={t('Navegación')} ref={containerRef} tabIndex={-1} onKeyDown={moveFocus}>
                {showInfo ? (
                    <>
                        <button type="button" className={styles.back} onClick={() => setShowInfo(false)}>
                            <ArrowLeft size={18} aria-hidden="true" />{t('Más información')}
                        </button>
                        <div role="menu" aria-label={t('Más información')} className={styles.content}>
                            {moreInfoGroups(t).map((group, index) => <Fragment key={index}>
                                {index > 0 && <div className={styles.divider} role="separator" />}
                                {group.map(link => <a key={link.path} href={apexUrl(link.path)} className={styles.item}
                                    role="menuitem" onClick={onClose}>{link.label}<ChevronRight size={16} className={styles.chevron} aria-hidden="true" /></a>)}
                            </Fragment>)}
                        </div>
                    </>
                ) : (
                    <>
                        <CoachQuotaMeter quota={quota} variant="row" />
                        <div role="menu" aria-label={t('Navegación')} className={styles.content}>
                            {items.filter(item => !item.asDialog).map(item => <button type="button" role="menuitem" key={item.path}
                                className={styles.item} onClick={() => run(() => onNavigate(item))}>
                                <item.icon size={20} strokeWidth={1.8} aria-hidden="true" />{item.label}
                            </button>)}
                            <div className={styles.divider} role="separator" />
                            {items.filter(item => item.asDialog).map(item => <button type="button" role="menuitem" key={item.path}
                                className={styles.item} onClick={() => run(() => onNavigate(item))}>
                                <item.icon size={20} strokeWidth={1.8} aria-hidden="true" />{item.label}
                            </button>)}
                            <button type="button" className={styles.item} role="menuitem" aria-haspopup="menu" aria-expanded={showInfo}
                                onClick={() => setShowInfo(true)}><Info size={20} aria-hidden="true" />{t('Más información')}
                                <ChevronRight size={16} className={styles.chevron} aria-hidden="true" /></button>
                            <button type="button" className={styles.item} role="menuitem" onClick={() => run(onHelp)}>
                                <HelpCircle size={20} aria-hidden="true" />{t('Obtener ayuda')}</button>
                            <div className={styles.divider} role="separator" />
                            <button type="button" className={`${styles.item} ${styles.logout}`} role="menuitem" onClick={() => run(onLogout)}>
                                <LogOut size={20} aria-hidden="true" />{logoutLabel || t('Cerrar sesión')}</button>
                        </div>
                    </>
                )}
            </div>
        </>, document.body,
    );
}
