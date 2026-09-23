// [P1-PLAN-LOTE-169 · 2026-09-23] Dos capturas del dueño.
//
// 1. iPhone: «le di a activar generación del plan y no hace nada, solo me redirige al inicio del dashboard». El registro
//    de nginx lo fecha: Configuración a las 03:26:40 UTC, el panel recargando sus datos a las 03:26:44 — ni un paso del
//    formulario. La causa es de React Router 7: todo lo que cuelga de un `<Routes location={…}>` ve
//    `navigationType === "POP"` FIJO, y `ModalAwareRoutes` (la ventana de Configuración, 10-ago) le pasaba la ubicación
//    SIEMPRE. Así, cada `navigate()` parecía un arranque en frío para las guardas POP de `ProtectedRoute`, que devuelven
//    al contador fuera de /assessment y de /plan. Estos tests montan el `ModalAwareRoutes` REAL: la receta de rutas
//    modales se probaba siempre con un `<Routes>` pelado y por eso nadie lo vio.
// 2. Chat del coach: con foto + texto la burbuja gris tomaba el ancho del texto y la foto dejaba un hueco gris al lado.
//    La foto va FUERA de la burbuja; el texto conserva la suya, del ancho del texto.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from './utils/test-utils';
import { render as renderSinContexto } from '@testing-library/react';
import { MemoryRouter, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import { ModalAwareRoutes } from '../App';

const _api = vi.hoisted(() => ({
    fetchWithAuth: vi.fn((url) => Promise.resolve({
        ok: true,
        json: async () => (String(url).includes('/api/profile/plan-mode') ? { plan_mode: 'tracking' } : {}),
    })),
}));
vi.mock('../config/api', async (importOriginal) => ({ ...(await importOriginal()), fetchWithAuth: _api.fetchWithAuth }));
vi.mock('../i18n/useT', () => ({ useT: () => (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '') : s), default: () => (s) => s }));

// El contador del dueño: formulario corto contestado, sin plan, generador apagado.
const HP = { gender: 'male', age: '34', height: '172', weight: '180', activityLevel: 'moderate', mainGoal: 'lose_fat' };
const CONTADOR = {
    session: { user: { id: 'u1' } }, loadingAuth: false, loadingData: false, loadingProfile: false, isGuest: false,
    planData: null, userProfile: { plan_mode: 'tracking', health_profile: HP }, formData: { appMode: 'tracking', ...HP },
    updateData: vi.fn(), resetApp: vi.fn(), refreshProfileAndPlan: vi.fn(),
};

const Donde = () => <div data-testid="donde">{useLocation().pathname}</div>;

const Empujar = ({ a, texto }) => {
    const navigate = useNavigate();
    return <button type="button" onClick={() => navigate(a)}>{texto}</button>;
};

const montar = (entradas, indice, ctx = CONTADOR) => render(
    <>
        <ModalAwareRoutes>
            <Route path="/dashboard" element={<ProtectedRoute><div>PANEL<Empujar a="/assessment" texto="ENCENDER" /></div></ProtectedRoute>} />
            <Route path="/assessment" element={<ProtectedRoute><div>FORMULARIO<Link to="/plan">FINALIZAR</Link></div></ProtectedRoute>} />
            <Route path="/plan" element={<ProtectedRoute><div>GENERANDO</div></ProtectedRoute>} />
            <Route path="/dashboard/settings" element={<ProtectedRoute><div>CONFIG PÁGINA</div></ProtectedRoute>} />
        </ModalAwareRoutes>
        <Donde />
    </>,
    {
        customContext: ctx,
        wrapper: ({ children }) => <MemoryRouter initialEntries={entradas} initialIndex={indice}>{children}</MemoryRouter>,
    },
);

const matchMedia = (movil) => vi.fn().mockImplementation((q) => ({
    matches: movil && /max-width:\s*768px/.test(q), media: q, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
}));

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

