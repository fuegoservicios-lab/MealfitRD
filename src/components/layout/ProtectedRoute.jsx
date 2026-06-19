
import { Navigate, useLocation, useNavigationType } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';

const ProtectedRoute = ({ children }) => {
    const { session, loadingAuth, loadingData, userProfile, planData, isGuest } = useAssessment();
    const location = useLocation();
    const navigationType = useNavigationType();

    if (loadingAuth || loadingData) {
        // Mantenemos la pantalla limpia mientras auth termina,
        // asumiendo que un splash screen u 'otro cargando' cubre visualmente
        return <div className="h-screen w-screen bg-slate-50/50" />;
    }

    // [P1-GUEST-MODE · 2026-06-15] Sin sesión Y sin modo invitado → login.
    // Un invitado (flag activado por "Probar sin cuenta") SÍ pasa, pero acotado
    // al funnel del plan gratuito abajo.
    if (!session && !isGuest) {
        return <Navigate to="/login" replace />;
    }

    // [P1-GUEST-MODE · 2026-06-15] Modo invitado: permitir SOLO el funnel del
    // plan gratuito (landing → formulario → plan → dashboard + upgrade). Las
    // rutas con persistencia (despensa, historial, recetas, settings, chat) no
    // aplican a un invitado efímero → redirigir al dashboard, que muestra los
    // CTAs de "crea tu cuenta". El resto de la lógica (assessment incompleto,
    // landing POP) corre igual: para invitados `hasCompletedAssessment` = !!planData.
    if (!session && isGuest) {
        const GUEST_ROUTES = ['/', '/assessment', '/plan', '/dashboard', '/dashboard/upgrade'];
        if (!GUEST_ROUTES.includes(location.pathname)) {
            return <Navigate to="/dashboard" replace />;
        }
    }

    // Si el usuario está autenticado pero NO ha completado su evaluación,
    // redirigirlo al formulario de assessment (excepto si ya está ahí o en la landing)
    const isOnAssessment = location.pathname === '/assessment';
    const isOnPlan = location.pathname === '/plan';
    const isOnLanding = location.pathname === '/';
    const hasHealthProfile = userProfile?.health_profile
        && Object.keys(userProfile.health_profile).length > 0;
    // Acceso garantizado si ya tiene un plan generado (aunque el perfil aún no esté sincronizado)
    const hasCompletedAssessment = hasHealthProfile || !!planData;

    if (!hasCompletedAssessment && !isOnAssessment && !isOnPlan && !isOnLanding) {
        return <Navigate to="/assessment" replace />;
    }

    // [P3-LANDING-SKIP-POP-ONLY · 2026-05-20] Redirect `/` → `/dashboard`
    // SOLO en navegación POP (cold-start, refresh, browser back/forward).
    // Navegación PUSH/REPLACE (Link click → "Inicio" del menú de cuenta,
    // programatic navigate) preserva acceso a la landing.
    //
    // Evolución del día (5ª iteración cierra StrictMode bug):
    //   1. P3-MOBILE-LANDING-SKIP — gated por matchMedia(768px).
    //   2. P3-LANDING-SKIP-UNIVERSAL — sin gate viewport, bloqueaba "Inicio".
    //   3-4. P3-LANDING-SKIP-FIRST-VISIT — flag module-level con guards.
    //      Bug: StrictMode (P2-STRICT-MODE-ENABLE en main.jsx) invoca el
    //      componente 2× por render en dev. La 1ª invocación mutaba el
    //      flag → la 2ª veía el flag mutado y NO redirigía. React commitea
    //      el resultado de la 2ª → user veía la landing.
    //   5. Este: `useNavigationType()` de react-router es declarativo y
    //      puro — no muta nada, no side-effects en render, StrictMode-safe.
    //      'POP' captura cold-start + refresh + browser back; 'PUSH'/
    //      'REPLACE' captura Link clicks + navigate() programatico.
    //
    // [LANDING-SKIP-NO-PLAN-FLASH · 2026-06-01] El destino se decide AQUÍ sin pasar
    // por /dashboard. Pre-fix la condición era `hasCompletedAssessment` (que es
    // `health_profile` O plan): un usuario con perfil PERO SIN plan saltaba a
    // /dashboard, que rebota a /assessment por su propio guard `!planData` → el
    // usuario veía un "flash" del dashboard de unos ms en cada refresh de la
    // landing. Ahora:
    //   - Con PLAN real → /dashboard (el dashboard lo requiere; no rebota).
    //   - Con assessment completo pero SIN plan → /assessment directo (su destino
    //     real es el formulario; antes llegaba ahí igual pero pasando por el flash).
    //   - Sin assessment → no se redirige (cae al `return children` → ve la landing).
    if (isOnLanding && navigationType === 'POP') {
        // [LANDING-REFRESH-STAY · 2026-06-18] Un REFRESH (F5 / recargar) de la
        // landing mantiene al usuario EN la landing — no lo rebota al dashboard.
        // react-router marca refresh, cold-start y back/forward todos como 'POP';
        // la Performance Navigation API sí los distingue (type === 'reload' solo
        // en recarga del documento). Así, recargar la landing la conserva, mientras
        // que cold-start (URL tecleada / lanzamiento PWA → 'navigate'), OAuth-landing
        // y back/forward siguen cayendo en el redirect de abajo. Lectura pura del
        // timing → sin mutación, StrictMode-safe (no reintroduce el bug del flag
        // module-level). Si la API no existe, isReload=false → comportamiento previo.
        const navEntry = typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function'
            ? performance.getEntriesByType('navigation')[0]
            : undefined;
        if (navEntry?.type === 'reload') {
            return children;
        }
        if (planData) {
            return <Navigate to="/dashboard" replace />;
        }
        if (hasCompletedAssessment) {
            return <Navigate to="/assessment" replace />;
        }
        // [P1-NEON-AUTH-MIGRATION · 2026-06-13] Usuario autenticado SIN assessment
        // ni plan (cuenta recién creada) → al formulario de onboarding, NO a la
        // landing. Cubre el caso del OAuth de Google que aterriza en `/` (la
        // `redirectTo` no siempre se honra con el SDK de Neon Auth, y antes este
        // usuario quedaba colgado en la landing sin ser onboardeado). Solo POP
        // (cold-start / OAuth-landing / refresh) — si el usuario navega a la
        // landing con un Link explícito (PUSH), la puede seguir viendo.
        return <Navigate to="/assessment" replace />;
    }

    return children;
};

export default ProtectedRoute;
