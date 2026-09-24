// [P1-NEVERA-OPCIONAL · 2026-09-23] La Nevera apagada desaparece de la nav y su ruta lleva al panel. La regla vive
// en el servidor (nevera_opcional.nevera_activa_de) y llega calculada en el perfil: aquí solo se LEE.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// `test-utils` PRIMERO: su `vi.mock` del authClient tiene que estar registrado antes de que Configuración y el panel
// arrastren el contexto (mismo orden que lote169 y Settings.test).
import { render, screen, fireEvent, act, waitFor, cleanup } from './utils/test-utils';
import { navItemsFor, neveraActiva } from '../config/dashboardNav';
import Settings from '../pages/Settings';
import DashboardTracking from '../components/dashboard/DashboardTracking';

const leer = (...p) => fs.readFileSync(path.resolve(__dirname, '..', ...p), 'utf8');

// [P1-NEVERA-OPCIONAL · 2026-09-23 · F5] Configuración y el panel del contador se MONTAN, no se leen como texto: un
// servidor falso contesta por ruta (como lote169) y `toast` se cuenta. Todo lo demás del servidor responde `{}`.
const _srv = vi.hoisted(() => ({ planMode: 'tracking', nevera: null, fetchWithAuth: vi.fn() }));
vi.mock('../config/api', async (importOriginal) => ({ ...(await importOriginal()), fetchWithAuth: _srv.fetchWithAuth }));
const _toast = vi.hoisted(() => Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn(),
}));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal()), toast: _toast, Toaster: () => null }));
// El panel del contador sin sus dos tarjetas grandes (como lote112): aquí solo importa la nota, y el agua tiene SU
// propio aviso de apagado automático, que ensuciaría la cuenta de `toast`.
vi.mock('../components/dashboard/TrackingProgress', () => ({ default: () => null }));
vi.mock('../components/dashboard/WaterTracker', () => ({ default: () => null }));

const _json = (cuerpo, ok = true, status = 200) => ({ ok, status, json: async () => cuerpo });
const _servidor = (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/api/profile/plan-mode')) return Promise.resolve(_json({ plan_mode: _srv.planMode }));
    if (u.includes('/api/user/preferences/nevera')) {
        if (opts.method === 'PATCH') {
            // lo que hace el servidor real (nevera_opcional.fijar_nevera): la elección explícita borra la marca
            const { enabled } = JSON.parse(opts.body);
            _srv.nevera = { enabled, activa: enabled, auto_off_at: null, disponible: true };
        }
        return Promise.resolve(_json(_srv.nevera));
    }
    return Promise.resolve(_json({}));
};

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    _srv.fetchWithAuth.mockImplementation(_servidor);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();   // el espía de `useAssessment` que pone test-utils
    window.history.replaceState(null, '', '/');   // «Capacidades» deja `#preferences` en la URL
});

describe('neveraActiva', () => {
    it('en modo contador manda el perfil', () => {
        expect(neveraActiva({ plan_mode: 'tracking', nevera_activa: false })).toBe(false);
        expect(neveraActiva({ plan_mode: 'tracking', nevera_activa: true })).toBe(true);
    });
    // [Final fix wave] `saveGeneratedPlan` pasa `plan_mode` a 'plan' EN MEMORIA sin volver a pedir el perfil: el
    // `nevera_activa: false` del contador seguiría ahí. La regla del servidor ya dice que en modo plan está activa.
    it('en modo plan siempre activa, aunque el perfil en memoria traiga el false del contador', () => {
        expect(neveraActiva({ plan_mode: 'plan', nevera_activa: false })).toBe(true);
        localStorage.setItem('mealfit_plan_mode', 'plan');
        localStorage.setItem('mealfit_nevera_activa', 'false');
        expect(neveraActiva(null)).toBe(true);   // tampoco el espejo: el modo manda
    });
    it('sin perfil, el espejo (solo en modo contador); sin nada, activa', () => {
        expect(neveraActiva(null)).toBe(true);
        localStorage.setItem('mealfit_nevera_activa', 'false');
        expect(neveraActiva(null)).toBe(true);   // modo desconocido: jamás ocultar por ignorancia
        localStorage.setItem('mealfit_plan_mode', 'tracking');
        expect(neveraActiva(null)).toBe(false);
    });
    // [Final fix wave] El espejo es SOLO para el primer pintado. Un perfil cargado sin el campo es un backend viejo (o
    // un rollback): caer al espejo aplicaría una decisión que ese backend ya no sostiene.
    it('un perfil cargado sin el campo cuenta como activa, sin mirar el espejo', () => {
        localStorage.setItem('mealfit_plan_mode', 'tracking');
        localStorage.setItem('mealfit_nevera_activa', 'false');
        expect(neveraActiva({ plan_mode: 'tracking' })).toBe(true);
        expect(neveraActiva({})).toBe(true);
        expect(neveraActiva({ plan_mode: 'tracking', nevera_activa: false })).toBe(false);
    });
});

