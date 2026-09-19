/**
 * [P1-PLAN-LOTE-73 · 2026-09-16] El chat del día se renueva solo, también con la pestaña abierta, y una
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
import CuentaRegresivaChat from '../components/agent/CuentaRegresivaChat';

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

const volverALaPestana = async () => {
    await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
    });
};

const listas = () => pedidos.filter((u) => u.startsWith('/api/chat/sessions/')).length;

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

const abrirElChatDeAyerALas = async (hora) => {
    vi.setSystemTime(hora);
    window.localStorage.setItem('mealfit_current_session', AYER_ID);
    window.localStorage.setItem('mealfit_current_session_day', '2026-09-16');
    pintar();
    expect(await screen.findByText(TEXTO_DE_AYER, {}, { timeout: 3000 })).toBeInTheDocument();
};

describe('[P1-PLAN-LOTE-73] con la pestaña abierta de un día para otro', () => {
    it('al volver a la pestaña pasada la medianoche, se abre el chat de hoy', async () => {
        conversacionDeAyer();
        await abrirElChatDeAyerALas(local(16, 23, 45));
        const antes = listas();
        vi.setSystemTime(local(17, 0, 30));
        await volverALaPestana();
        // [P1-PLAN-LOTE-102] 3 s como los findByText de arriba: con el 1 s por defecto este test tumbó TRES deploys
        // bajo carga (lotes 92, 99 y 102) y pasaba 10/10 aislado — era el tiempo, no el chat.
        await waitFor(() => expect(screen.queryByText(TEXTO_DE_AYER)).toBeNull(), { timeout: 3000 });
        const nueva = window.localStorage.getItem('mealfit_current_session');
        expect(nueva).not.toBe(AYER_ID);
        expect(window.localStorage.getItem('mealfit_current_session_auto')).toBe(nueva);
        expect(window.localStorage.getItem('mealfit_current_session_day')).toBe('2026-09-17');
        expect(listas()).toBeGreaterThan(antes);   // pide la lista: si otro dispositivo ya abrió el de hoy, se adopta
    });

    it('si escribiste pasada la medianoche, el chat sigue', async () => {
        conversacionDeAyer(local(17, 0, 10));
        await abrirElChatDeAyerALas(local(17, 0, 12));
        vi.setSystemTime(local(17, 0, 40));
        await volverALaPestana();
        expect(screen.getByText(TEXTO_DE_AYER)).toBeInTheDocument();
        expect(window.localStorage.getItem('mealfit_current_session')).toBe(AYER_ID);
    });

    it('con el último mensaje de hace menos de 15 minutos no se corta la conversación', async () => {
        conversacionDeAyer(local(16, 23, 58));
        await abrirElChatDeAyerALas(local(16, 23, 59));
        vi.setSystemTime(local(17, 0, 5));
        await volverALaPestana();
        expect(screen.getByText(TEXTO_DE_AYER)).toBeInTheDocument();
        expect(window.localStorage.getItem('mealfit_current_session')).toBe(AYER_ID);
    });

    it('cargar el chat de ayer no lo anota como el de hoy', async () => {
        conversacionDeAyer();
        // Con la conversación del 16 cargada, el día anotado es el de su último mensaje, no el del reloj.
        await abrirElChatDeAyerALas(local(16, 23, 45));
        expect(window.localStorage.getItem('mealfit_current_session_day')).toBe('2026-09-16');
    });
});

describe('[P1-PLAN-LOTE-73] una elección a mano se respeta', () => {
    it('abrir hoy un chat viejo desde Recientes no lo renueva al volver a la pestaña', async () => {
        conversacionDeAyer();
        vi.setSystemTime(local(17, 10, 0));
        pintar();                                                   // la regla abre el chat de hoy, en blanco
        const entrada = await screen.findByText('Cena', {}, { timeout: 3000 });
        await act(async () => { entrada.closest('button').click(); });
        expect(await screen.findByText(TEXTO_DE_AYER, {}, { timeout: 3000 })).toBeInTheDocument();
        expect(window.localStorage.getItem('mealfit_current_session_day')).toBe('2026-09-17');
        vi.setSystemTime(local(17, 10, 30));
        await volverALaPestana();
        expect(screen.getByText(TEXTO_DE_AYER)).toBeInTheDocument();
        expect(window.localStorage.getItem('mealfit_current_session')).toBe(AYER_ID);
    });
});

describe('[P1-PLAN-LOTE-73] la cuenta regresiva bajo «Nuevo chat»', () => {
    it('dice cuánto falta para la medianoche en horas y minutos', () => {
        vi.setSystemTime(new Date(2026, 8, 16, 17, 38, 30));
        render(<CuentaRegresivaChat />);
        const texto = screen.getByText('Nuevo chat automático en 6 h 21 min');
        expect(texto).toBeInTheDocument();
        expect(texto.getAttribute('title')).toBe('El chat se renueva solo cada día a medianoche, si no estás escribiendo.');
    });

    it('en la última hora, solo minutos; en el último minuto, sin cifra', () => {
        vi.setSystemTime(new Date(2026, 8, 16, 23, 10, 0));
        const { unmount } = render(<CuentaRegresivaChat />);
        expect(screen.getByText('Nuevo chat automático en 50 min')).toBeInTheDocument();
        unmount();
        vi.setSystemTime(new Date(2026, 8, 16, 23, 59, 40));
        render(<CuentaRegresivaChat />);
        expect(screen.getByText('Nuevo chat automático en menos de un minuto')).toBeInTheDocument();
    });

    it('está en la barra lateral, bajo el botón', () => {
        vi.setSystemTime(new Date(2026, 8, 16, 17, 38, 30));
        conversacionDeAyer();
        pintar();
        const boton = screen.getAllByText('Nuevo chat')[0].closest('button');
        expect(boton.nextElementSibling?.textContent).toBe('Nuevo chat automático en 6 h 21 min');
    });
});

describe('[P1-PLAN-LOTE-76] «Nuevo chat» bloqueado mientras el chat abierto es el de hoy', () => {
    it('el botón «Nuevo chat» está bloqueado mientras el chat abierto es el de hoy', async () => {
        conversacionDeAyer();
        vi.setSystemTime(local(17, 10, 0));
        pintar();                                                   // la regla abre el chat de hoy
        await screen.findByText('Cena', {}, { timeout: 3000 });
        const boton = screen.getAllByText('Nuevo chat')[0].closest('button');
        expect(boton).toBeDisabled();
        expect(boton.getAttribute('title')).toBe('El chat se renueva solo cada día a medianoche, si no estás escribiendo.');
        const antes = window.localStorage.getItem('mealfit_current_session');
        await act(async () => { boton.click(); });
        expect(window.localStorage.getItem('mealfit_current_session')).toBe(antes);
    });

    it('sigue bloqueado tras la renovación de medianoche (el chat nuevo también es el de hoy)', async () => {
        conversacionDeAyer();
        await abrirElChatDeAyerALas(local(16, 23, 45));
        vi.setSystemTime(local(17, 0, 30));
        await volverALaPestana();
        // [P1-PLAN-LOTE-102] 3 s como los findByText de arriba: con el 1 s por defecto este test tumbó TRES deploys
        // bajo carga (lotes 92, 99 y 102) y pasaba 10/10 aislado — era el tiempo, no el chat.
        // [P1-PLAN-LOTE-117] …y con 3 s tumbó tres más (105, 116 y 117), siempre dentro de la suite entera del deploy y
        // siempre 10/10 aislado. La espera es un TECHO, no una pausa: en verde vuelve en cuanto el texto desaparece. 10 s
        // de techo (y 20 s para el test) dejan de convertir la carga de la máquina en un despliegue perdido.
        await waitFor(() => expect(screen.queryByText(TEXTO_DE_AYER)).toBeNull(), { timeout: 10000 });
        expect(screen.getAllByText('Nuevo chat')[0].closest('button')).toBeDisabled();
    }, 20000);
});