describe('lote 169 · las guardas POP ya no ven POP en cada navegación', () => {
    it.each([['escritorio', false], ['teléfono', true]])(
        '%s: «Generación de planes» desde la ventana de Configuración ABRE el formulario',
        async (_n, movil) => {
            window.matchMedia = matchMedia(movil);
            window.scrollTo = vi.fn();
            window.localStorage.setItem('mealfit_plan_mode', 'tracking');
            montar(['/dashboard', { pathname: '/dashboard/settings', state: { backgroundLocation: { pathname: '/dashboard' } } }], 1);
            const seccion = (await screen.findAllByText('Capacidades', {}, { timeout: 8000 }))[0];   // la ventana es un lazy
            await act(async () => { fireEvent.click(seccion.closest('button') || seccion); });
            const interruptor = await screen.findByRole('checkbox', { name: /generación de planes/i }, { timeout: 8000 });
            await act(async () => { fireEvent.click(interruptor); });
            expect(screen.getByTestId('donde').textContent).toBe('/assessment');
            expect(screen.getByText('FORMULARIO')).toBeInTheDocument();
        },
    );

    it('la tarjeta del contador (PUSH desde el panel) también llega al formulario', () => {
        window.localStorage.setItem('mealfit_plan_mode', 'tracking');
        montar(['/dashboard'], 0);
        fireEvent.click(screen.getByText('ENCENDER'));
        expect(screen.getByTestId('donde').textContent).toBe('/assessment');
    });

    it('y «Finalizar y Generar» (PUSH a /plan) genera en vez de rebotar al contador', () => {
        window.localStorage.setItem('mealfit_plan_mode', 'tracking');
        montar(['/dashboard'], 0);
        fireEvent.click(screen.getByText('ENCENDER'));
        fireEvent.click(screen.getByText('FINALIZAR'));
        expect(screen.getByTestId('donde').textContent).toBe('/plan');
        expect(screen.getByText('GENERANDO')).toBeInTheDocument();
    });

    it('las guardas siguen haciendo su trabajo en una llegada FRÍA (POP): /assessment y /plan devuelven al contador', () => {
        window.localStorage.setItem('mealfit_plan_mode', 'tracking');
        montar(['/assessment'], 0);
        expect(screen.getByTestId('donde').textContent).toBe('/dashboard');
        window.localStorage.setItem('mealfit_plan_mode', 'tracking');
        montar(['/plan'], 0);
        expect(screen.getAllByTestId('donde').at(-1).textContent).toBe('/dashboard');
    });

    it('con la ventana abierta, el fondo se sigue pintando detrás (la receta de rutas modales intacta)', () => {
        montar(['/dashboard', { pathname: '/dashboard/settings', state: { backgroundLocation: { pathname: '/dashboard' } } }], 1,
            { ...CONTADOR, planData: { id: 'p1', days: [{}] }, userProfile: { plan_mode: 'plan', health_profile: HP } });
        expect(screen.getByText('PANEL')).toBeInTheDocument();
        expect(screen.queryByText('CONFIG PÁGINA')).not.toBeInTheDocument();
    });
});

// ── 2. La foto del chat fuera de la burbuja ─────────────────────────────────────────────────────────

describe('lote 169 · foto + texto en el chat: la foto va aparte y la burbuja es del ancho del texto', () => {
    const foto = { id: 'a1', url: 'blob:http://localhost/foto' };
    const pintar = async (msg) => {
        const { MemoizedMessageBubble } = await import('../components/agent/MessageBubble');
        return renderSinContexto(<MemoizedMessageBubble msg={msg} index={0} currentSessionId="s1" />).container;
    };

    it('el texto conserva su burbuja, y la foto NO está dentro de ella', async () => {
        const c = await pintar({ role: 'user', content: 'Este fue el desayuno y me comí 3 tacos', attachments: [foto] });
        const burbuja = c.querySelector('.msg-bubble-user');
        expect(burbuja).toBeTruthy();
        expect(burbuja.textContent).toContain('Este fue el desayuno');
        expect(burbuja.querySelector('img')).toBeNull();
        expect(burbuja.style.border).toContain('1px');
        const grupo = c.querySelector('.msg-user-grupo');
        expect(grupo).toBeTruthy();
        expect(grupo.querySelector('.message-media-grid img')).toBeTruthy();
        expect(grupo.style.background === '' || grupo.style.background === 'transparent').toBe(true);
    });

    it('foto sola: ningún marco (tampoco el del teléfono, que va por la clase de la burbuja)', async () => {
        const c = await pintar({ role: 'user', content: '', attachments: [foto] });
        expect(c.querySelector('.msg-bubble-user')).toBeNull();
        expect(c.querySelector('.msg-user-grupo .message-media-grid img')).toBeTruthy();
    });

    it('texto sin foto y la respuesta del coach: como siempre', async () => {
        const u = await pintar({ role: 'user', content: 'hola' });
        expect(u.querySelector('.msg-bubble-user').style.border).toContain('1px');
        expect(u.querySelector('.msg-user-grupo')).toBeNull();
        const b = await pintar({ role: 'model', content: 'respuesta' });
        expect(b.querySelector('.msg-bubble-bot')).toBeTruthy();
    });
});
