// [P2-8 · 2026-07-09] Banner global "Sin conexión". App PWA-first en mercado
// de conectividad intermitente sin señal ambiental de offline — el usuario
// descubría la falta de red recién cuando un botón fallaba. No-bloqueante
// (pointer-events: none), bottom (no choca con el Toaster top-center),
// aria-live para que el lector de pantalla lo anuncie al cambiar.
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

const OfflineBanner = () => {
    const online = useOnlineStatus();
    if (online) return null;
    return (
        <div className="offline-banner" role="status" aria-live="polite">
            <WifiOff size={14} strokeWidth={2.5} aria-hidden="true" />
            <span>Sin conexión — mostrando datos guardados</span>
        </div>
    );
};

export default OfflineBanner;
