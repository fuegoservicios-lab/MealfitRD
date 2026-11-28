// [P1-PLAN-LOTE-1059 · plan 1030] El resumen del juego del servidor, con caché local para pintar al instante.
// Se refresca al cambiar el diario y al volver a la app (como la tarjeta de la semana).
import { useEffect, useState } from 'react';
import { leerResumenGuardado, pedirResumen } from '../utils/progresoServidor';

export function useResumenDeProgreso(userId) {
    const [resumen, setResumen] = useState(() => leerResumenGuardado(userId));
    const [version, setVersion] = useState(0);

    useEffect(() => {
        if (!userId) return undefined;
        let vivo = true;
        (async () => {
            try {
                const r = await pedirResumen(userId);
                if (vivo && r) setResumen(r);
            } catch { /* sin red: se queda lo guardado */ }
        })();
        return () => { vivo = false; };
    }, [userId, version]);

    useEffect(() => {
        const refrescar = () => setVersion((v) => v + 1);
        // Mismo contrato que la tarjeta de la semana: lo que borra la propia tarjeta de hoy no pide nada (lote 105).
        const alCambiarElDiario = (e) => { if (e?.detail?.source !== 'tracking-progress') refrescar(); };
        const alVolver = () => { if (!document.hidden) refrescar(); };
        window.addEventListener('mealfit:diary-changed', alCambiarElDiario);
        window.addEventListener('mealfit:water-changed', refrescar);
        window.addEventListener('mealfit:profile-updated', refrescar);
        window.addEventListener('mealfit:targets-changed', refrescar);
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            window.removeEventListener('mealfit:diary-changed', alCambiarElDiario);
            window.removeEventListener('mealfit:water-changed', refrescar);
            window.removeEventListener('mealfit:profile-updated', refrescar);
            window.removeEventListener('mealfit:targets-changed', refrescar);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, []);

    return resumen;
}

export default useResumenDeProgreso;