describe('navItemsFor', () => {
    it('sin Nevera no hay entrada pantry', () => {
        expect(navItemsFor({ trackingMode: true, nevera: false }).map((i) => i.key)).toEqual(['plan', 'agent', 'history']);
        expect(navItemsFor({ trackingMode: true }).map((i) => i.key)).toEqual(['plan', 'agent', 'pantry', 'history']);
    });
    it('los tres consumidores pasan la regla', () => {
        expect(leer('components', 'dashboard', 'DashboardLayout.jsx'))
            .toContain('navItemsFor({ trackingMode: isTrackingMode(userProfile, planData), nevera: neveraActiva(userProfile) })');
        expect(leer('components', 'dashboard', 'BottomTabBar.jsx'))
            .toContain('repartoTelefono(navItemsFor({ trackingMode: isTrackingMode(userProfile, planData), nevera: neveraActiva(userProfile) })).barra');
        expect(leer('pages', 'AgentPage.jsx')).toContain('nevera: neveraActiva(userProfile)');
    });
});

describe('la ruta y el espejo', () => {
    it('la Nevera apagada redirige al panel', () => {
        expect(leer('pages', 'Pantry.jsx')).toContain('if (!neveraActiva(userProfile)) return <Navigate to="/dashboard" replace />;');
    });
    it('el perfil siembra el espejo y cerrar sesión lo borra', () => {
        const ctx = leer('context', 'AssessmentContext.jsx');
        expect(ctx).toContain("safeLocalStorageSet('mealfit_nevera_activa', String(data.nevera_activa))");
        expect(ctx).toContain("safeLocalStorageRemove('mealfit_nevera_activa')");
        expect(ctx).toContain("safeLocalStorageRemove('mealfit_nevera_auto_off_visto')");
    });
});

// ── F5 · Configuración → Capacidades: la tarjeta «Nevera» ────────────────────────────────────────────────────────
const HP = { gender: 'male', age: '34', height: '172', weight: '80', activityLevel: 'moderate', mainGoal: 'lose_fat' };
const contextoDe = (planMode) => ({
    session: { user: { id: 'u1' } }, isGuest: false,
    planData: planMode === 'plan' ? { created_at: new Date().toISOString(), duration: 'weekly', days: [{ meals: [] }] } : null,
    userProfile: { id: 'u1', plan_mode: planMode, health_profile: HP },
    formData: { appMode: planMode, ...HP },
    updateData: vi.fn(), updateUserProfile: vi.fn(), resetForNewAssessment: vi.fn(),
    refreshProfileAndPlan: vi.fn(async () => {}),
});

/** Monta Configuración y pulsa «Capacidades» (como lote169). Espera a la tarjeta vecina, Hidratación: con ella
 *  pintada, las lecturas de la sección ya contestaron. Configuración es pesada: cada caso lleva su propio tope
 *  (`_TOPE_MS`), por encima de las esperas de 8 s, para que una máquina cargada dé un fallo que se lee y no un
 *  «timed out». */
const _TOPE_MS = 30000;
const abrirCapacidades = async (ctx) => {
    render(<Settings />, { customContext: ctx });
    const seccion = (await screen.findAllByText('Capacidades', {}, { timeout: 8000 }))[0];
    await act(async () => { fireEvent.click(seccion.closest('button') || seccion); });
    await screen.findByRole('switch', { name: /hidrataci/i }, { timeout: 8000 });
};

