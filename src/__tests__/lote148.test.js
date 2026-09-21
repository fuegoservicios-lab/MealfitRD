// [P1-PLAN-LOTE-148 · 2026-09-21] «Continuar con Apple» también en el NAVEGADOR.
//
// El dueño: «en la web también debería verse el poder continuar con apple». No va por Neon Auth (no ofrece Apple
// como proveedor) sino por la librería del propio Apple en modo emergente, que devuelve el `id_token` en JS.
// Ese token lo verifica el MISMO endpoint que ya usa el iPhone: por eso no hace falta la clave `.p8`.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { APPLE_WEB_CLIENT_ID } from '../utils/appleSignInWeb';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 148 · Apple en la web', () => {
    it('usa el Services ID, modo emergente, y se queda con el id_token (el código se ignora: por eso no hay .p8)', () => {
        expect(APPLE_WEB_CLIENT_ID).toBe('com.bioboros.app.web');
        const web = leer('src/utils/appleSignInWeb.js');
        expect(web).toContain('usePopup: true');
        expect(web).toContain('const identityToken = r?.authorization?.id_token;');
        expect(web).not.toContain('client_secret');
        // la prueba de que no hace falta la clave: el CÓDIGO de autorización no se usa en ninguna parte
        expect(web).not.toContain('authorization?.code');
        expect(web).not.toContain('authorization.code');
    });

    it('la librería de Apple se carga BAJO DEMANDA, no en el arranque de la página', () => {
        const web = leer('src/utils/appleSignInWeb.js');
        expect(web).toContain("document.createElement('script')");
        expect(web).toContain('export async function pedirCredencialDeAppleWeb()');
        expect(web).toContain('await cargarAppleJS();');
        // nada de <script> de Apple en el HTML: eso lo pagaría todo el que abre el login
        expect(leer('index.html')).not.toContain('appleid.cdn-apple.com');
    });

    it('los dos caminos terminan en el MISMO canje, porque los dos dan un id_token de Apple', () => {
        const login = leer('src/pages/Login.jsx');
        expect(login).toContain('appleSignInNativo() ? await pedirCredencialDeApple() : await pedirCredencialDeAppleWeb()');
        expect(login).toContain('await signInWithAppleFirstParty(credencial)');
        expect(login).not.toContain("handleOAuth('apple')");
    });

    it('sigue apagado hasta que Apple verifique el dominio: un botón que falla es peor que ninguno', () => {
        const plat = leer('src/config/platform.js');
        expect(plat).toContain("String(import.meta.env.VITE_AUTH_APPLE_ENABLED ?? '').toLowerCase() === 'true'");
        expect(leer('.env.production')).not.toContain('VITE_AUTH_APPLE_ENABLED=true');
    });
});
