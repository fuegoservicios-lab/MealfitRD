/**
 * [P1-PLAN-LOTE-761 · 2026-09-28] Volver a la app con la respuesta en vuelo y la conexión COLGADA: el chat pregunta al
 * servidor, ve que el turno ya terminó (desde el 760 se guarda aunque salgas) y adopta la respuesta guardada — sin los
 * 5 minutos de «Pensando…» del vigilante del silencio. Página de verdad, backend simulado.
 *
 * El turno se abre con la foto pendiente del 690/695 (dos toques = un envío), que es el único camino del arnés que
 * manda un turno sin pasar por la preparación de imágenes.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { guardarFotoPendiente } from '../utils/fotoAntesDelCoach';

const UID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SID = '44444444-5555-4666-8777-888888888888';
const CMID = '11111111-2222-4333-8444-555555555555';

const estado = {
    session: { user: { id: UID } }, userProfile: { id: UID }, planData: null, formData: { name: 'Angelo' },
    updateData: vi.fn(), saveGeneratedPlan: vi.fn(), checkPlanLimit: vi.fn(), restoreSessionData: vi.fn(),
};
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => estado }));

const servidor = { terminado: false, streams: 0 };
vi.mock('../config/api', async (importOriginal) => {
    const real = await importOriginal();
    const json = (body) => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });
    return {
        ...real,
        fetchWithAuth: vi.fn(async (url, opts) => {
            if (url.startsWith('/api/chat/sessions/')) return json({ sessions: [], has_more: false });
            if (url.startsWith(`/api/chat/history/${SID}`)) {
                const base = [{ role: 'model', content: 'Aún no veo tu cena: ¿te animas?' }];
                if (!servidor.terminado) return json({ messages: base, turn_active: servidor.streams > 0 });
                return json({
                    messages: [
                        ...base,
                        { role: 'user', content: 'Mi cena\n2 huevos · Maduro', client_message_id: CMID },
                        { role: 'model', content: 'Anotada tu cena: 568 kcal.' },
                    ],
                    turn_active: false,
                });
            }
            if (url === '/api/chat/stream') {
                servidor.streams += 1;
                const enc = new TextEncoder();
                let primero = true;
                // la conexión «colgada»: tras un primer evento, el lector espera para siempre… salvo que lo aborten
                return {
                    ok: true, status: 200, headers: { get: () => null },
                    body: { getReader: () => ({ read: () => {
                        if (primero) {
                            primero = false;
                            return Promise.resolve({ done: false, value: enc.encode(`data: ${JSON.stringify({ type: 'progress', message: '…' })}\n\n`) });
                        }
                        return new Promise((_, reject) => {
                            opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
                        });
                    } }) },
                };
            }
            return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
        }),
    };
});
vi.mock('../utils/chatDraftStore', () => ({
    loadChatDraft: vi.fn(async () => null), saveChatDraft: vi.fn(async () => {}),
    deleteChatDraft: vi.fn(async () => {}), clearAllChatDrafts: vi.fn(async () => {}),
}));

import AgentPage from '../pages/AgentPage';

const hoy = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

vi.setConfig({ testTimeout: 30000 });

let oculto = false;
let extra = 0;
const nowReal = Date.now.bind(Date);

beforeAll(() => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
    if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    if (!globalThis.IntersectionObserver) {
        globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
    }
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculto });
});

beforeEach(() => {
    window.localStorage.clear();
    servidor.terminado = false;
    servidor.streams = 0;
    oculto = false;
    extra = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => nowReal() + extra);
    window.localStorage.setItem('mealfit_current_session', SID);
    window.localStorage.setItem('mealfit_current_session_day', hoy());
    guardarFotoPendiente({
        sessionId: SID, clientMessageId: CMID, pie: 'Mi cena',
        attachments: [{ id: 'a1', attachment_id: 'a1', url: 'https://x/a1.jpg', image_url: 'https://x/a1.jpg', description: 'Plátano con huevos. (Estimación: Calorías: 550, Proteína: 20g, Carbohidratos: 57g, Grasas Saludables: 28g)', kind: 'plato', status: 'ready' }],
        dudas: [
            { pregunta: '¿Cuántos huevos?', opciones: [{ texto: '1 huevo', ajuste: {} }, { texto: '2 huevos', supuesta: true, ajuste: {} }] },
            { pregunta: '¿Verde o maduro?', opciones: [{ texto: 'Verde', supuesta: true, ajuste: {} }, { texto: 'Maduro', ajuste: { calories: 18 } }] },
        ],
        burbuja: { role: 'user', content: 'Mi cena', isImage: true, imageUrl: 'https://x/a1.jpg', attachments: [{ id: 'a1', url: 'https://x/a1.jpg' }] },
    });
});

afterEach(() => { vi.restoreAllMocks(); });

const cambiarVisibilidad = async (ocultar) => {
    oculto = ocultar;
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
};

describe('[761] volver a la app con la conexión colgada', () => {
    it('si el servidor ya terminó, la respuesta guardada aparece sin esperar al vigilante de 5 min', async () => {
        render(<MemoryRouter initialEntries={['/dashboard/agent']}><AgentPage /></MemoryRouter>);
        await screen.findByText('Antes de anotarlo, dime:', {}, { timeout: 10000 });
        await act(async () => { screen.getByRole('button', { name: '2 huevos' }).click(); });
        await act(async () => { screen.getByRole('button', { name: 'Maduro' }).click(); });
        await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
        expect(servidor.streams).toBe(1);   // el turno está en vuelo y su conexión, colgada

        await cambiarVisibilidad(true);          // sale de la app…
        servidor.terminado = true;               // …el servidor termina y guarda (lote 760)…
        extra = 60_000;                          // …un minuto después…
        await cambiarVisibilidad(false);         // …vuelve
        expect(await screen.findByText('Anotada tu cena: 568 kcal.', {}, { timeout: 15000 })).toBeInTheDocument();
    });

    it('un vistazo corto (menos de 3 s fuera) no toca un turno vivo', async () => {
        render(<MemoryRouter initialEntries={['/dashboard/agent']}><AgentPage /></MemoryRouter>);
        await screen.findByText('Antes de anotarlo, dime:', {}, { timeout: 10000 });
        await act(async () => { screen.getByRole('button', { name: '2 huevos' }).click(); });
        await act(async () => { screen.getByRole('button', { name: 'Maduro' }).click(); });
        await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
        await cambiarVisibilidad(true);
        servidor.terminado = true;
        extra = 1000;
        await cambiarVisibilidad(false);
        await act(async () => { await new Promise((r) => setTimeout(r, 3500)); });
        expect(screen.queryByText('Anotada tu cena: 568 kcal.')).toBeNull();   // sigue esperando al stream
    });
});
