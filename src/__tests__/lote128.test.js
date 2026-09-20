// [P1-PLAN-LOTE-128 · 2026-09-19] La app nativa quita la barra de accesorios del teclado de iOS (flechas y ✓).
//
// El dueño: «quita la barra de flechas de iOS sobre el teclado». Es código NATIVO: viaja en el binario (build de
// Codemagic), no por OTA. Este test ancla las tres decisiones que un refactor bienintencionado rompería.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 128 · sin barra de accesorios sobre el teclado en la app nativa', () => {
    const escena = leer('ios/App/App/SceneDelegate.swift');

    it('vive en el SceneDelegate: con ciclo de vida por escenas, AppDelegate.applicationDidBecomeActive no corre', () => {
        expect(leer('ios/App/App/Info.plist')).toContain('<key>UIApplicationSceneManifest</key>');
        expect(escena).toContain('func sceneDidBecomeActive(_ scene: UIScene) {');
        expect(escena).toContain('bridgeVC.webView?.ocultarBarraDeAccesorios()');
    });

    it('la subclase en tiempo de ejecución devuelve nil en inputAccessoryView, y es idempotente', () => {
        expect(escena).toContain('@objc var inputAccessoryView: UIView? { return nil }');
        expect(escena).toContain('hasPrefix("WKContent")');
        expect(escena).toContain('if nombreActual.hasSuffix(sufijo) { return }');
        expect(escena).toContain('object_setClass(contenido, claseNueva)');
    });

    it('NO entra @capacitor/keyboard: dejaría ciega la geometría del teclado del chat (decisión del lote 111)', () => {
        const pkg = JSON.parse(leer('package.json'));
        expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('@capacitor/keyboard');
        expect(Object.keys(JSON.parse(leer('ota.config.json')).nativeDeps)).not.toContain('@capacitor/keyboard');
    });
});
