// [P1-PLAN-MODE · 2026-08-11] LA nav del dashboard — un solo SSOT.
//
// Estaba duplicada a mano en DashboardLayout.jsx y BottomTabBar.jsx; con entradas que
// aparecen y desaparecen por modo, dos copias son dos verdades. Los iconos los pone
// cada consumidor (los estilos difieren); aquí viven las DECISIONES:
//   · En modo seguimiento sin plan, «Recetas» se oculta — no le falta el plan: ES el
//     plan. Y «Plan» se rotula «Hoy»: tocar «Plan» y aterrizar en un diario es una
//     promesa incumplida.
export const navItemsFor = ({ trackingMode = false } = {}) => [
    { key: 'plan', label: trackingMode ? 'Hoy' : 'Plan', path: '/dashboard' },
    { key: 'agent', label: 'Agente', path: '/dashboard/agent' },
    { key: 'pantry', label: 'Nevera', path: '/dashboard/pantry' },
    ...(trackingMode ? [] : [{ key: 'recipes', label: 'Recetas', path: '/dashboard/recipes' }]),
    { key: 'history', label: 'Historial', path: '/history' },
];

/** El modo, leído como lo lee el wrapper del Dashboard: perfil primero, espejo
 *  localStorage después — «no sé» jamás se trata como «tracking» para OCULTAR
 *  entradas (ocultar por error es peor que mostrar de más), y un plan vivo
 *  significa nav completa aunque el perfil diga otra cosa. */
export const isTrackingMode = (userProfile, planData) => {
    if (planData) return false; // con plan vivo, la nav completa siempre
    let local = null;
    try { local = localStorage.getItem('mealfit_plan_mode'); } catch { /* noop */ }
    return (userProfile?.plan_mode || local) === 'tracking';
};
