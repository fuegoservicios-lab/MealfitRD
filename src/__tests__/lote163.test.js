// [P1-PLAN-LOTE-163 · 2026-09-22] El APK 103: el gesto «atrás» de Android, y el icono de Bioboros.
//
// Sin `@capacitor/app`, el gesto atrás no llegaba nunca a la web: Android mandaba la app al fondo (12+) o la CERRABA
// (11 y anteriores, perdiendo lo escrito) desde cualquier pantalla, con un modal abierto o a mitad del formulario.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const oyentes = {};
const llamadas = [];
const metodos = {
    addListener: async (evento, fn) => { oyentes[evento] = fn; return { remove: async () => {} }; },
    minimizeApp: async () => { llamadas.push('minimizar'); },
};
// Fiel al Proxy real de Capacitor: lo desconocido no contesta nunca.
vi.mock('@capacitor/app', () => ({
    App: new Proxy({}, { get: (_t, prop) => metodos[prop] || (() => new Promise(() => {})) }),
}));
vi.mock('../config/platform', () => ({ isNativeApp: () => true, nativePluginAvailable: (n) => n === 'App' }));

import { decidirAtras, iniciarBotonAtras, RUTAS_RAIZ } from '../native/botonAtras';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 163 · qué hace el gesto atrás', () => {
    it('con un diálogo abierto, lo cierra (antes que nada)', () => {
        expect(decidirAtras({ hayModal: true, ruta: '/dashboard', puedeVolver: true })).toBe('cerrar-modal');
    });

    it('en una pestaña raíz, minimiza — también con la barra final y aunque haya historial', () => {
        for (const r of RUTAS_RAIZ) expect(decidirAtras({ ruta: r, puedeVolver: true })).toBe('minimizar');
        expect(decidirAtras({ ruta: '/dashboard/agent/', puedeVolver: true })).toBe('minimizar');
    });

    it('en una subpantalla con historial, vuelve; sin historial, minimiza (nunca cierra)', () => {
        expect(decidirAtras({ ruta: '/assessment', puedeVolver: true })).toBe('volver');
        expect(decidirAtras({ ruta: '/login', puedeVolver: true })).toBe('volver');
        expect(decidirAtras({ ruta: '/assessment', puedeVolver: false })).toBe('minimizar');
    });
});

describe('lote 163 · el oyente, contra el doble fiel del plugin', () => {
    beforeEach(() => { llamadas.length = 0; document.body.innerHTML = ''; });

    it('se registra, cierra el diálogo de arriba por el camino de Escape, y minimiza en la raíz', async () => {
        await iniciarBotonAtras();
        expect(typeof oyentes.backButton).toBe('function');

        const escapes = [];
        const alEscape = (e) => { if (e.key === 'Escape') escapes.push(e); };
        document.addEventListener('keydown', alEscape);
        document.body.innerHTML = '<div role="dialog" aria-modal="true">modal</div>';
        oyentes.backButton({ canGoBack: true });
        expect(escapes.length).toBe(1);
        expect(llamadas).toEqual([]);
        document.removeEventListener('keydown', alEscape);

        document.body.innerHTML = '';
        window.history.replaceState({}, '', '/dashboard');
        oyentes.backButton({ canGoBack: true });
        expect(llamadas).toEqual(['minimizar']);

        const atras = vi.spyOn(window.history, 'back').mockImplementation(() => {});
        window.history.replaceState({}, '', '/assessment');
        oyentes.backButton({ canGoBack: true });
        expect(atras).toHaveBeenCalledTimes(1);
        atras.mockRestore();
    });
});

describe('lote 163 · el binario lo trae', () => {
    it('@capacitor/app está en el proyecto y cableado en Android', () => {
        expect(JSON.parse(leer('package.json')).dependencies['@capacitor/app']).toBeTruthy();
        expect(leer('android/capacitor.settings.gradle')).toContain("include ':capacitor-app'");
        expect(leer('android/app/capacitor.build.gradle')).toContain("implementation project(':capacitor-app')");
        expect(leer('src/main.jsx')).toContain("import('./native/botonAtras')");
    });

    it('sube el versionCode (se instala encima) y NO el umbral de OTA; el versionName dice cuál es', () => {
        const gradle = leer('android/app/build.gradle');
        expect(Number(/versionCode\s+(\d+)/.exec(gradle)[1])).toBe(103);
        expect(gradle).toContain('versionName "1.0.103"');
        // la capacidad está gateada por `nativePluginAvailable('App')`: un APK viejo degrada bien con el JS nuevo
        const ota = JSON.parse(leer('ota.config.json'));
        expect(ota.minNativeBuild).toBe(13);
        // …pero la dependencia SÍ entra en la foto del OTA (lote108.test.js exige que case con package.json): el
        // primer intento del deploy se paró ahí porque el lote la añadió a package.json y no aquí.
        expect(ota.nativeDeps['@capacitor/app']).toBe(JSON.parse(leer('package.json')).dependencies['@capacitor/app']);
        expect(ota._nota_lote_163).toContain("nativePluginAvailable('App')");
    });

    it('Google en Android manda el detalle del «cancelado» (lo único que separa un «ahora no» de un fallo)', () => {
        const java = leer('android/app/src/main/java/com/bioboros/app/MfGoogleId.java');
        expect(java).toContain('datos.put("detalle", String.valueOf(e.getMessage()));');
        expect(java).toContain('call.reject("Cancelado por la persona.", "CANCELADO", datos);');
    });

    it('el icono adaptativo tiene el fondo de la marca, no el blanco de la plantilla', () => {
        expect(leer('android/app/src/main/res/values/ic_launcher_background.xml')).toContain('#01071D');
    });
});
