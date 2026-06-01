// [P2-AGENT-VIRTUOSO-LAZY · 2026-05-31] SSOT del threshold de virtualización
// del chat, extraído de VirtualizedMessageList.jsx.
//
// Razón: AgentPage necesita el valor del threshold para decidir si renderiza
// la lista virtualizada, pero importarlo desde VirtualizedMessageList.jsx
// arrastraba `react-virtuoso` (~28KB gzip) al chunk de AgentPage — que se monta
// keep-alive para TODOS los usuarios que abren el chat (P1-AGENT-KEEP-ALIVE),
// aunque la virtualización solo aplica en sesiones >100 mensajes (~1% del uso).
// Con la constante en su propio módulo liviano, AgentPage lee el threshold sin
// tocar react-virtuoso, y el componente pesado se carga via lazy() solo cuando
// se cruza el umbral. VirtualizedMessageList.jsx re-importa este valor.
export const VIRTUALIZE_THRESHOLD = 100;
