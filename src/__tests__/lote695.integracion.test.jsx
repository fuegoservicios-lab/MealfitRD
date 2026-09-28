/**
 * [P1-PLAN-LOTE-690 + 695 · 2026-09-28] De punta a punta en la página de verdad (backend simulado): la foto que espera
 * sus respuestas vuelve al abrir el chat (se fue a la Nevera, cerró la app), la tarjeta sale con su título, y dos toques
 * mandan UN turno al coach con la foto ya subida, el texto y las respuestas + su ajuste. Sin toques, nada se manda.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { guardarFotoPendiente, claveFotoPendiente } from '../utils/fotoAntesDelCoach';

const UID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SID = '33333333-4444-4555-8666-777777777777';
const CMID = '99999999-8888-4777-8666-555555555555';

const estado = {
    session: { user: { id: UID } },
    userProfile: { id: UID },
    planData: null,
    formData: { name: 'Angelo' },
    updateData: vi.fn(),
    saveGeneratedPlan: vi.fn(),
    checkPlanLimit: vi.fn(),
    restoreSessionData: vi.fn(),
};
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => estado }));

const enviados = [];
vi.mock('../config/api', async (importOriginal) => {
    const real = await importOriginal();
    const json = (body) => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });
    return {
        ...real,
        fetchWithAuth: vi.fn(async (url, opts) => {
            if (url.startsWith('/api/chat/sessions/')) {
                return json({ sessions: [{ id: SID, title: 'Cena', created_at: new Date().toISOString(), last_activity: new Date().toISOString() }], has_more: false });
            }
            if (url.startsWith(`/api/chat/history/${SID}`)) {
                return json({ messages: [{ role: 'model', content: 'Aún no veo tu cena: ¿te animas?' }], turn_active: false });
            }
            if (url === '/api/chat/stream') {
                enviados.push(JSON.parse(opts.body));
                const trozos = [
                    `data: ${JSON.stringify({ type: 'chunk', text: 'Anotada tu cena.' })}\n\n`,
                    `data: ${JSON.stringify({ type: 'done', response: 'Anotada tu cena.' })}\n\n`,
                ];
                const enc = new TextEncoder();
                let i = 0;
                return {
                    ok: true, status: 200, headers: { get: () => null },
                    body: { getReader: () => ({ read: async () => (i < trozos.length ? { done: false, value: enc.encode(trozos[i++]) } : { done: true }) }) },
                };
            }
            return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
        }),
    };
});
vi.mock('../utils/chatDraftStore', () => ({
    loadChatDraft: vi.fn(async () => null),
    saveChatDraft: vi.fn(async () => {}),
    deleteChatDraft: vi.fn(async () => {}),
    clearAllChatDrafts: vi.fn(async () => {}),
}));

import AgentPage from '../pages/AgentPage';

const hoy = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const DUDAS = [
    { sobre: 'huevo', pregunta: '¿Cuántos huevos usaste en el revuelto?', opciones: [
        { texto: '1 huevo', supuesta: false, ajuste: { calories: -72, protein: -6, carbs: 0, healthy_fats: -5 } },
        { texto: '2 huevos', supuesta: true, ajuste: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 } },
    ] },
    { sobre: 'plátano', pregunta: '¿El plátano era verde o maduro?', opciones: [
        { texto: 'Verde', supuesta: true, ajuste: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 } },
        { texto: 'Maduro', supuesta: false, ajuste: { calories: 18, protein: 0, carbs: 5, healthy_fats: 0 } },
    ] },
];
const DESC = 'Plátano verde hervido con huevos revueltos y salami. DUDAS (pregúntale solo esto): … (Estimación: Calorías: 550, Proteína: 20g, Carbohidratos: 57g, Grasas Saludables: 28g)';

vi.setConfig({ testTimeout: 25000 });

beforeAll(() => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
    if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    if (!globalThis.IntersectionObserver) {
        globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
    }
});

beforeEach(() => {
    window.localStorage.clear();
    enviados.length = 0;
    window.localStorage.setItem('mealfit_current_session', SID);
    window.localStorage.setItem('mealfit_current_session_day', hoy());
    guardarFotoPendiente({
        sessionId: SID,
        clientMessageId: CMID,
        pie: 'Mi cena',
        attachments: [{ id: 'a1', attachment_id: 'a1', url: 'https://x/a1.jpg', image_url: 'https://x/a1.jpg', description: DESC, kind: 'plato', status: 'ready' }],
        dudas: DUDAS,
        burbuja: { role: 'user', content: 'Mi cena', isImage: true, imageUrl: 'https://x/a1.jpg', attachments: [{ id: 'a1', url: 'https://x/a1.jpg' }] },
    });
});

const pintar = () => render(<MemoryRouter initialEntries={['/dashboard/agent']}><AgentPage /></MemoryRouter>);

describe('[690/695] la foto pendiente en el chat de verdad', () => {
    it('vuelve con su tarjeta y NO se manda nada al coach sin respuestas', async () => {
        pintar();
        expect(await screen.findByText('Antes de anotarlo, dime:', {}, { timeout: 10000 })).toBeInTheDocument();
        expect(await screen.findByText('Mi cena', {}, { timeout: 10000 })).toBeInTheDocument();   // la burbuja volvió
        expect(screen.getByRole('button', { name: 'Omitir preguntas' })).toBeInTheDocument();
        await act(async () => { for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0)); });
        expect(enviados).toHaveLength(0);
    });

    it('dos toques = UN turno con la foto ya subida, el texto y las respuestas con su ajuste', async () => {
        pintar();
        await screen.findByText('Antes de anotarlo, dime:', {}, { timeout: 10000 });
        await act(async () => { screen.getByRole('button', { name: '2 huevos' }).click(); });
        expect(enviados).toHaveLength(0);
        await act(async () => { screen.getByRole('button', { name: 'Maduro' }).click(); });
        await waitFor(() => expect(enviados).toHaveLength(1), { timeout: 10000 });
        const b = enviados[0];
        expect(b.session_id).toBe(SID);
        expect(b.client_message_id).toBe(CMID);
        expect(b.prompt).toBe('Mi cena\n2 huevos · Maduro');
        expect(b.attachments.map((a) => a.attachment_id)).toEqual(['a1']);
        expect(b.vision.respuestas).toBe('2 huevos · Maduro');
        expect(b.vision.ajuste).toEqual({ calories: 18, protein: 0, carbs: 5, healthy_fats: 0 });
        expect(b.vision.items[0].kind).toBe('plato');
        // contestada: deja de estar pendiente (ni tarjeta ni registro guardado)
        await waitFor(() => expect(screen.queryByText('Antes de anotarlo, dime:')).toBeNull(), { timeout: 10000 });
        expect(window.localStorage.getItem(claveFotoPendiente(SID))).toBeNull();
    });
});
