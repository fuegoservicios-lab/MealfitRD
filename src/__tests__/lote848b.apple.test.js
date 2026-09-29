/**
 * [P1-PLAN-LOTE-848 · parte B · 2026-09-29] Sign in with Apple: el código de autorización viaja al backend.
 *
 * App Review 5.1.1(v) (auditoría fila 3.2): al borrar la cuenta hay que revocar los tokens de Apple. Para eso el
 * backend necesita un refresh token, que sale de canjear el `authorizationCode`. El binario nuevo lo entrega; uno
 * anterior no, y el login sigue igual (sin la clave en el cuerpo).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apple = vi.hoisted(() => ({ respuesta: null }));
vi.mock('../config/platform', async (orig) => ({
    ...(await orig()),
    registrarPluginNativo: () => ({ authorize: async () => apple.respuesta }),
}));

import { pedirCredencialDeApple } from '../utils/appleSignInNative';
import { signInWithAppleFirstParty } from '../utils/firstPartySession';

let cuerpos;
beforeEach(() => {
    cuerpos = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
        cuerpos.push({ url: String(url), cuerpo: JSON.parse(init.body) });
        return { ok: true, status: 200, json: async () => ({ ok: true, user_id: 'u-1' }) };
    }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('[848-B] authorizationCode de Apple', () => {
    it('el binario nuevo lo entrega y llega al backend como authorization_code', async () => {
        apple.respuesta = { identityToken: 'jwt', name: 'Ana', authorizationCode: 'c.codigo' };
        const credencial = await pedirCredencialDeApple();
        expect(credencial.authorizationCode).toBe('c.codigo');
        await signInWithAppleFirstParty(credencial);
        const [{ url, cuerpo }] = cuerpos;
        expect(url).toContain('/api/auth/apple/native');
        expect(cuerpo).toMatchObject({ identity_token: 'jwt', name: 'Ana', authorization_code: 'c.codigo' });
        expect(cuerpo.nonce).toMatch(/^[0-9a-f]{64}$/);
    });

    it('un binario anterior no lo trae: el cuerpo es el de siempre, sin la clave', async () => {
        apple.respuesta = { identityToken: 'jwt', name: '' };
        const credencial = await pedirCredencialDeApple();
        expect(credencial.authorizationCode).toBeUndefined();
        await signInWithAppleFirstParty(credencial);
        expect(Object.keys(cuerpos[0].cuerpo).sort()).toEqual(['identity_token', 'nonce']);
    });

    it('el Swift lo devuelve como texto UTF-8 y solo si existe', () => {
        const swift = readFileSync(resolve(__dirname, '../../ios/App/App/SceneDelegate.swift'), 'utf8');
        expect(swift).toContain('if let datosDelCodigo = credencial.authorizationCode,');
        expect(swift).toContain('let codigo = String(data: datosDelCodigo, encoding: .utf8),');
        expect(swift).toContain('respuesta["authorizationCode"] = codigo');
        expect(swift).toContain('peticion.nonce = nonce');
    });
});
