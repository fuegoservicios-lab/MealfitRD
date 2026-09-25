/**
 * [P1-PLAN-LOTE-226 · 2026-09-25] «Si entro a un historial pasado del agente, ¿cómo vuelvo al chat de mi día actual?».
 * Elegir un chat viejo en Recientes lo anotaba como el de HOY: «Nuevo chat» quedaba bloqueado hasta medianoche y no
 * había salida. Ahora conserva su día y el botón (y una píldora sobre la caja) dice «Volver al chat de hoy».
 * Mismo arnés que Agent.renovacion_diaria (P1-PLAN-LOTE-73): El chat del día se renueva solo, también con la pestaña abierta, y una
 * cuenta regresiva bajo «Nuevo chat» dice cuándo.
 *
 * El dueño: «que no se tenga que dar a nuevo chat ni siquiera, que lo haga automático diario, y que lo
 * diga una cuenta regresiva donde dice nuevo chat». Al ENTRAR ya era automático (P1-AGENT-SESSION-DAY);
 * faltaba el Agente que se queda abierto de un día para otro. Se monta la página de verdad con el backend
 * simulado y solo el reloj (`Date`) falso: lo que se mira es lo que el usuario ve.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const UID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const AYER_ID = '22222222-3333-4444-8555-666666666666';

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

const servidor = { sesiones: [], historial: {} };
const pedidos = [];
vi.mock('../config/api', async (importOriginal) => {
    const real = await importOriginal();
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    return {
        ...real,
        fetchWithAuth: vi.fn(async (url) => {
            pedidos.push(url);
            if (url.startsWith('/api/chat/sessions/')) return json({ sessions: servidor.sesiones, has_more: false });
            const m = /^\/api\/chat\/history\/([0-9a-f-]+)/.exec(url);
            if (m) return json({ messages: servidor.historial[m[1]] || [], turn_active: false });
            if (url === '/api/chat/quota') return json({ used: 2, limit: 60, remaining: 58 });
            return { ok: false, status: 404, json: async () => ({}) };
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
import { esChatDeOtroDia, diaAlElegir } from '../utils/chatSessionDay';

const local = (d, h, m) => new Date(2026, 8, d, h, m, 0);
const marcaServidor = (d) => d.toISOString().replace('T', ' ').replace('Z', '000+00');
const TEXTO_DE_AYER = 'Mi cena de anoche fue arroz con habichuelas';

const conversacionDeAyer = (ultimo = local(16, 23, 40)) => {
    servidor.historial = {
        [AYER_ID]: [
            { role: 'user', content: TEXTO_DE_AYER, created_at: marcaServidor(local(16, 23, 30)) },
            { role: 'model', content: 'Anotado, buen cierre del día.', created_at: marcaServidor(ultimo) },
        ],
    };
    servidor.sesiones = [{
        id: AYER_ID, title: 'Cena', title_key: null, is_fallback: false,
        created_at: marcaServidor(local(16, 23, 30)), last_activity: marcaServidor(ultimo),
    }];
};

const pintar = () => render(
    <MemoryRouter initialEntries={['/dashboard/agent']}>
        <AgentPage />
    </MemoryRouter>,
);

// [P1-PLAN-LOTE-117] Las esperas de este fichero son TECHOS de 10 s (en verde vuelven al instante); el test necesita
// un techo mayor que ellas. Con 3 s / 5 s este fichero tumbó siete deploys bajo carga pasando 10/10 aislado.
vi.setConfig({ testTimeout: 25000 });

beforeAll(() => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
    if (!globalThis.ResizeObserver) {
        globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    }
    if (!globalThis.IntersectionObserver) {
        globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
    }
});

beforeEach(() => {
    window.localStorage.clear();
    pedidos.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
    vi.useRealTimers();
});


const HOY_ID = '33333333-4444-4555-8666-777777777777';
const TEXTO_DE_HOY = 'Desayuné avena con guineo';

const abrirElChatViejoDesdeRecientes = async () => {
    vi.setSystemTime(local(17, 10, 0));
    pintar();
    const entrada = await screen.findByText('Cena', {}, { timeout: 10000 });
    await act(async () => { entrada.closest('button').click(); });
    expect(await screen.findByText(TEXTO_DE_AYER, {}, { timeout: 10000 })).toBeInTheDocument();
};

describe('[P1-PLAN-LOTE-226] las reglas', () => {
    it('un chat es «de otro día» por su último mensaje real', () => {
        const m = (d) => ({ role: 'user', content: 'x', created_at: d.toISOString() });
        expect(esChatDeOtroDia([m(local(16, 22, 0))], '2026-09-17')).toBe(true);
        expect(esChatDeOtroDia([m(local(16, 22, 0)), m(local(17, 0, 5))], '2026-09-17')).toBe(false);
        expect(esChatDeOtroDia([{ role: 'model', isWelcome: true, content: 'Hola' }], '2026-09-17')).toBe(false);
    });

    it('elegir en Recientes anota el día del chat, nunca uno futuro', () => {
        expect(diaAlElegir({ last_activity: local(16, 22, 0).toISOString() }, '2026-09-17')).toBe('2026-09-16');
        expect(diaAlElegir({ last_activity: local(17, 9, 0).toISOString() }, '2026-09-17')).toBe('2026-09-17');
        expect(diaAlElegir({}, '2026-09-17')).toBe('2026-09-17');
    });
});

describe('[P1-PLAN-LOTE-226] desde un chat de otro día se vuelve al de hoy', () => {
    it('sin chat de hoy en el servidor: abre uno en blanco, a nombre de la regla del día', async () => {
        conversacionDeAyer();
        await abrirElChatViejoDesdeRecientes();
        expect(window.localStorage.getItem('mealfit_current_session_day')).toBe('2026-09-16');
        const botones = await screen.findAllByRole('button', { name: /Volver al chat de hoy/ }, { timeout: 10000 });
        expect(botones.length).toBe(2);                    // el de la barra lateral y la píldora sobre la caja
        botones.forEach((b) => expect(b).not.toBeDisabled());
        await act(async () => { botones[0].click(); });
        await waitFor(() => expect(screen.queryByText(TEXTO_DE_AYER)).toBeNull(), { timeout: 10000 });
        const nueva = window.localStorage.getItem('mealfit_current_session');
        expect(nueva).not.toBe(AYER_ID);
        expect(window.localStorage.getItem('mealfit_current_session_auto')).toBe(nueva);
        expect(window.localStorage.getItem('mealfit_current_session_day')).toBe('2026-09-17');
        expect(screen.queryAllByRole('button', { name: /Volver al chat de hoy/ })).toHaveLength(0);
        expect(screen.getByRole('button', { name: /Nuevo chat/ })).toBeDisabled();   // ya estás en el de hoy
    });

    it('con chat de hoy en el servidor: vuelve a ESE, con su conversación', async () => {
        conversacionDeAyer();
        servidor.historial[HOY_ID] = [
            { role: 'user', content: TEXTO_DE_HOY, created_at: marcaServidor(local(17, 8, 0)) },
            { role: 'model', content: 'Anotado.', created_at: marcaServidor(local(17, 8, 1)) },
        ];
        servidor.sesiones = [{
            id: HOY_ID, title: 'Desayuno', title_key: null, is_fallback: false,
            created_at: marcaServidor(local(17, 8, 0)), last_activity: marcaServidor(local(17, 8, 1)),
        }, ...servidor.sesiones];
        await abrirElChatViejoDesdeRecientes();
        const [boton] = await screen.findAllByRole('button', { name: /Volver al chat de hoy/ }, { timeout: 10000 });
        await act(async () => { boton.click(); });
        expect(await screen.findByText(TEXTO_DE_HOY, {}, { timeout: 10000 })).toBeInTheDocument();
        expect(window.localStorage.getItem('mealfit_current_session')).toBe(HOY_ID);
    });
});
