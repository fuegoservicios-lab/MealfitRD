/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] Eliminar la cuenta.
 *
 *   (a) Tras borrar, `resetApp` → `apagarAvisosAlCerrarSesion` hacía DELETE autenticados con la cuenta ya borrada:
 *       401 → `mealfit:session-expired` → «Tu sesión expiró» encima de «Tu cuenta fue eliminada». Ahora los avisos se
 *       apagan ANTES de llamar al borrado, con la sesión viva.
 *   (b) La política de privacidad promete que lo local no sobrevive a la sesión: `resetApp` conserva a propósito
 *       `mealfit_form` y las cachés con prefijo. Al borrar la cuenta ahora se barren.
 *   (c) 502/503 (PayPal no canceló, el backend abortó el borrado) tiene su propio mensaje.
 *   (d) El campo de la palabra: sin autocorrección ni corrector, y con el foco al abrir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { shouldSignalSessionExpiry, sessionRequestGeneration } from '../utils/accountDeletionSession';

const orden = [];
const navigate = vi.fn();
let respuestaDelBorrado = { ok: true, status: 200, json: async () => ({ success: true }) };

vi.mock('react-router-dom', async (original) => ({ ...(await original()), useNavigate: () => navigate }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('../config/api', () => ({
    api: (p) => p,
    fetchWithAuth: vi.fn(async (url) => {
        expect(shouldSignalSessionExpiry(sessionRequestGeneration(), '/api/profile')).toBe(false);
        orden.push(`fetch ${url}`);
        return respuestaDelBorrado;
    }),
}));
vi.mock('../utils/avisosDeComida', () => ({
    interruptorAlNacer: vi.fn(() => true),
    apagarAvisosAlCerrarSesion: vi.fn(async () => { orden.push('apagarAvisos'); }),
    activarAvisos: vi.fn(async () => { orden.push('activarAvisos'); return { ok: true }; }),
}));
vi.mock('../utils/fotosDeComidas', () => ({ borrarFotosDelUsuario: vi.fn(async () => {}) }));
vi.mock('../utils/chatDraftStore', () => ({ clearAllChatDrafts: vi.fn(async () => { orden.push('borradores'); }) }));

import DeleteAccountSection from '../components/account/DeleteAccountSection';
import { activarAvisos } from '../utils/avisosDeComida';
import { fetchWithAuth } from '../config/api';

const contexto = () => ({
    session: { user: { id: 'u1' } },
    resetApp: vi.fn(async () => { orden.push('resetApp'); }),
    resetForNewAssessment: vi.fn(() => { orden.push('resetForNewAssessment'); }),
});

const sembrar = () => {
    const ls = window.localStorage;
    ls.setItem('mealfit_form', JSON.stringify({ name: 'Ana', weight: 70 }));
    ls.setItem('mealfit_form_secure', 'cifrado');
    ls.setItem('mealfit_micros_cache', '{}');
    ls.setItem('mealfit_tracking_consumed_2026-09-28', '[]');
    ls.setItem('mealfit_last_form_owner', 'u1');
    ls.setItem('mealfit_locale_owner', 'u1');
    ls.setItem('mf_brand_prefs', '{}');
    ls.setItem('mealfit_locale', 'fr-FR');
    ls.setItem('mealfit_theme', 'dark');
    ls.setItem('mealfit_analytics_opt_out', '1');
    ls.setItem('mealfit_fcm_token', 'token-del-telefono');
    ls.setItem('mf_ota_visto', '105');
    ls.setItem('otra_app', 'no es nuestra');
    ls.setItem('mf_cuentas_dispositivo', JSON.stringify([
        { id: 'u1', correo: 'an***@gmail.com', visto: 2 },
        { id: 'u2', correo: 'be***@gmail.com', visto: 1 },
    ]));
    window.sessionStorage.setItem('mealfit_guest_tab_alive', '1');
};

async function confirmarBorrado(user) {
    await user.click(screen.getByRole('button', { name: /Eliminar mi cuenta/ }));
    const campo = await screen.findByLabelText(/Escribe ELIMINAR para confirmar/);
    await user.type(campo, 'ELIMINAR');
    await user.click(screen.getByRole('button', { name: /Eliminar definitivamente/ }));
}

beforeEach(() => {
    expect(shouldSignalSessionExpiry(sessionRequestGeneration(), '/api/profile')).toBe(true);
    orden.length = 0;
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    respuestaDelBorrado = { ok: true, status: 200, json: async () => ({ success: true }) };
});

describe('[718] (a) los avisos se apagan ANTES de borrar la cuenta', () => {
    it('orden: apagar avisos → borrar cuenta → formulario en memoria → cierre de sesión', async () => {
        const user = userEvent.setup();
        render(<DeleteAccountSection />, { customContext: contexto() });
        await confirmarBorrado(user);
        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login', { replace: true }));

        const i = (x) => orden.indexOf(x);
        expect(i('apagarAvisos'), 'los avisos se apagaron DESPUÉS del borrado: sus DELETE darían 401').toBeGreaterThan(-1);
        expect(i('apagarAvisos')).toBeLessThan(i('fetch /api/account/delete'));
        expect(i('fetch /api/account/delete')).toBeLessThan(i('resetForNewAssessment'));
        expect(i('resetForNewAssessment')).toBeLessThan(i('resetApp'));
        expect(activarAvisos, 'con la cuenta borrada no hay nada que volver a encender').not.toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalled();
        expect(shouldSignalSessionExpiry(sessionRequestGeneration(), '/api/profile')).toBe(true);
    });
});

describe('[718] (b) lo local de la persona no sobrevive al borrado', () => {
    it('se barre lo suyo y se queda lo del dispositivo', async () => {
        sembrar();
        const user = userEvent.setup();
        render(<DeleteAccountSection />, { customContext: contexto() });
        await confirmarBorrado(user);
        await waitFor(() => expect(navigate).toHaveBeenCalled());

        const ls = window.localStorage;
        for (const k of ['mealfit_form', 'mealfit_form_secure', 'mealfit_micros_cache', 'mealfit_tracking_consumed_2026-09-28',
            'mealfit_last_form_owner', 'mealfit_locale_owner', 'mf_brand_prefs']) {
            expect(ls.getItem(k), `${k} sobrevivió al borrado de la cuenta`).toBeNull();
        }
        expect(window.sessionStorage.getItem('mealfit_guest_tab_alive')).toBeNull();
        // Del dispositivo, no de la persona:
        expect(ls.getItem('mealfit_locale')).toBe('fr-FR');
        expect(ls.getItem('mealfit_theme')).toBe('dark');
        expect(ls.getItem('mealfit_analytics_opt_out'), 'borrar la cuenta encendió la analítica').toBe('1');
        expect(ls.getItem('mealfit_fcm_token')).toBe('token-del-telefono');
        expect(ls.getItem('mf_ota_visto')).toBe('105');
        expect(ls.getItem('otra_app')).toBe('no es nuestra');
        // De las cuentas del dispositivo sale SOLO la borrada.
        expect(JSON.parse(ls.getItem('mf_cuentas_dispositivo')).map((c) => c.id)).toEqual(['u2']);
        await waitFor(() => expect(orden).toContain('borradores'));
    });
});

describe('[718] (c) un 502/503 dice que la cuenta sigue viva por PayPal', () => {
    it('mensaje propio, avisos de vuelta, y nada borrado', async () => {
        sembrar();
        respuestaDelBorrado = { ok: false, status: 502, json: async () => ({ detail: 'El proveedor de pagos rechazó la cancelación.' }) };
        const ctx = contexto();
        const user = userEvent.setup();
        render(<DeleteAccountSection />, { customContext: ctx });
        await confirmarBorrado(user);

        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(toast.error.mock.calls[0][0]).toMatch(/No pudimos cancelar tu suscripción con PayPal, así que no borramos tu cuenta/);
        expect(activarAvisos, 'un borrado fallido dejó los avisos apagados').toHaveBeenCalledTimes(1);
        expect(ctx.resetApp).not.toHaveBeenCalled();
        expect(window.localStorage.getItem('mealfit_form')).not.toBeNull();
        expect(navigate).not.toHaveBeenCalled();
        expect(shouldSignalSessionExpiry(sessionRequestGeneration(), '/api/profile')).toBe(true);
    });

    it('429 ⇒ «demasiados intentos»; el resto ⇒ el aviso genérico de siempre', async () => {
        respuestaDelBorrado = { ok: false, status: 429, json: async () => ({}) };
        const user = userEvent.setup();
        render(<DeleteAccountSection />, { customContext: contexto() });
        await confirmarBorrado(user);
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(toast.error.mock.calls[0][0]).toMatch(/Demasiados intentos seguidos/);
    });
});

describe('[718] (d) el campo de la palabra', () => {
    it('sin autocorrección ni corrector, en mayúsculas, y con el foco al abrir', async () => {
        const user = userEvent.setup();
        render(<DeleteAccountSection />, { customContext: contexto() });
        await user.click(screen.getByRole('button', { name: /Eliminar mi cuenta/ }));
        const campo = await screen.findByLabelText(/Escribe ELIMINAR para confirmar/);
        expect(campo).toHaveAttribute('autocorrect', 'off');
        expect(campo).toHaveAttribute('spellcheck', 'false');
        expect(campo).toHaveAttribute('autocapitalize', 'characters');
        await waitFor(() => expect(document.activeElement).toBe(campo));
    });
});

describe('el fin del borrado restaura el manejo de sesiones', () => {
    it('mantiene la protección hasta que termina el logout, antes del aviso de éxito', async () => {
        let finishLogout;
        const ctx = contexto();
        ctx.resetApp.mockImplementation(() => new Promise((resolve) => { finishLogout = resolve; }));
        render(<DeleteAccountSection />, { customContext: ctx });
        await confirmarBorrado(userEvent.setup());
        await waitFor(() => expect(finishLogout).toBeTypeOf('function'));
        expect(shouldSignalSessionExpiry(sessionRequestGeneration(), '/api/profile')).toBe(false);
        expect(toast.success).not.toHaveBeenCalled();
        finishLogout();
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(shouldSignalSessionExpiry(sessionRequestGeneration(), '/api/profile')).toBe(true);
    });

    it('libera la protección tras un error de red sin cerrar la sesión', async () => {
        fetchWithAuth.mockRejectedValueOnce(new TypeError('Network error'));
        const ctx = contexto();
        render(<DeleteAccountSection />, { customContext: ctx });
        await confirmarBorrado(userEvent.setup());
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(ctx.resetApp).not.toHaveBeenCalled();
        expect(shouldSignalSessionExpiry(sessionRequestGeneration(), '/api/profile')).toBe(true);
    });

    it('libera la protección también cuando el servidor declara un borrado parcial', async () => {
        respuestaDelBorrado = { ok: true, status: 200, json: async () => ({ success: false, errors: ['test'] }) };
        render(<DeleteAccountSection />, { customContext: contexto() });
        await confirmarBorrado(userEvent.setup());
        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(toast.warning).toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
        expect(shouldSignalSessionExpiry(sessionRequestGeneration(), '/api/profile')).toBe(true);
    });
});
