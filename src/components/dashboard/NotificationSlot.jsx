// [P1-PLAN-LOTE-89 · 2026-09-17] El hueco de la cabecera donde atraca la campana de notificaciones
// en teléfono y tableta (ver `utils/notifSlot.js`). Lo monta cada cabecera móvil junto a su menú.
//
// Mide SIEMPRE 40×40 aunque esté vacío: la campana desaparece a ratos (p. ej. con un modal que la
// oculta) y sin tamaño propio el botón del menú saltaría de sitio cada vez.
import { useLayoutEffect, useRef } from 'react';
import { registerNotifSlot, unregisterNotifSlot } from '../../utils/notifSlot';

const _STYLE = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    flex: 'none',
};

const NotificationSlot = () => {
    const ref = useRef(null);
    // Layout effect y no effect: la campana debe atracar ANTES del primer pintado, o se vería
    // un instante en el borde derecho.
    useLayoutEffect(() => {
        const node = ref.current;
        registerNotifSlot(node);
        return () => unregisterNotifSlot(node);
    }, []);
    return <span ref={ref} data-notif-slot="" style={_STYLE} />;
};

export default NotificationSlot;
