// [P1-DEEP-SEARCH-PIPELINE · 2026-05-15] Boot hook que detecta si el user tiene
// un pipeline de generación de plan pendiente en el backend (status='generating'
// o 'complete' aún sin acknowledged) y redirige automáticamente:
//   - status='generating' + en ruta no-/plan → redirigir a /plan (mostrar loading).
//   - status='complete'  → toast "Tu plan está listo" + redirigir a /dashboard.
//   - status='failed'    → toast con error + opción de regenerar.
//
// Storage del flag: localStorage.mealfit_plan_in_progress (set por Plan.jsx
// al iniciar el SSE). Endpoint: GET /api/plans/pending-status.
//
// Polling: cada 10s mientras status='generating'. Single-shot al mount.
//
// Idempotente: tras toast + redirect, llama POST /pending-status/ack para
// limpiar el KV en backend y borra el flag de localStorage. Si el user
// recarga después, no entra en loop.
//
// Kill switch: VITE_DEEP_SEARCH_RECOVERY=false en .env.local (default true).

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../config/api';
import { useAssessment } from '../context/AssessmentContext';
// [P1-PLAN-HYDRATE-ON-COMPLETE · 2026-07-24] El flag vive en su propio modulo
// (lo comparte el Dashboard; exportar funciones desde un componente rompe fast-refresh).
import { readPendingFlag, clearPendingFlag, writePendingFlag, isStale } from '../utils/pendingPipelineFlag';

const POLL_INTERVAL_MS = 10_000; // 10s
// [P3-RECOVERY-BACKEND-DOWN-EXIT · 2026-05-16] Threshold de fallos
// consecutivos antes de asumir backend muerto. 6 polls × 10s = 60s.
// Si tras 1 min de polls fallidos no recibimos NADA (ni status=none),
// el backend probablemente está caído o el user perdió sesión. Cortar
// el loading screen y notificar.
const _FAIL_THRESHOLD = 6;

// [P1-GUEST-PLAN-RECOVERY · 2026-07-09] Session_id del guest (persistido por Plan.jsx al
// generar). Se pasa como query param a /pending-status + /ack + /guest-plan → el backend
// keyea el KV por session_id para guests (para autenticados, verified_user_id gana y el
// session_id se ignora). Ver backend.
function getGuestSessionId() {
    try { return localStorage.getItem('mealfit_guest_session_id') || null; } catch { return null; }
}

function _withSessionQS(path) {
    const sid = getGuestSessionId();
    return sid ? `${path}?session_id=${encodeURIComponent(sid)}` : path;
}

