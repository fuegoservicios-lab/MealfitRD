
import { Navigate, useLocation, useNavigationType } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';

const ProtectedRoute = ({ children }) => {
    const { session, loadingAuth, loadingData, userProfile, planData } = useAssessment();
    const location = useLocation();
    const navigationType = useNavigationType();

    if (loadingAuth || loadingData) {
        // Mantenemos la pantalla limpia mientras auth termina,
        // asumiendo que un splash screen u 'otro cargando' cubre visualmente
        return <div className="h-screen w-screen bg-slate-50/50" />;
    }

    if (!session) {
        return <Navigate to="/login" replace />;
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
    if (isOnLanding && hasCompletedAssessment && navigationType === 'POP') {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

export default ProtectedRoute;
