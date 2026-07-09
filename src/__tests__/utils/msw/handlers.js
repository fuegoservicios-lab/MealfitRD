/**
 * [P1-4 · MSW handlers default] Respuestas por-defecto de los endpoints que
 * consumen los surfaces de estado de servidor. Minimas pero con shape valido —
 * cada test override lo que necesite con `server.use(...)`.
 *
 * Match por comodin de origen (prefijo asterisco-slash) para ser robustos al
 * API_BASE de test (import.meta.env.DEV -> 'http://127.0.0.1:3001') vs same-origin.
 */
import { http, HttpResponse } from 'msw';

export const handlers = [
    http.get('*/api/plans/history-list', () => HttpResponse.json({ plans: [] })),
    http.get('*/api/plans/lessons-counts', () => HttpResponse.json({ counts: {} })),
    http.get('*/api/plans/history-status-summary', () => HttpResponse.json({ summary: {} })),
    http.get('*/api/profile', () => HttpResponse.json({})),
    http.get('*/api/inventory', () => HttpResponse.json({ items: [] })),
    http.get('*/api/plans-data/latest', () => HttpResponse.json({})),
];
