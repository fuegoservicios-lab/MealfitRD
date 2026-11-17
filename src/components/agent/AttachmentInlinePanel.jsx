// [P1-PLAN-LOTE-1050 · 2026-11-16] «Añadir imagen» con el teclado abierto: un panel DENTRO del cuadro de escribir.
//
// Antes (lote 111) era un menú flotante en un portal, colocado midiendo el «+» con `getBoundingClientRect` y vuelto a
// medir en cada cambio de la ventana (MENU-FOTO-REANCLA). El dueño: «quiero que esté fusionado con el teclado y que
// cuando tire screenshot no se buguee». Un menú que se coloca por medidas queda fuera de sitio cada vez que el teclado o
// la ventana cambian sin avisar a tiempo (la captura de pantalla de iOS es una de esas). Aquí no se mide nada: el panel
// es parte del cuadro de escribir, que ya va pegado al teclado, así que sube, baja y se queda con él pase lo que pase.
//
// El contrato del modo menú no cambia: NO mueve el foco (el cuadro de texto sigue enfocado y el teclado de iOS no se
// cierra): `mousedown` y `pointerdown` van anulados en el panel. Se cierra con Escape, al tocar fuera o al elegir.
import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Camera, Images } from 'lucide-react';
import { useT } from '../../i18n';
import './AttachmentInlinePanel.css';

export function AttachmentInlinePanel({ open, onClose, onGallery, onCamera, triggerRef }) {
    const t = useT();
    const panelRef = useRef(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!open) return undefined;
        const fuera = (e) => {
            const dentro = panelRef.current?.contains(e.target) || triggerRef?.current?.contains?.(e.target);
            if (!dentro) onCloseRef.current();
        };
        const tecla = (e) => { if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); } };
        // [P1-PLAN-LOTE-1053] Un toque FUERA (también el que empieza un scroll de la conversación) lo cierra. El arrastre
        // que lo dejaba abierto empezaba SOBRE el panel, y ese lo frena el CSS (`touch-action: none`). No se escucha
        // `scroll`: la lista se recoloca sola al abrirse el panel y lo cerraría nada más abrir.
        document.addEventListener('pointerdown', fuera, true);
        document.addEventListener('keydown', tecla);
        return () => {
            document.removeEventListener('pointerdown', fuera, true);
            document.removeEventListener('keydown', tecla);
        };
    }, [open, triggerRef]);

    if (!open) return null;
    const noRobarFoco = (e) => e.preventDefault();
    return (
        <div
            ref={panelRef}
            className="attach-inline"
            role="group"
            aria-label={t('Añadir imagen')}
            onMouseDown={noRobarFoco}
            onPointerDown={noRobarFoco}
        >
            <button type="button" className="attach-inline-op" onClick={onGallery}>
                <span className="attach-inline-ico attach-inline-ico--galeria" aria-hidden="true"><Images size={20} /></span>
                <span className="attach-inline-txt">
                    <strong>{t('Galería')}</strong>
                    <small>{t('Hasta 4 fotos')}</small>
                </span>
            </button>
            <button type="button" className="attach-inline-op" onClick={onCamera}>
                <span className="attach-inline-ico attach-inline-ico--camara" aria-hidden="true"><Camera size={20} /></span>
                <span className="attach-inline-txt">
                    <strong>{t('Cámara')}</strong>
                    <small>{t('Hazla ahora')}</small>
                </span>
            </button>
        </div>
    );
}

AttachmentInlinePanel.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func.isRequired,
    onGallery: PropTypes.func.isRequired,
    onCamera: PropTypes.func.isRequired,
    triggerRef: PropTypes.object,
};

export default AttachmentInlinePanel;
