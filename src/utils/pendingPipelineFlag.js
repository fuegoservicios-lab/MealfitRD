// [P1-PLAN-HYDRATE-ON-COMPLETE · 2026-07-24] Flag local de "hay una generación de plan
// en vuelo". Vivía dentro de `components/PendingPipelineRecovery.jsx`; se extrae porque
// ahora también lo consulta el Dashboard (para no gritar "Tu plan quedó incompleto"
// mientras el backend sigue trabajando) y compartir funciones desde un módulo de
// componente rompe fast-refresh (react-refresh/only-export-components).
//
// Un solo módulo dueño de la clave → cero drift entre lectores.

const LS_KEY = 'mealfit_plan_in_progress';

// [P1-RECOVERY-BACKEND-TRUTH · 2026-06-26] Si el usuario cierra el portátil 8 horas y
// vuelve, el pipeline backend SÍ terminó y el row del KV está en `status='complete'`.
// Cortar por timestamp local pierde ese caso. 6h de margen (suspend overnight); el cron
// `_finalize_zombie_partial_plans` limpia rows >24h.
const MAX_AGE_MIN = 360;

export function readPendingFlag() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch { return null; }
}

export function clearPendingFlag() {
    try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
}

// Escribe el flag sintetizándolo desde la verdad del backend (KV). Se usa cuando el user
// vuelve SIN flag local (otro dispositivo, storage limpiado) pero el backend SÍ tiene un
// pipeline 'generating' → al escribirlo, el polling flag-gated toma el control.
export function writePendingFlag(startedAtIso) {
    try {
        let uid = null;
        try { uid = localStorage.getItem('mealfit_user_id') || null; } catch { /* noop */ }
        localStorage.setItem(LS_KEY, JSON.stringify({
            user_id: uid,
            started_at: startedAtIso || new Date().toISOString(),
        }));
    } catch { /* noop */ }
}

export function isStale(startedAtIso) {
    try {
        const ageMin = (Date.now() - new Date(startedAtIso).getTime()) / 60_000;
        return ageMin > MAX_AGE_MIN;
    } catch { return true; }
}

/**
 * ¿Hay una generación en vuelo (flag local fresco)?
 *
 * El Dashboard lo consulta para NO mostrar "Tu plan quedó incompleto" mientras el backend
 * sigue trabajando: un plan recién nacido pasa legítimamente por `generation_status =
 * 'partial'` con `days: []`, que es exactamente la condición del banner. Reportado en vivo
 * el 2026-07-24 — el plan terminó perfecto y el usuario vio el banner igual.
 */
export function hasPendingPipelineInFlight() {
    const flag = readPendingFlag();
    if (!flag?.started_at) return false;
    return !isStale(flag.started_at);
}
