// [P1-PLAN-LOTE-146 · 2026-09-20] «Continuar con Apple» NATIVO en la app de iOS.
//
// El dueño: «¿por qué en la app nativa no está el botón de continuar con Google?». El OAuth por redirección no vuelve
// a la app (P1-IOS-OAUTH-GATE), Apple (4.8) exige su botón si se ofrece otro proveedor, y Neon Auth NO ofrece Apple.
// Camino: plugin LOCAL de Capacitor (hoja nativa) → identity token → nuestro backend lo verifica y emite la sesión.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { nuevoNonce, sha256Hex } from '../utils/appleSignInNative';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 146 · Sign in with Apple nativo', () => {
    it('el nonce es aleatorio de 32 bytes y a Apple se le da su SHA-256 (el crudo es para el backend)', async () => {
        const a = nuevoNonce();
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(nuevoNonce()).not.toBe(a);
        expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        const util = leer('src/utils/appleSignInNative.js');
        expect(util).toContain('await MfAppleSignIn.authorize({ nonce: hash })');
        expect(util).toContain('return { identityToken: r.identityToken, nonce, name:');
    });

    it('el plugin se registra a nivel de MÓDULO y por platform.js (el ÚNICO que habla con Capacitor)', () => {
        const util = leer('src/utils/appleSignInNative.js');
        expect(util).toMatch(/^const MfAppleSignIn = registrarPluginNativo\('MfAppleSignIn'\);$/m);
        expect(util).not.toContain('@capacitor/core');
        const plat = leer('src/config/platform.js');
        expect(plat).toContain("return nativePluginAvailable('MfAppleSignIn');");
        expect(plat).toContain('if (appleSignInNativo()) return true;');
    });

    it('el botón solo existe donde puede funcionar, y cerrar la hoja NO es un error', () => {
        const login = leer('src/pages/Login.jsx');
        // el JSX consume EL gate de siempre (P1-IOS-NATIVE-SHELL: una superficie, un gate); la rama nativa es del handler
        expect(login).toContain('{appleSignInEnabled() && (');
        expect(login).toContain("const handleApple = () => (appleSignInNativo() ? handleAppleNativo() : handleOAuth('apple'));");
        expect(login).toContain('if (credencial.cancelado) { setGoogleLoading(false); return; }');
        // Google sigue oculto en nativo: eso es OTRO problema (el deep link) y no se toca aquí
        expect(leer('src/config/platform.js')).toMatch(/export function nativeHidesOAuthRedirect\(\) \{\s+return isNativeApp\(\);/);
    });

    it('el binario: plugin local registrado por el controlador propio, entitlement y firma', () => {
        const swift = leer('ios/App/App/SceneDelegate.swift');
        expect(swift).toContain('window?.rootViewController = PuenteBioboros()');
        expect(swift).toContain('bridge?.registerPluginInstance(MfAppleSignInPlugin())');
        expect(swift).toContain('let jsName = "MfAppleSignIn"');
        expect(swift).toContain('peticion.nonce = nonce');
        expect(leer('ios/App/App/App.entitlements')).toContain('<key>com.apple.developer.applesignin</key>');
        const pbx = leer('ios/App/App.xcodeproj/project.pbxproj');
        expect(pbx.split('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;').length - 1).toBe(2);
    });
});
