import { nativePlatform } from '../config/platform';
import { BRAND } from '../data/routeMeta';

/**
 * Devuelve las instrucciones exactas para reactivar las notificaciones bloqueadas
 * según el canal ('local' nativo vs navegador web) y la plataforma/navegador.
 */
export function mensajePermisoBloqueado(canal, t) {
    if (canal === 'local') {
        return nativePlatform() === 'android'
            ? t('Las notificaciones de {app} están apagadas en tu teléfono. Actívalas en Ajustes → Aplicaciones → {app} → Notificaciones.', { app: BRAND })
            : t('Las notificaciones de {app} están apagadas en tu iPhone. Actívalas en Ajustes → Notificaciones → {app}.', { app: BRAND });
    }

    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    const isBrave = typeof navigator !== 'undefined' && (typeof navigator.brave !== 'undefined' || ua.includes('Brave'));
    const isFirefox = ua.includes('Firefox');
    const isEdge = ua.includes('Edg/');
    const isSafari = ua.includes('Safari') && !ua.includes('Chrome');

    if (isBrave) return t('Brave bloquea notificaciones por defecto. Haz clic en el escudo 🛡 de la barra de direcciones → Permisos del sitio → Notificaciones → Permitir.');
    if (isFirefox) return t('Permisos bloqueados en Firefox. Haz clic en el ícono de candado 🔒 en la barra de direcciones → Más información → Permisos → Notificaciones → Permitir.');
    if (isSafari) return t('Permisos bloqueados en Safari. Ve a Safari → Configuración para este sitio web → Notificaciones → Permitir.');
    if (isEdge) return t('Permisos bloqueados en Edge. Haz clic en el candado 🔒 en la barra de direcciones → Permisos para este sitio → Notificaciones → Permitir.');
    return t('Permisos bloqueados en el navegador. Haz clic en el candado 🔒 en la barra de direcciones → Permisos del sitio → Notificaciones → Permitir.');
}
