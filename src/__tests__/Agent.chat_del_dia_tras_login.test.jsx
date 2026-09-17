/**
 * [P1-PLAN-LOTE-71 · 2026-09-16] Al volver a iniciar sesión, el Agente abre TU chat de hoy.
 *
 * El dueño cerró sesión, volvió a entrar y el Agente le abrió un chat en blanco
 * («¡Buenas tardes! ¡Hora de una merienda rápida!») mientras «Recientes · Hoy»
 * listaba su conversación de esa mañana. En producción: una sola sesión, creada
 * a las 08:26, con 6 mensajes y el último a las 12:58.
 *
 * La regla del día (P1-AGENT-SESSION-DAY) solo leía `mealfit_current_session`, y el
 * logout la borra a propósito (P2-CHAT-CACHE-XUSER). Aquí se monta la página de
 * verdad —con el backend simulado— y se mira lo que el usuario ve: los mensajes
 * de su chat de hoy, no el saludo de uno nuevo. Y las dos cosas que NO pueden
 * cambiar: un «Nuevo chat» elegido a mano se respeta, y sin chat de hoy en el
 * servidor se empieza fresco.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const UID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const HOY_ID = '11111111-2222-4333-8444-555555555555';
const AYER_ID = '22222222-3333-4444-8555-666666666666';
const EN_BLANCO_ID = '33333333-4444-4555-8666-777777777777';

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

const servidor = { sesiones: [], historial: {}, listaFalla: false };
const pedidos = [];
vi.mock('../config/api', async (importOriginal) => {
    const real = await importOriginal();
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    return {
        ...real,
        fetchWithAuth: vi.fn(async (url) => {
            pedidos.push(url);
            if (url.startsWith('/api/chat/sessions/')) {
                if (servidor.listaFalla) return { ok: false, status: 500, json: async () => ({}) };
                return json({ sessions: servidor.sesiones, has_more: false });
            }
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

// Marca con el formato real del backend (`created_at::text` en una base en GMT).
const marcaServidor = (d) => d.toISOString().replace('T', ' ').replace('Z', '000+00');
const mediodiaDeHoy = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const mediodiaDeAyer = () => new Date(mediodiaDeHoy().getTime() - 24 * 3600 * 1000);
const hoyLocal = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const CHAT_DE_HOY = {
    id: HOY_ID, user_id: UID, title: 'Primer saludo', title_key: null, is_fallback: false,
    created_at: marcaServidor(mediodiaDeHoy()), last_activity: marcaServidor(mediodiaDeHoy()),
};
const CHAT_DE_AYER = {
    id: AYER_ID, user_id: UID, title: 'Cena de ayer', title_key: null, is_fallback: false,
    created_at: marcaServidor(mediodiaDeAyer()), last_activity: marcaServidor(mediodiaDeAyer()),
};
const MENSAJES_DE_HOY = [
    { role: 'user', content: 'hola, esto lo escribí esta mañana', created_at: marcaServidor(mediodiaDeHoy()) },
    { role: 'model', content: 'Respuesta de la mañana del coach', created_at: marcaServidor(mediodiaDeHoy()) },
];

const pintar = () => render(
    <MemoryRouter initialEntries={['/dashboard/agent']}>
        <AgentPage />
    </MemoryRouter>,
);

// Deja correr los fetch simulados y los efectos que disparan.
const asentar = async () => {
    await act(async () => {
        for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
    });
};

const pidioLaLista = () => pedidos.some((u) => u.startsWith('/api/chat/sessions/'));
const historiales = () => pedidos.filter((u) => u.startsWith('/api/chat/history/'));
const cargando = () => screen.queryByText('Cargando mensajes...');

beforeAll(() => {
    // jsdom no trae estas APIs de layout; la página solo las usa para el scroll.
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
    servidor.sesiones = [CHAT_DE_HOY, CHAT_DE_AYER];
    servidor.historial = { [HOY_ID]: MENSAJES_DE_HOY };
    servidor.listaFalla = false;
});

describe('[P1-PLAN-LOTE-71] tras volver a iniciar sesión, el Agente abre tu chat de hoy', () => {
    it('sin la clave local (el logout la borra), recupera del servidor el chat de hoy', async () => {
        // Estado exacto tras `_clearUserScopedCaches`: sin `mealfit_current_session` ni lista en caché.
        pintar();
        // Un solo cambio en pantalla: «Cargando mensajes…» y luego la conversación, sin un saludo en medio.
        expect(cargando()).toBeInTheDocument();
        expect(await screen.findByText('Respuesta de la mañana del coach', {}, { timeout: 3000 })).toBeInTheDocument();
        // La sesión en blanco que abrió la regla no tiene historial: ni se pidió.
        expect(historiales()).toEqual([`/api/chat/history/${HOY_ID}`]);
        expect(cargando()).toBeNull();
        expect(screen.getByText('hola, esto lo escribí esta mañana')).toBeInTheDocument();
        expect(window.localStorage.getItem('mealfit_current_session')).toBe(HOY_ID);
        expect(window.localStorage.getItem('mealfit_current_session_day')).toBe(hoyLocal());
        expect(window.localStorage.getItem('mealfit_current_session_auto')).toBeNull();
    });

    it('un «Nuevo chat» elegido a mano hoy se respeta al volver al Agente', async () => {
        // «Nuevo chat» → `setCurrentSessionId` → `marcarActividad`: sesión y día, sin marca automática.
        window.localStorage.setItem('mealfit_current_session', EN_BLANCO_ID);
        window.localStorage.setItem('mealfit_current_session_day', hoyLocal());
        pintar();
        await waitFor(() => expect(pidioLaLista()).toBe(true));
        await asentar();
        expect(window.localStorage.getItem('mealfit_current_session')).toBe(EN_BLANCO_ID);
        expect(pedidos).not.toContain(`/api/chat/history/${HOY_ID}`);
        expect(screen.queryByText('Respuesta de la mañana del coach')).toBeNull();
    });

    it('sin chat de hoy en el servidor, empieza fresco (el de ayer no resucita)', async () => {
        servidor.sesiones = [CHAT_DE_AYER];
        servidor.historial = { [AYER_ID]: [{ role: 'user', content: 'lo de ayer', created_at: marcaServidor(mediodiaDeAyer()) }] };
        pintar();
        await waitFor(() => expect(pidioLaLista()).toBe(true));
        await asentar();
        const actual = window.localStorage.getItem('mealfit_current_session');
        expect([HOY_ID, AYER_ID]).not.toContain(actual);
        expect(pedidos).not.toContain(`/api/chat/history/${AYER_ID}`);
        expect(screen.queryByText('lo de ayer')).toBeNull();
    });

    it('un chat de hoy sin mensajes no cuenta como «tu chat de hoy»', async () => {
        servidor.sesiones = [{ ...CHAT_DE_HOY, title: null, title_key: 'empty' }];
        pintar();
        await waitFor(() => expect(pidioLaLista()).toBe(true));
        await asentar();
        expect(window.localStorage.getItem('mealfit_current_session')).not.toBe(HOY_ID);
        expect(pedidos).not.toContain(`/api/chat/history/${HOY_ID}`);
    });
});

describe('[P1-PLAN-LOTE-71] la espera del chat de hoy nunca se queda colgada', () => {
    it('sin chat de hoy, «Cargando mensajes…» da paso al saludo', async () => {
        servidor.sesiones = [CHAT_DE_AYER];
        pintar();
        expect(cargando()).toBeInTheDocument();
        await waitFor(() => expect(pidioLaLista()).toBe(true));
        await asentar();
        expect(cargando()).toBeNull();
        expect(screen.queryByText('lo de ayer')).toBeNull();
    });

    it('si la lista falla, también', async () => {
        servidor.listaFalla = true;
        pintar();
        await waitFor(() => expect(pidioLaLista()).toBe(true));
        await asentar();
        expect(cargando()).toBeNull();
        expect(historiales()).toEqual([]);
    });

    it('en la visita normal del día (con la lista en caché) el saludo sale al instante', async () => {
        // Primera visita de un día nuevo: hay caché de la barra lateral y la regla abre sesión nueva.
        window.localStorage.setItem('mealfit_chat_sessions_cache_v2', JSON.stringify({
            sessions: [CHAT_DE_AYER], cachedAt: Date.now(),
        }));
        servidor.sesiones = [CHAT_DE_AYER];
        pintar();
        expect(cargando()).toBeNull();
        await waitFor(() => expect(pidioLaLista()).toBe(true));
        await asentar();
        expect(cargando()).toBeNull();
    });

    it('durante la espera el botón «Nuevo chat» está bloqueado (P1-PLAN-LOTE-76) y la espera termina sola', async () => {
        servidor.listaFalla = true;
        pintar();
        expect(cargando()).toBeInTheDocument();
        const boton = screen.getAllByText('Nuevo chat')[0].closest('button');
        expect(boton).toBeDisabled();
        const antes = window.localStorage.getItem('mealfit_current_session');
        await act(async () => { boton.click(); });
        await waitFor(() => expect(cargando()).toBeNull());   // la lista fallida termina la espera
        expect(window.localStorage.getItem('mealfit_current_session')).toBe(antes);   // el clic no abrió nada
    });
});
