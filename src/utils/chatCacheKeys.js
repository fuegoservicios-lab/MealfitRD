// [P2-CHAT-CACHE-XUSER · 2026-05-31] SSOT de las keys de localStorage del chat
// del Agente.
//
// Razón: estas keys son GLOBAL-keyed (NO llevan user_id). Sobrevivían al logout
// SPA (que es navegación, no reload) y al cambio de usuario en dispositivo
// compartido → el usuario B podía ver o rehidratar la conversación del usuario A
// (PII nutricional: condiciones, alergias, hábitos). Es el hermano omitido del
// sweep P1-XTAB-CACHE-LEAK / P2-DEPLETED-XUSER / P3-HIST-MODAL-CACHE-XUSER del
// 2026-05-30, que cerró la misma clase para inventario/historial/modales.
//
// Centralizadas aquí para que `_clearUserScopedCaches` (AssessmentContext, módulo
// EAGER) pueda borrarlas en logout/user-switch SIN importar `AgentPage.jsx` (lazy
// y pesado — importarlo desde el contexto eager lo arrastraría al bundle eager).
// AgentPage.jsx (productor/consumidor) también importa de aquí → cero drift de
// literales en un futuro bump de versión (v1→v2).
export const CHAT_MESSAGES_CACHE_KEY = 'mealfit_chat_messages_cache_v1';
export const CHAT_SESSIONS_CACHE_KEY = 'mealfit_chat_sessions_cache_v2';
export const CHAT_CURRENT_SESSION_KEY = 'mealfit_current_session';
