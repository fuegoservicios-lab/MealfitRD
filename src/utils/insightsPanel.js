// [P1-REASONING-DISMISS · 2026-06-26] SSOT del "desocultar" del panel de
// Razonamiento (Diagnóstico / Plan de Acción / Tip del Chef) desde el centro de
// notificaciones. Espeja a restoreMicrosPanel (MicronutrientPanel.jsx): el centro
// llama a `restoreInsightsPanel(sig)` → (1) limpia la dismissal persistida (cubre
// el caso en que el panel NO está montado, p.ej. el usuario está en otra ruta);
// (2) dispara un evento para que un Dashboard YA montado re-muestre el panel al
// instante. `sig` = firma estable del plan (mealfit_insights_dismissed_<sig>).

import { safeLocalStorageRemove } from './safeLocalStorage';

export const INSIGHTS_RESTORE_EVENT = 'mealfit:insights-restore';

export function insightsDismissKey(sig) {
    return `mealfit_insights_dismissed_${sig || 'default'}`;
}

export function restoreInsightsPanel(sig) {
    if (sig) {
        safeLocalStorageRemove(insightsDismissKey(sig));
        safeLocalStorageRemove(`mealfit_insights_notif_backfilled_${sig}`);
    }
    try {
        window.dispatchEvent(new CustomEvent(INSIGHTS_RESTORE_EVENT, { detail: { sig: sig || null } }));
    } catch {
        /* SSR / sin window */
    }
}