async function fetchPendingStatus() {
    try {
        const res = await fetchWithAuth(_withSessionQS('/api/plans/pending-status'), { method: 'GET' });
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

async function ackPendingStatus() {
    try {
        await fetchWithAuth(_withSessionQS('/api/plans/pending-status/ack'), { method: 'POST' });
    } catch { /* best-effort */ }
}

// [P1-GUEST-PLAN-RECOVERY · 2026-07-09] Recupera el plan guardado de un guest desde el KV backend.
// Los guests NO persisten en meal_plans → su plan vive en `guest_plan:<session_id>`.
async function fetchGuestPlan(sid) {
    if (!sid) return null;
    try {
        const res = await fetchWithAuth(`/api/plans/guest-plan?session_id=${encodeURIComponent(sid)}`, { method: 'GET' });
        if (!res.ok) return null;
        const body = await res.json();
        const plan = body && body.plan;
        if (plan && Array.isArray(plan.days) && plan.days.length > 0) return plan;
        return null;
    } catch { return null; }
}

export default function PendingPipelineRecovery() {
    const location = useLocation();
    const navigate = useNavigate();
    // [P1-GUEST-PLAN-RECOVERY · 2026-07-09] `saveGeneratedPlan` para adoptar el plan recuperado del guest
    // (mismo path que el success normal). Ref para acceso estable dentro de closures async del effect.
    const { saveGeneratedPlan, hydrateLatestPlan } = useAssessment() || {};
    const saveGeneratedPlanRef = useRef(saveGeneratedPlan);
    saveGeneratedPlanRef.current = saveGeneratedPlan;
    // [P1-PLAN-HYDRATE-ON-COMPLETE · 2026-07-24] Traer el plan del servidor al detectar
    // que el pipeline terminó. Sin esto, un usuario que YA está en /dashboard se queda
    // con el placeholder vacío (el `navigate('/dashboard')` de abajo es no-op) y ve
    // "Tu plan quedó incompleto" hasta refrescar a mano.
    const hydrateLatestPlanRef = useRef(hydrateLatestPlan);
    hydrateLatestPlanRef.current = hydrateLatestPlan;
    const pollTimerRef = useRef(null);
    const handledRef = useRef(false);
    // [P3-RECOVERY-NO-REDIRECT-LOOP · 2026-05-16] Toast informativo "una vez"
    // mientras el pipeline está `generating`. Sin este flag, el polling cada
    // 10s spammearía el mismo toast.
    const generatingToastShownRef = useRef(false);
    // [P3-RECOVERY-BACKEND-DOWN-EXIT · 2026-05-16] Counter de fallos
    // consecutivos del polling. Reset a 0 cuando una poll succeeds.
    const consecutiveFailuresRef = useRef(0);
    // [P1-RECOVERY-BACKEND-TRUTH · 2026-06-26] Guard para correr el check
    // INCONDICIONAL al backend (sin flag local) UNA sola vez por sesión, y un
    // tick de state que re-dispara el effect cuando sintetizamos el flag para
    // que el flujo de polling existente arranque (cubre el caso 'ya estoy en
    // /plan' donde el navigate sería no-op y no re-dispararía el effect).
    const bootCheckedRef = useRef(false);
    const [bootKick, setBootKick] = useState(0);

    useEffect(() => {
        // Kill switch
        const enabled = (
            import.meta.env.VITE_DEEP_SEARCH_RECOVERY ?? 'true'
        ).toString().toLowerCase() !== 'false';
        if (!enabled) return undefined;

        // Solo si el user está autenticado (guests no tienen KV tracking).
        // El check de auth lo hace `fetchWithAuth` internamente — si no hay
        // sesión, retorna 401 y nuestro `if (!res.ok)` salta. No necesitamos
        // pre-chequear aquí, lo cual evita una llamada redundante a
        // `auth.getUser()` en cada navegación.

        let cancelled = false;

        const flag = readPendingFlag();

        // [P1-RECOVERY-BACKEND-TRUTH · 2026-06-26] Sin flag local NO significa
        // "no hay nada que recuperar": el user pudo iniciar la generación en
        // OTRO dispositivo / navegador / móvil, o limpiar el storage. El KV del
        // backend (`pending_pipeline:<user>`) es la FUENTE DE VERDAD. Consulta
        // /pending-status UNA vez por sesión: si hay pipeline 'generating',
        // sintetiza el flag (→ el polling flag-gated de abajo toma el control y
        // muestra la pantalla de carga) + redirige a /plan; si 'complete' y el
        // user nunca lo vio (no acked), redirige al dashboard. Esto cierra el
        // objetivo del usuario: "aunque cierre la pestaña y vuelva (o entre desde
        // el móvil), si sigue cargando → pantalla de carga; si terminó → dashboard".
        // Es SEGURO contra redirects espurios porque un plan ya VISTO deja el KV
        // en 'none' (el flujo normal lo ackea al completar). Bounded a 1 query.
        if (!flag) {
            if (!bootCheckedRef.current) {
                bootCheckedRef.current = true;
                (async () => {
                    const status = await fetchPendingStatus();
                    if (cancelled || handledRef.current) return;
                    if (!status) return;
                    if (status.status === 'generating' && !isStale(status.started_at)) {
                        // Sintetiza el flag → re-dispara el effect (bootKick) → el
                        // polling de abajo arranca, aunque ya estemos en /plan.
                        writePendingFlag(status.started_at);
                        setBootKick((k) => k + 1);
                        if (location.pathname !== '/plan') {
                            if (!generatingToastShownRef.current) {
                                generatingToastShownRef.current = true;
                                try {
                                    const { toast } = await import('sonner');
                                    toast.info('Retomando tu plan en curso', {
                                        description: 'Te llevamos a la pantalla de carga.',
                                        duration: 4000,
                                    });
                                } catch { /* noop */ }
                            }
                            navigate('/plan', { replace: true });
                        }
                    } else if (status.status === 'complete') {
                        handledRef.current = true;
                        // [P1-GUEST-PLAN-RECOVERY · 2026-07-09] Guest (sin plan_id_final): recuperar el
                        // plan del KV backend y adoptarlo (mismo path que el success normal) antes de
                        // ir al dashboard. Autenticado (con plan_id_final): el dashboard lo carga solo.
                        let _guestPlan = null;
                        if (!status.plan_id_final) {
                            _guestPlan = await fetchGuestPlan(getGuestSessionId());
                            if (_guestPlan && saveGeneratedPlanRef.current) {
                                try { saveGeneratedPlanRef.current(_guestPlan); } catch { /* noop */ }
                            }
                        }
                        await ackPendingStatus();
                        if (status.plan_id_final || _guestPlan) {
                            // [P1-PLAN-HYDRATE-ON-COMPLETE · 2026-07-24] Hidratar ANTES de
                            // navegar: el `navigate` de abajo es no-op si el usuario ya está
                            // en /dashboard, y sin traer el plan la UI se queda con el
                            // placeholder vacío ("Tu plan quedó incompleto") hasta un reload.
                            if (status.plan_id_final) {
                                try { await hydrateLatestPlanRef.current?.({ force: true, expectPlanId: status.plan_id_final, src: 'recovery' }); } catch { /* noop */ }
                            }
                            try {
                                const { toast } = await import('sonner');
                                toast.success('Tu plan está listo 🎉', {
                                    description: 'Te llevamos al dashboard.',
                                    duration: 3500,
                                });
                            } catch { /* noop */ }
                            navigate('/dashboard', { replace: true });
                        }
                        // guest sin plan recuperable → no forzar navegación (evita loop).
                    }
                    // 'none' / 'failed' → no auto-redirect (el user no estaba esperando).
                })();
            }
            return () => { cancelled = true; };
        }

        // Si el flag local es viejo (> MAX_AGE_MIN = 6h), limpiar y salir.
        if (isStale(flag.started_at)) {
            clearPendingFlag();
            return undefined;
        }

        async function checkOnce() {
            if (cancelled || handledRef.current) return;
            const status = await fetchPendingStatus();
            if (cancelled || handledRef.current) return;
            if (!status) {
                // [P3-RECOVERY-BACKEND-DOWN-EXIT · 2026-05-16] Counter de
                // fallos consecutivos. `fetchPendingStatus` retorna null
                // cuando el backend está caído (network error) o el user
                // perdió sesión (401). Si esto persiste por N polls
                // consecutivos (~_FAIL_THRESHOLD * POLL_INTERVAL_MS),
                // asumimos backend muerto / inalcanzable. Sin este exit,
                // el user queda en loading screen INDEFINIDAMENTE sin
                // forma de saber qué pasó.
                consecutiveFailuresRef.current += 1;
                if (consecutiveFailuresRef.current >= _FAIL_THRESHOLD) {
                    handledRef.current = true;
                    clearPendingFlag();
                    try {
                        const { toast } = await import('sonner');
                        toast.error('Sin conexión con el servidor', {
                            description: 'No pudimos verificar tu plan. Vuelve a intentar.',
                            duration: 8000,
                        });
                    } catch { /* noop */ }
                    // Solo navegar si estamos en /plan (donde el user
                    // espera el plan). En otras rutas, dejarlo donde está
                    // — el toast ya le comunicó el problema.
                    if (location.pathname === '/plan') {
                        navigate('/assessment', { replace: true });
                    }
                }
                return;
            }
            // Reset counter on success (backend volvió a responder).
            consecutiveFailuresRef.current = 0;

            if (status.status === 'complete') {
                handledRef.current = true;
                clearPendingFlag();
                // [P1-GUEST-PLAN-RECOVERY · 2026-07-09] Guest (sin plan_id_final): recuperar + adoptar el
                // plan del KV backend antes del dashboard. Autenticado: el dashboard lo carga por id.
                let _guestPlan = null;
                if (!status.plan_id_final) {
                    _guestPlan = await fetchGuestPlan(getGuestSessionId());
                    if (_guestPlan && saveGeneratedPlanRef.current) {
                        try { saveGeneratedPlanRef.current(_guestPlan); } catch { /* noop */ }
                    }
                }
                await ackPendingStatus();
                if (status.plan_id_final || _guestPlan) {
                    // [P1-PLAN-HYDRATE-ON-COMPLETE · 2026-07-24] Mismo motivo que en el
                    // camino de boot: hidratar antes de navegar (el navigate es no-op si
                    // ya estamos en /dashboard). Este es el camino que corre cuando el
                    // pipeline termina con la pestaña abierta — el caso reportado en vivo.
                    if (status.plan_id_final) {
                        try { await hydrateLatestPlanRef.current?.({ force: true, expectPlanId: status.plan_id_final, src: 'recovery' }); } catch { /* noop */ }
                    }
                    // Toast informativo + redirect.
                    try {
                        const { toast } = await import('sonner');
                        toast.success('Tu plan está listo 🎉', {
                            description: 'Te llevamos al dashboard.',
                            duration: 3500,
                        });
                    } catch { /* sonner no disponible — silencioso */ }
                    navigate('/dashboard', { replace: true });
                }
                // guest sin plan recuperable → no forzar navegación (evita loop).
            } else if (status.status === 'failed') {
                handledRef.current = true;
                clearPendingFlag();
                await ackPendingStatus();
                try {
                    const { toast } = await import('sonner');
                    toast.error('La generación falló', {
                        description: status.error || 'Intenta de nuevo.',
                        duration: 6000,
                    });
                } catch { /* noop */ }
                // No forzar navegación; el user decide.
            } else if (status.status === 'generating') {
                // [P3-PLAN-RECOVERY-LOADING · 2026-05-16] Re-habilitado el
                // redirect a /plan cuando `status='generating'` Y el user NO
                // está ya en /plan. Cierra el gap original del usuario: al
                // volver tras cerrar laptop/tab, el plan sigue generándose
                // pero el user landed en /assessment (form) sin saber.
                //
                // El loop infinito que cerraba P3-RECOVERY-NO-REDIRECT-LOOP
                // (recovery → /plan → SSE → 409 → /dashboard → recovery → ...)
                // ya NO ocurre porque Plan.jsx ahora detecta el pending en
                // su processPlan PRE-SSE y entra en MODO RECOVERY (skip SSE,
                // solo muestra loading). Sin SSE, no hay 409. Sin 409, no
                // hay redirect a /dashboard. Sin redirect, no hay loop.
                //
                // Cuando status='complete', la rama de arriba redirige a
                // /dashboard como siempre.
                if (location.pathname !== '/plan') {
                    if (!generatingToastShownRef.current) {
                        generatingToastShownRef.current = true;
                        try {
                            const { toast } = await import('sonner');
                            toast.info("Retomando tu plan en curso", {
                                description: "Te llevamos a la pantalla de carga.",
                                duration: 4000,
                            });
                        } catch { /* sonner no disponible — silencioso */ }
                    }
                    navigate('/plan', { replace: true });
                    // No marcamos handledRef aquí — el polling sigue para
                    // detectar 'complete' y redirigir al dashboard cuando
                    // termine. Cuando estemos en /plan, el navigate es no-op
                    // y solo seguimos polling.
                } else {
                    // Ya estamos en /plan — solo toast informativo dedupeado.
                    if (!generatingToastShownRef.current) {
                        generatingToastShownRef.current = true;
                        try {
                            const { toast } = await import('sonner');
                            toast.info("Tu plan se está generando", {
                                description: "Te avisamos cuando esté listo.",
                                duration: 5000,
                            });
                        } catch { /* sonner no disponible — silencioso */ }
                    }
                }
                // Continúa polling — el cleanup se hará al recibir 'complete' o 'failed'.
            } else {
                // status === 'none' → backend ya limpió o nunca existió. Limpiar local.
                clearPendingFlag();
            }
        }

        // Disparo inmediato + interval mientras `status='generating'`.
        checkOnce();
        pollTimerRef.current = setInterval(() => {
            if (handledRef.current) {
                clearInterval(pollTimerRef.current);
                return;
            }
            // [P3-RECOVERY-POLL-VISIBILITY · 2026-05-31] No pollear el backend
            // mientras la pestaña está oculta — desperdicia requests en una tab
            // en background durante la ventana de generación. Espejo de
            // P2-DASH-POLL-VISIBILITY (Dashboard 30s) y P1-PLAN-POLL-VISIBILITY
            // (Plan 5s). Cero pérdida de frescura: el listener de
            // `visibilitychange` (abajo → handleResume → checkOnce) dispara un
            // check inmediato al volver a primer plano.
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            checkOnce();
        }, POLL_INTERVAL_MS);

        // [P1-RECOVERY-SUSPEND-FIX · 2026-05-16] Eventos del browser que
        // indican que el user "volvió" tras un periodo inactivo:
        //   - `visibilitychange` con visibilityState='visible': la pestaña
        //     vuelve a primer plano (incluye recuperación de suspend/sleep).
        //   - `online`: la conexión de red volvió (suspend cortó WiFi/eth).
        //   - `focus` (defensivo): user vuelve al window/tab.
        // Sin estos listeners, tras un suspend el user puede esperar HASTA
        // 10s (el próximo tick del setInterval) antes de saber que su plan
        // está listo. Disparar `checkOnce()` inmediatamente cierra ese gap.
        const handleResume = () => {
            if (cancelled || handledRef.current) return;
            // Solo si la pestaña está visible. `online` puede disparar
            // mientras la pestaña sigue oculta — postpone hasta `visibilitychange`.
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
                return;
            }
            checkOnce();
        };
        const handleVisibility = () => {
            if (typeof document === 'undefined') return;
            if (document.visibilityState === 'visible') handleResume();
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('online', handleResume);
            window.addEventListener('focus', handleResume);
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibility);
        }

        return () => {
            cancelled = true;
            if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
            if (typeof window !== 'undefined') {
                window.removeEventListener('online', handleResume);
                window.removeEventListener('focus', handleResume);
            }
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibility);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname, bootKick]);

    return null; // headless component
}
