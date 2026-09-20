// [P1-PLAN-LOTE-103 · 2026-09-18] La pestaña «Progreso» del modo plan: macros de hoy, micros de hoy e hidratación.
// El dueño: «cuando el generador está encendido quiero dividir lo que tenga que ver con progreso… en un apartado
// aparte». Es el MISMO dashboard del contador con `modo="plan"` (metas del plan, sin invitación a encenderlo):
// una sola pantalla de progreso para los dos modos, no dos que diverjan.
import { Navigate } from 'react-router-dom';
import DashboardTracking from '../components/dashboard/DashboardTracking';
import { useAssessment } from '../context/AssessmentContext';
import { isTrackingMode } from '../config/dashboardNav';

export default function ProgressPage() {
    const { userProfile } = useAssessment();
    // [P1-PLAN-LOTE-137 · 2026-09-20] En modo contador «Progreso» ES `/dashboard` (la nav no duplica la pestaña). Quien
    // llegaba aquí por una URL vieja con un plan EN PAUSA veía las kcal congeladas de ese plan como su meta —
    // `modo="plan"` las toma de `planData`— mientras su contador pintaba las de `/api/nutrition/targets`, y sin
    // ninguna pestaña marcada. Contador manda: una sola pantalla de progreso, la suya.
    if (isTrackingMode(userProfile)) return <Navigate to="/dashboard" replace />;
    return <DashboardTracking modo="plan" />;
}
