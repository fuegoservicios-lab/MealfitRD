// [P1-PLAN-LOTE-95 · 2026-09-17] «Continuar con Google» pregunta SIEMPRE qué cuenta usar (decisión del dueño).
//
// En su iPhone, Google entró sin preguntar con la otra cuenta de Gmail del teléfono y creó una identidad vacía. Sin
// `prompt`, Google reutiliza la sesión activa. El endpoint de Better Auth no acepta `prompt` por petición y el adaptador no
// reenvía `queryParams`, así que se pide la URL con `disableRedirect: true`, se le añade `prompt=select_account` y se navega.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const social = vi.fn();
const adaptadorOAuth = vi.fn(async () => ({ data: { provider: 'apple', url: null }, error: null }));
vi.mock('@neondatabase/neon-js', () => ({
    SupabaseAuthAdapter: () => ({}),
    createClient: () => ({
        auth: {
            signInWithOAuth: adaptadorOAuth,
            getBetterAuthInstance: () => ({ signIn: { social } }),
            getSession: async () => ({ data: { session: null } }),
        },
    }),
}));

import { authClient, conSelectorDeCuenta } from '../authClient';

const URL_GOOGLE = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&state=xyz&code_challenge=q';

describe('conSelectorDeCuenta', () => {
    it('añade el selector a la URL de Google', () => {
        const u = new URL(conSelectorDeCuenta(URL_GOOGLE));
        expect(u.searchParams.get('prompt')).toBe('select_account');
        // el resto de la URL (estado, PKCE) queda intacto
        expect(u.searchParams.get('state')).toBe('xyz');
        expect(u.searchParams.get('code_challenge')).toBe('q');
    });

    it('suma a un prompt existente sin duplicar, y respeta `none`', () => {
        expect(new URL(conSelectorDeCuenta(URL_GOOGLE + '&prompt=consent')).searchParams.get('prompt')).toBe('consent select_account');
        const ya = URL_GOOGLE + '&prompt=select_account';
        expect(conSelectorDeCuenta(ya)).toBe(ya);
        const none = URL_GOOGLE + '&prompt=none';
        expect(conSelectorDeCuenta(none)).toBe(none);
    });

    it('no toca otros proveedores ni URLs rotas', () => {
        const apple = 'https://appleid.apple.com/auth/authorize?client_id=a';
        expect(conSelectorDeCuenta(apple)).toBe(apple);
        expect(conSelectorDeCuenta('no-es-una-url')).toBe('no-es-una-url');
    });
});

describe('signInWithOAuth con Google', () => {
    beforeEach(() => {
        social.mockReset();
        adaptadorOAuth.mockClear();
        Object.defineProperty(window, 'location', {
            configurable: true, writable: true,
            value: { href: 'https://app.bioboros.com/login', origin: 'https://app.bioboros.com' },
        });
    });

    it('pide la URL sin redirigir, le añade el selector y navega', async () => {
        social.mockResolvedValue({ data: { url: URL_GOOGLE, redirect: false }, error: null });
        const r = await authClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://app.bioboros.com/dashboard' } });
        expect(social).toHaveBeenCalledWith({ provider: 'google', callbackURL: 'https://app.bioboros.com/dashboard', disableRedirect: true });
        expect(new URL(window.location.href).searchParams.get('prompt')).toBe('select_account');
        expect(r.error).toBeNull();
        expect(adaptadorOAuth).not.toHaveBeenCalled();
    });

    it('si Better Auth devuelve error, lo devuelve y NO navega', async () => {
        social.mockResolvedValue({ data: null, error: { message: 'provider not found', status: 404 } });
        const r = await authClient.auth.signInWithOAuth({ provider: 'google', options: {} });
        expect(r.error.message).toBe('provider not found');
        expect(window.location.href).toBe('https://app.bioboros.com/login');
    });

    it('otros proveedores siguen por el camino de siempre', async () => {
        await authClient.auth.signInWithOAuth({ provider: 'apple', options: {} });
        expect(adaptadorOAuth).toHaveBeenCalledTimes(1);
        expect(social).not.toHaveBeenCalled();
    });
});