describe('Configuración → Capacidades: la tarjeta «Nevera»', () => {
    it('en modo contador aparece y al pulsarla manda {"enabled":false}; la nav se entera sin recargar', async () => {
        _srv.planMode = 'tracking';
        _srv.nevera = { enabled: null, activa: true, auto_off_at: null, disponible: true };
        const ctx = contextoDe('tracking');
        await abrirCapacidades(ctx);

        const interruptor = await screen.findByRole('switch', { name: /nevera/i }, { timeout: 8000 });
        expect(interruptor).toHaveAttribute('aria-checked', 'true');
        // automática (nunca elegida): se avisa de que se apaga sola
        expect(screen.getByText(/si pasa 2 días vacía, la apagamos por ti/i)).toBeInTheDocument();

        await act(async () => { fireEvent.click(interruptor); });
        await waitFor(() => expect(_srv.fetchWithAuth).toHaveBeenCalledWith('/api/user/preferences/nevera', expect.objectContaining({
            method: 'PATCH', body: '{"enabled":false}',
        })));
        await waitFor(() => expect(screen.getByRole('switch', { name: /nevera/i })).toHaveAttribute('aria-checked', 'false'));
        // el espejo del primer pintado y el perfil del contexto (lo que lee la nav) se actualizan en el acto
        expect(localStorage.getItem('mealfit_nevera_activa')).toBe('false');
        expect(ctx.refreshProfileAndPlan).toHaveBeenCalled();
        expect(_toast.success).toHaveBeenCalledWith('Nevera oculta. Tu inventario se conserva.', expect.anything());
    }, _TOPE_MS);

    it('en modo plan la tarjeta NO existe (ni se pregunta al servidor)', async () => {
        _srv.planMode = 'plan';
        _srv.nevera = { enabled: null, activa: true, auto_off_at: null, disponible: true };
        await abrirCapacidades(contextoDe('plan'));
        expect(screen.queryByRole('switch', { name: /nevera/i })).not.toBeInTheDocument();
        expect(_srv.fetchWithAuth.mock.calls.some(([url]) => String(url).includes('/preferences/nevera'))).toBe(false);
    }, _TOPE_MS);

    it('si la apagó el sistema, lo dice con la fecha', async () => {
        _srv.planMode = 'tracking';
        _srv.nevera = { enabled: false, activa: false, auto_off_at: '2026-09-25T12:00:00+00:00', disponible: true };
        await abrirCapacidades(contextoDe('tracking'));
        expect(await screen.findByText(/la apagamos .* porque seguía vacía/i, {}, { timeout: 8000 })).toBeInTheDocument();
        expect(screen.getByRole('switch', { name: /nevera/i })).toHaveAttribute('aria-checked', 'false');
    }, _TOPE_MS);
});

// ── F5 · la nota ÚNICA del apagado automático en el panel del contador (montaje de lote112) ───────────────────────
describe('el panel del contador avisa UNA vez del apagado automático', () => {
    const AT = '2026-09-25T12:00:00+00:00';
    const pintar = (perfil, props = {}) => render(<DashboardTracking {...props} />, {
        customContext: {
            userProfile: { id: 'u1', plan_mode: 'tracking', ...perfil },
            planData: null, formData: {}, session: { user: { id: 'u1' } }, updateData: vi.fn(),
        },
    });

    it('una vez por apagado y por dispositivo', () => {
        pintar({ nevera_activa: false, nevera_auto_off_at: AT });
        expect(_toast).toHaveBeenCalledTimes(1);
        expect(_toast).toHaveBeenCalledWith('Ocultamos tu Nevera', expect.objectContaining({
            description: expect.stringContaining('Configuración → Capacidades'),
        }));
        cleanup();
        pintar({ nevera_activa: false, nevera_auto_off_at: AT });   // volver a montar: nada más
        expect(_toast).toHaveBeenCalledTimes(1);
        cleanup();
        pintar({ nevera_activa: false, nevera_auto_off_at: '2026-10-02T12:00:00+00:00' });   // OTRO apagado: sí
        expect(_toast).toHaveBeenCalledTimes(2);
    });

    it('encendida, o apagada a mano (sin marca del sistema), no dice nada', () => {
        pintar({ nevera_activa: true, nevera_auto_off_at: AT });   // p. ej. de vuelta al modo plan
        cleanup();
        pintar({ nevera_activa: false, nevera_auto_off_at: null });
        expect(_toast).not.toHaveBeenCalled();
    });

    // [Fix round 1] Este componente es TAMBIÉN la pestaña «Progreso» del modo plan (ProgressPage monta
    // `<DashboardTracking modo="plan" />`). La nota es del panel del contador: la guarda vive en el cliente, no solo en
    // que el servidor nunca mande `nevera_activa: false` en modo plan.
    it('en la pestaña «Progreso» del modo plan no avisa, ni da la nota por vista', () => {
        pintar({ plan_mode: 'plan', nevera_activa: false, nevera_auto_off_at: AT }, { modo: 'plan' });
        expect(_toast).not.toHaveBeenCalled();
        cleanup();
        pintar({ nevera_activa: false, nevera_auto_off_at: AT });   // el contador la sigue diciendo cuando toque
        expect(_toast).toHaveBeenCalledTimes(1);
    });
});
