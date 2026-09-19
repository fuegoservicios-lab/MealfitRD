import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Images, X } from 'lucide-react';
import { useT } from '../../i18n';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import './AttachmentSourceSheet.css';

// [P1-PLAN-LOTE-111 · 2026-09-19] La hoja de «adjuntar» del chat en la app nativa, como la de ChatGPT/Gemini.
// El dueño, ya con el build nativo: al tocar «+» con el teclado abierto quería lo que hacen esas apps. Tres cosas:
//  1. Hoja PEGADA al borde inferior que sube mientras el teclado baja (antes era una tarjeta flotante que aparecía
//     de golpe encima del teclado a medio cerrar), con asa y cierre deslizando (`useBottomSheet`, el del lote 106).
//  2. `restoreFocus={false}`: cuando el teclado estaba abierto, quien decide adónde vuelve el foco es el chat (al
//     cuadro de texto, para que el teclado REGRESE); devolverlo aquí al botón «+» lo cerraría otra vez.
//  3. El cuerpo vive en un componente que solo existe con la hoja abierta: `useBottomSheet` recuerda el scroll del
//     documento al MONTAR, y montado de por vida lo recordaría al cargar el chat, no al abrir la hoja.
// El contrato de accesibilidad no cambia (agentMobileMedia.a11y.test.jsx): foco a la primera acción, trampa de Tab,
// Escape, y foco de vuelta al disparador salvo que el chat pida lo contrario.
function SheetInner({ onClose, onGallery, onCamera, triggerRef, restoreFocus }) {
    const t = useT();
    const dialogRef = useRef(null);
    const firstActionRef = useRef(null);
    const restoreFocusRef = useRef(restoreFocus);
    // `onClose` llega como función en línea y cambia en cada render del chat: si fuera dependencia del efecto de
    // abajo, cada render devolvería el foco al disparador y lo volvería a traer. El efecto es de MONTAJE.
    const onCloseRef = useRef(onClose);
    useEffect(() => { restoreFocusRef.current = restoreFocus; onCloseRef.current = onClose; }, [restoreFocus, onClose]);
    const gestos = useBottomSheet({ containerRef: dialogRef, bodyRef: dialogRef, onClose });

    useEffect(() => {
        const previous = document.activeElement;
        const returnFocus = triggerRef?.current || previous;
        firstActionRef.current?.focus({ preventScroll: true });
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
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
            if (restoreFocusRef.current) returnFocus?.focus?.();
        };
    }, [triggerRef]);

    return createPortal(
        <div className="attachment-source-backdrop" onMouseDown={onClose}>
            <div
                ref={dialogRef}
                className="attachment-source-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="attachment-source-title"
                onMouseDown={(event) => event.stopPropagation()}
                {...gestos}
            >
                <span className="attachment-source-grip" aria-hidden="true" />
                <div className="attachment-source-heading">
                    <h2 id="attachment-source-title">{t('Añadir imagen')}</h2>
                    <button className="ui-close" type="button" onClick={onClose} aria-label={t('Cerrar')}><X size={20} strokeWidth={2.25} aria-hidden="true" /></button>
                </div>
                <div className="attachment-source-tiles">
                    <button ref={firstActionRef} type="button" className="attachment-source-action" onClick={onGallery}>
                        <span className="attachment-source-ico"><Images size={24} aria-hidden="true" /></span>
                        <span><strong>{t('Elegir de la galería')}</strong><small>{t('Puedes seleccionar hasta 4 imágenes')}</small></span>
                    </button>
                    <button type="button" className="attachment-source-action" onClick={onCamera}>
                        <span className="attachment-source-ico"><Camera size={24} aria-hidden="true" /></span>
                        <span><strong>{t('Tomar una foto')}</strong><small>{t('Usar la cámara del dispositivo')}</small></span>
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export function AttachmentSourceSheet({ open, onClose, onGallery, onCamera, triggerRef, restoreFocus = true }) {
    if (!open || typeof document === 'undefined') return null;
    return (
        <SheetInner
            onClose={onClose}
            onGallery={onGallery}
            onCamera={onCamera}
            triggerRef={triggerRef}
            restoreFocus={restoreFocus}
        />
    );
}
