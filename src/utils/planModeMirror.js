// [P1-GENERATE-TURNS-MODE-ON · 2026-08-14] El espejo local del modo, puesto al
// día cuando la generación de un plan ya lo encendió en el servidor.
//
// POR QUÉ EXISTE. El backend hace su parte: `ensure_plan_generation_enabled`
// (routers/plans.py) pone `user_profiles.plan_mode='plan'` al generar — «generar
// un plan ES el consentimiento de generar». Pero `isTrackingMode` lee el PERFIL
// primero y el espejo después, y justo después del SSE los dos siguen diciendo
// 'tracking': el perfil en contexto se cargó al entrar y nadie lo refrescó. La
// verdad ya cambió en la DB y la pantalla no se entera — el usuario paga su
// crédito, recibe el plan, y aterriza otra vez en el contador, que encima llama
// «en pausa» al plan recién generado.
//
// Es el mismo patrón que `planModeResume.js` ya documentó para reanudar: «el
// espejo se escribe ANTES del reload — sin él aterrizaría otra vez en el
// contador». Allí hay reload y aquí no, pero la causa y la cura son las mismas.
//
// LO QUE NO HACE: ningún PUT a /api/profile/plan-mode. Sería pedirle al servidor
// algo que acaba de hacer, y un segundo escritor del mismo campo es una carrera
// esperando ocurrir. Esto solo pone al cliente al día.
import { safeLocalStorageSet } from './safeLocalStorage';

export const marcarModoPlanTrasGenerar = () => {
    safeLocalStorageSet('mealfit_plan_mode', 'plan');
};
