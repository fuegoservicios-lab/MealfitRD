
import { Navigate } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';

const ProtectedRoute = ({ children }) => {
    const { session, loadingAuth } = useAssessment();

    if (loadingAuth) {
        // Simple loading state while checking session
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B'
            }}>
                Cargando...
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

export default ProtectedRoute;
