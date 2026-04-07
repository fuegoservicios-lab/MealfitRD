
import { Navigate } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';

const ProtectedRoute = ({ children }) => {
    const { session, loadingAuth } = useAssessment();

    if (loadingAuth) {
        // Mantenemos la pantalla limpia mientras auth termia, 
        // asumiendo que un splash screen u 'otro cargando' cubre visualmente
        return <div className="h-screen w-screen bg-slate-50/50" />;
    }

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

export default ProtectedRoute;
