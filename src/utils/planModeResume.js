// [P1-TRACKING-WINS · 2026-08-14] Reanudar la generación de planes — UN solo
// camino. Vivía inline en la nota de pausa de DashboardInner, pero bajo
// «contador manda» el usuario en tracking ya no llega a esa pantalla: el
// Reanudar debe existir también en el contador (DashboardTracking). Dos copias
// del mismo PUT+espejo+reload drifean (la lección de las 3 tablas de dieta);
// esto es la única definición.
//
// El PUT es quota-exento (P1-PLAN-MODE): reanudar jamás devuelve 402. El espejo
// localStorage se escribe ANTES del reload — el wrapper del Dashboard lo lee
// cuando el perfil llega lento y sin él el reload aterrizaría otra vez en el
// contador.
import { toast } from 'sonner';
import { fetchWithAuth } from '../config/api';
import { safeLocalStorageSet } from './safeLocalStorage';

export const reanudarPlanes = async () => {
    const tId = toast.loading('Reanudando…', { position: 'top-center' });
    try {
        const r = await fetchWithAuth('/api/profile/plan-mode', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_mode: 'plan' }),
        });
        const d = await r.json().catch(() => null);
        toast.dismiss(tId);
        if (!r.ok || !d?.success) throw new Error(d?.detail || 'No se pudo reanudar.');
        safeLocalStorageSet('mealfit_plan_mode', 'plan');
        toast.success(d.plan_expired
            ? 'Planes reanudados. Tu plan venció la ventana: genera uno nuevo cuando quieras.'
            : 'Planes reanudados: la generación continúa donde quedó.');
        setTimeout(() => window.location.reload(), 900);
        return true;
    } catch (e) {
        toast.dismiss(tId);
        toast.error(e?.message || 'No se pudo reanudar.');
        return false;
    }
};
