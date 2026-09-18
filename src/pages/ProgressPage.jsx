// [P1-PLAN-LOTE-103 · 2026-09-18] La pestaña «Progreso» del modo plan: macros de hoy, micros de hoy e hidratación.
// El dueño: «cuando el generador está encendido quiero dividir lo que tenga que ver con progreso… en un apartado
// aparte». Es el MISMO dashboard del contador con `modo="plan"` (metas del plan, sin invitación a encenderlo):
// una sola pantalla de progreso para los dos modos, no dos que diverjan.
import DashboardTracking from '../components/dashboard/DashboardTracking';

export default function ProgressPage() {
    return <DashboardTracking modo="plan" />;
}
