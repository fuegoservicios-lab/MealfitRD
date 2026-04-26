
import { Navigate, useLocation } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';

const ProtectedRoute = ({ children }) => {
    const { session, loadingAuth, loadingData, userProfile, planData } = useAssessment();
    const location = useLocation();

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

    return children;
};

export default ProtectedRoute;
