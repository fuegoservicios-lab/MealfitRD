import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Images, X } from 'lucide-react';
import { useT } from '../../i18n';
import './AttachmentSourceSheet.css';

export function AttachmentSourceSheet({ open, onClose, onGallery, onCamera, triggerRef }) {
    const t = useT();
    const dialogRef = useRef(null);
    const firstActionRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const previous = document.activeElement;
        const returnFocus = triggerRef?.current || previous;
        firstActionRef.current?.focus();
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = dialogRef.current?.querySelectorAll('button:not([disabled])') || [];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            returnFocus?.focus?.();
        };
    }, [open, onClose, triggerRef]);

    if (!open || typeof document === 'undefined') return null;
    return createPortal(
        <div className="attachment-source-backdrop" onMouseDown={onClose}>
            <div
                ref={dialogRef}
                className="attachment-source-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="attachment-source-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="attachment-source-heading">
                    <h2 id="attachment-source-title">{t('Añadir imagen')}</h2>
                    <button type="button" onClick={onClose} aria-label={t('Cerrar')}><X size={22} /></button>
                </div>
                <button ref={firstActionRef} type="button" className="attachment-source-action" onClick={onGallery}>
                    <Images size={24} />
                    <span><strong>{t('Elegir de la galería')}</strong><small>{t('Puedes seleccionar hasta 4 imágenes')}</small></span>
                </button>
                <button type="button" className="attachment-source-action" onClick={onCamera}>
                    <Camera size={24} />
                    <span><strong>{t('Tomar una foto')}</strong><small>{t('Usar la cámara del dispositivo')}</small></span>
                </button>
            </div>
        </div>,
        document.body,
    );
}
