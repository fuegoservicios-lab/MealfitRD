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
//
// [P1-I18N-REANUDAR-TOASTS · 2026-08-22] Los cuatro toasts salían en español en los cinco
// idiomas, y la traducción de tres de ellos YA estaba escrita en los cuatro catálogos.
// Escapaban al detector de español sin envolver por FORMA, no por descuido:
// `toast.loading('Reanudando…', { duration: 20000 })` no pasa el filtro léxico (sin acento, sin palabra
// funcional) y `toast.success(cond ? 'a' : 'b')` es un ternario, que el escáner no mira.
//
// Duele más de lo que parece por DÓNDE está: es el único camino de vuelta desde la pausa
// del modo contador. O sea, la pantalla en la que un usuario no hispano decide si el
// producto le responde.
//
// SE LLAMA `t()` DENTRO DEL CUERPO, y no se cambia la firma. Dos razones, y la segunda es
// la que importa:
//
//   1. El congelado que este repo ya ha pagado varias veces ocurre cuando un `t('…')` se
//      EVALÚA en ámbito de módulo (al importar, antes de que exista catálogo). Aquí las
//      llamadas viven dentro de una función async que corre al hacer clic, así que leen el
//      catálogo ACTIVO. No hace falta parámetro.
//   2. Los tres call sites son `onClick={reanudarPlanes}`. Añadir un primer parámetro `t`
//      habría hecho que React le pasara el SyntheticEvent del clic — un arreglo que
//      parece correcto, pasa el gate de traducciones y rompe la función en producción.
import { toast } from 'sonner';
import { fetchWithAuth } from '../config/api';
import { t } from '../i18n';
import { mensajeDeError } from './errorCopy';
import { safeLocalStorageSet } from './safeLocalStorage';

export const reanudarPlanes = async () => {
    const tId = toast.loading(t('Reanudando…'), { duration: 20000, position: 'top-center' });
    try {
        const r = await fetchWithAuth('/api/profile/plan-mode', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_mode: 'plan' }),
        });
        const d = await r.json().catch(() => null);
        toast.dismiss(tId);
        if (!r.ok || !d?.success) {
            // [P1-I18N-SERVER-COPY-GANA] Antes: `d?.detail || 'No se pudo reanudar.'`. El
            // `detail` del servidor viene SIEMPRE en español, así que ganaba y el fallback
            // no se veía nunca. `mensajeDeError` traduce por `error_code` cuando lo hay y
            // manda el detail crudo a la consola, que es donde sirve.
            throw new Error(mensajeDeError(d, t('No se pudo reanudar.'), t));
        }
        safeLocalStorageSet('mealfit_plan_mode', 'plan');
        toast.success(d.plan_expired
            ? t('Planes reanudados. Tu plan venció la ventana: genera uno nuevo cuando quieras.')
            : t('Planes reanudados: la generación continúa donde quedó.'));
        setTimeout(() => window.location.reload(), 900);
        return true;
    } catch (e) {
        toast.dismiss(tId);
        // `e.message` ya viene traducido del throw de arriba; el `||` sólo cubre un fallo
        // de red, donde no hay mensaje que respetar.
        toast.error(e?.message || t('No se pudo reanudar.'));
        return false;
    }
};
