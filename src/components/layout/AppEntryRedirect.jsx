import { Navigate } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';
import { isTrackingMode } from '../../config/dashboardNav';

// Resolve only the app's entrance. Explicit tabs, deep links and app resumes
// keep their own route; ProtectedRoute still handles onboarding and recovery.
export default function AppEntryRedirect() {
    const { session, isGuest, userProfile, loadingAuth, loadingData, loadingProfile } = useAssessment();
    if (loadingAuth || loadingData || loadingProfile) return <div className="page-loader" />;
    const agentFirst = Boolean(session && !isGuest && isTrackingMode(userProfile));
    return <Navigate to={agentFirst ? '/dashboard/agent' : '/dashboard'} replace />;
}
