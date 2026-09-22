// [P1-PLAN-LOTE-147 · 2026-09-21] «Continuar con Google» NATIVO en la app de iOS.
//
// El dueño, tras ver funcionar Apple: «procedamos con google». El OAuth por redirección no vuelve a la app
// (P1-IOS-OAUTH-GATE). Camino: plugin TONTO sobre ASWebAuthenticationSession (marco del sistema, cero
// dependencias) → código PKCE → nuestro backend lo canjea, verifica el id_token y emite la sesión.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_IOS_REDIRECT, GOOGLE_IOS_SCHEME } from '../utils/googleSignInNative';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 147 · Google nativo', () => {
    it('el esquema de vuelta es el client ID AL REVÉS (lo define Google, no nosotros)', () => {
        expect(GOOGLE_IOS_CLIENT_ID).toMatch(/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/);
        expect(GOOGLE_IOS_SCHEME).toBe(`com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID.replace('.apps.googleusercontent.com', '')}`);
        expect(GOOGLE_IOS_REDIRECT).toBe(`${GOOGLE_IOS_SCHEME}:/oauth2redirect`);
        expect(GOOGLE_IOS_SCHEME).not.toContain('.apps.googleusercontent.com');
    });

    it('PKCE con S256 y sin secreto; el verifier solo sale hacia NUESTRO backend', () => {
        const util = leer('src/utils/googleSignInNative.js');
        expect(util).toContain("code_challenge_method: 'S256'");
        expect(util).toContain("response_type: 'code'");
        expect(util).toContain('code_challenge: await reto(codeVerifier)');
        expect(util).not.toContain('client_secret');
        expect(util).toContain("if (params.get('state') !== state) throw new Error('ESTADO_AJENO');");
        // el canje NO se hace aquí: lo hace el backend, que además verifica la firma
        expect(util).not.toContain('oauth2.googleapis.com/token');
        expect(leer('src/utils/firstPartySession.js')).toContain("api('/api/auth/google/native')");
    });

    it('el plugin se registra a nivel de MÓDULO y por platform.js (el ÚNICO que habla con Capacitor)', () => {
        const util = leer('src/utils/googleSignInNative.js');
        expect(util).toMatch(/^const MfWebAuth = registrarPluginNativo\('MfWebAuth'\);$/m);
        expect(util).not.toContain('@capacitor/core');
    });

    it('la condición nueva entra DENTRO del gate que ya existe: el JSX del login no cambia', () => {
        const plat = leer('src/config/platform.js');
        expect(plat).toContain('if (googleSignInNativo()) return false;');
        // [P1-PLAN-LOTE-160] La respuesta dejó de ser UN plugin: Android entró con `MfGoogleId` y el gate
        // pasó a ser un OR. Lo que este test defiende sigue intacto —que la pregunta se le haga al BINARIO
        // y no a la plataforma—, así que se ancla la mitad de iOS y el OR lo vigila `lote160.test.js`.
        expect(plat).toMatch(/return nativePluginAvailable\('MfWebAuth'\)/);
        const login = leer('src/pages/Login.jsx');
        expect(login).toContain("const handleGoogle = () => (googleSignInNativo() ? handleGoogleNativo() : handleOAuth('google'));");
        // [P1-PLAN-LOTE-162] Cerrar la hoja sigue sin ser un ERROR (nada de rojo), pero en Android deja a la vista la
        // salida del correo: Credential Manager reporta como «cancelado» también fallos de configuración.
        const i = login.indexOf('if (vuelta.cancelado) {');
        expect(i).toBeGreaterThan(-1);
        const rama = login.slice(i, login.indexOf('return;', i));
        expect(rama).toContain('setGoogleLoading(false);');
        expect(rama).not.toContain('setError(');
    });

    it('el binario: plugin genérico, solo https, y la vista comparte cookies de Safari', () => {
        const swift = leer('ios/App/App/SceneDelegate.swift');
        expect(swift).toContain('bridge?.registerPluginInstance(MfWebAuthPlugin())');
        expect(swift).toContain('let jsName = "MfWebAuth"');
        expect(swift).toContain('ASWebAuthenticationSession(url: url, callbackURLScheme: esquema)');
        expect(swift).toContain('guard url.scheme?.lowercased() == "https" else {');
        expect(swift).toContain('sesion.prefersEphemeralWebBrowserSession = false');
        // no entra ningún SDK de Google: el plugin es del sistema
        expect(leer('package.json')).not.toContain('google-auth');
    });
});
