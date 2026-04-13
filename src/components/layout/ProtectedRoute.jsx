
import { Navigate, useLocation } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';

const ProtectedRoute = ({ children }) => {
    const { session, loadingAuth, loadingData, userProfile } = useAssessment();
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
    // redirigirlo al formulario de assessment (excepto si ya está ahí)
    const isOnAssessment = location.pathname === '/assessment';
    const isOnPlan = location.pathname === '/plan';
    const hasCompletedAssessment = userProfile?.health_profile 
        && Object.keys(userProfile.health_profile).length > 0;

    if (!hasCompletedAssessment && !isOnAssessment && !isOnPlan) {
        return <Navigate to="/assessment" replace />;
    }

    return children;
};

export default ProtectedRoute;
