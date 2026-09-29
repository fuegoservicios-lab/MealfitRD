/**
 * [P1-PLAN-LOTE-763 · 2026-09-28] De punta a punta en la página de verdad (backend simulado), en TELÉFONO: la pregunta
 * obligatoria de la foto ocupa el sitio de la caja de escribir (oculta), el teclado se cierra al aparecer, y lo escrito
 * en «Otra…» dentro del panel viaja como respuesta de esa duda en UN turno. En el PC la tarjeta sigue encima de la caja.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { guardarFotoPendiente } from '../utils/fotoAntesDelCoach';

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

// El corte de la página (1024 px) decide si es «teléfono»; el resto de consultas responde que no.
let movil = true;
const oyentes = new Set();
const matchMediaDePrueba = (query) => ({
    get matches() { return query === '(max-width: 1024px)' ? movil : false; },
    media: query,
    onchange: null,
    addListener: (cb) => oyentes.add(cb),
    removeListener: (cb) => oyentes.delete(cb),
    addEventListener: (_e, cb) => oyentes.add(cb),
    removeEventListener: (_e, cb) => oyentes.delete(cb),
    dispatchEvent: () => true,
});
const cambiarA = (esMovil) => { movil = esMovil; oyentes.forEach((cb) => cb({ matches: esMovil })); };
let matchMediaOriginal;

beforeAll(() => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
    if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    if (!globalThis.IntersectionObserver) {
        globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
    }
});

beforeEach(() => {
    matchMediaOriginal = window.matchMedia;
    window.matchMedia = vi.fn(matchMediaDePrueba);
    movil = true;
    oyentes.clear();
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
afterEach(() => { window.matchMedia = matchMediaOriginal; });

const pintar = () => render(<MemoryRouter initialEntries={['/dashboard/agent']}><AgentPage /></MemoryRouter>);
const caja = (container) => container.querySelector('.input-wrapper textarea');
const panel = (container) => container.querySelector('.input-wrapper .chat-dudas-panel');

describe('[763] la pregunta obligatoria de la foto en el sitio de la caja (teléfono)', () => {
    it('el panel ocupa el sitio de la caja, que queda oculta', async () => {
        const { container } = pintar();
        await screen.findByText('Antes de anotarlo, dime:', {}, { timeout: 10000 });
        expect(panel(container)).not.toBeNull();
        expect(caja(container)).not.toBeNull();
        expect(caja(container).closest('[hidden]')).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Omitir preguntas' })).toBeInTheDocument();
    });

    it('si la caja tenía el foco (el teclado arriba), al aparecer la pregunta lo suelta', async () => {
        movil = false;   // en el PC la tarjeta va encima de la caja y la caja se puede enfocar
        const { container } = pintar();
        await screen.findByText('Antes de anotarlo, dime:', {}, { timeout: 10000 });
        expect(panel(container)).toBeNull();
        const campo = caja(container);
        expect(campo.closest('[hidden]')).toBeNull();
        act(() => { campo.focus(); });
        expect(document.activeElement).toBe(campo);
        act(() => { cambiarA(true); });   // el mismo chat, ahora con el corte de teléfono
        await waitFor(() => expect(panel(container)).not.toBeNull());
        expect(document.activeElement).not.toBe(campo);
        expect(campo.closest('[hidden]')).not.toBeNull();
    });

    it('«Otra…» se escribe en el panel: lo escrito + un toque = UN turno, sin ajuste; y vuelve la caja', async () => {
        const { container } = pintar();
        await screen.findByText('Antes de anotarlo, dime:', {}, { timeout: 10000 });
        act(() => { screen.getAllByRole('button', { name: 'Otra…' })[0].click(); });
        const escrito = screen.getByLabelText('Tu respuesta: ¿Cuántos huevos usaste en el revuelto?');
        expect(panel(container).contains(escrito)).toBe(true);
        fireEvent.change(escrito, { target: { value: '3 huevos con queso' } });
        fireEvent.keyDown(escrito, { key: 'Enter' });
        expect(enviados).toHaveLength(0);
        await act(async () => { screen.getByRole('button', { name: 'Maduro' }).click(); });
        await waitFor(() => expect(enviados).toHaveLength(1), { timeout: 10000 });
        const b = enviados[0];
        expect(b.client_message_id).toBe(CMID);
        expect(b.prompt).toBe('Mi cena\n3 huevos con queso · Maduro');
        expect(b.vision.respuestas).toBe('3 huevos con queso · Maduro');
        expect(b.vision.ajuste).toBeUndefined();   // lo escrito no tiene ajuste: el servidor pide recalcular
        await waitFor(() => expect(panel(container)).toBeNull(), { timeout: 10000 });
        expect(caja(container).closest('[hidden]')).toBeNull();
    });

    it('en el PC la tarjeta sigue encima de la caja, visible', async () => {
        movil = false;
        const { container } = pintar();
        await screen.findByText('Antes de anotarlo, dime:', {}, { timeout: 10000 });
        expect(panel(container)).toBeNull();
        expect(container.querySelector('.input-wrapper .chat-respuestas-foto')).not.toBeNull();
        expect(caja(container).closest('[hidden]')).toBeNull();
    });
});
