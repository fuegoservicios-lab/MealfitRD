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
    // [P1-PLAN-LOTE-102 · 2026-09-18] «Progreso», no «Hoy»: la pestaña es el contador (macros, hidratación), y «Hoy»
    // no decía de qué (el dueño).
    { key: 'plan', label: trackingMode ? t('Progreso') : t('Plan|nav'), path: '/dashboard' },
    // [P1-PLAN-LOTE-103 · 2026-09-18] En modo plan, «Progreso» es pestaña propia: macros y micros de hoy e hidratación
    // salen del dashboard del plan (el dueño: «dividir lo que tenga que ver con progreso en un apartado aparte»).
    // En modo contador NO se duplica: ahí «Progreso» ya es la primera.
    ...(trackingMode ? [] : [{ key: 'progress', label: t('Progreso'), path: '/dashboard/progress' }]),
    { key: 'agent', label: t('Agente'), path: '/dashboard/agent' },
    { key: 'pantry', label: t('Nevera'), path: '/dashboard/pantry' },
    ...(trackingMode ? [] : [{ key: 'recipes', label: t('Recetas'), path: '/dashboard/recipes' }]),
    { key: 'history', label: t('Historial'), path: '/history' },
];

// [P1-PLAN-LOTE-119 · 2026-09-19] El reparto del TELÉFONO. Con el generador encendido la nav tiene 6 entradas y la
// barra de pestañas se veía «con demasiados apartados» (el dueño): 6 celdas de 65 px con los rótulos apretados, una
// más de las 5 que aguanta una barra inferior. Lo que NO cabe va al menú ☰ de la cabecera, y sale por orden de
// `SALEN_PRIMERO`: el Historial es el destino menos diario (se entra a recuperar un plan viejo, no a vivir el de hoy).
// En modo contador son 4 y nadie se mueve — ahí el Historial es además donde viven las recetas.
// El lateral de escritorio y el menú del Agente siguen pintando `navItemsFor` ENTERO: no tienen ese límite.
export const TAB_BAR_MAX = 5;
const SALEN_PRIMERO = ['history'];

export const repartoTelefono = (items) => {
    const fuera = new Set();
    for (const key of SALEN_PRIMERO) {
        if (items.length - fuera.size <= TAB_BAR_MAX) break;
        if (items.some((it) => it.key === key)) fuera.add(key);
    }
    return {
        barra: items.filter((it) => !fuera.has(it.key)),
        menu: items.filter((it) => fuera.has(it.key)),
    };
};

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
