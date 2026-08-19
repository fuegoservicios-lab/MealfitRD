// [P1-PLAN-MODE · 2026-08-11] LA nav del dashboard — un solo SSOT.
//
// Estaba duplicada a mano en DashboardLayout.jsx y BottomTabBar.jsx; con entradas que
// aparecen y desaparecen por modo, dos copias son dos verdades. Los iconos los pone
// cada consumidor (los estilos difieren); aquí viven las DECISIONES:
//   · En modo seguimiento, «Recetas» se oculta — con o sin plan pausado
//     (P1-TRACKING-WINS): mientras el contador manda, las recetas viven en el
//     Historial. Y «Plan» se rotula «Hoy»: tocar «Plan» y aterrizar en un diario
//     es una promesa incumplida.
//
// [P1-I18N-DASHBOARD · 2026-08-15] Los rótulos pasan por `t()` DENTRO de la
// función, nunca en una constante de módulo: una tabla de copy evaluada al
// importar corre antes de que exista el catálogo y se congela en español para
// siempre. Los dos consumidores llaman a `navItemsFor` en su render (y ambos
// están suscritos vía `useT()`), así que el cambio de idioma los alcanza.
// `Plan|nav` lleva sufijo de contexto: aquí es la PESTAÑA, no el sustantivo del
// producto («tu plan»), y hay idiomas donde no es la misma palabra.
import { t } from '../i18n';
import { safeLocalStorageGet } from '../utils/safeLocalStorage';

export const navItemsFor = ({ trackingMode = false } = {}) => [
    { key: 'plan', label: trackingMode ? t('Hoy') : t('Plan|nav'), path: '/dashboard' },
    { key: 'agent', label: t('Agente'), path: '/dashboard/agent' },
    { key: 'pantry', label: t('Nevera'), path: '/dashboard/pantry' },
    ...(trackingMode ? [] : [{ key: 'recipes', label: t('Recetas'), path: '/dashboard/recipes' }]),
    { key: 'history', label: t('Historial'), path: '/history' },
];

/** El modo, leído como lo lee el wrapper del Dashboard: perfil primero, espejo
 *  localStorage después — «no sé» jamás se trata como «tracking» para OCULTAR
 *  entradas (ocultar por error es peor que mostrar de más).
 *
 *  [P1-TRACKING-WINS · 2026-08-14] La regla «un plan vivo siempre gana» se
 *  INVIRTIÓ por decisión del owner. Nació como fail-open contra flags stale,
 *  pero de paso rompía la promesa de la otra puerta: entrar por el wizard
 *  diciendo «quiero la app solo como contador» aterrizaba en el dashboard del
 *  plan con una notita de pausa. Ahora la elección EXPLÍCITA de tracking gana,
 *  con o sin plan pausado — el plan queda en Historial con «Reanudar». El
 *  fail-open sobrevive donde tenía sentido: con modo DESCONOCIDO, un plan vivo
 *  sigue significando nav completa. */
 
export const isTrackingMode = (userProfile, _planData) => {
    let local = null;
    local = safeLocalStorageGet('mealfit_plan_mode', null);
    const mode = userProfile?.plan_mode || local;
    if (mode === 'tracking') return true;   // elección explícita: contador manda
    if (mode === 'plan') return false;
    return false; // desconocido: jamás ocultar por ignorancia (planData ya no pesa)
};
