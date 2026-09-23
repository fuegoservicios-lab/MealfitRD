// [P1-PLAN-LOTE-170 · 2026-09-23] APK 104: en Android el teclado lo vuelve a encoger Android.
//
// «En la app Android el teclado le sigue tapando todo; en iPhone se ve bien», con el paquete OTA del teclado ya
// instalado (nginx: los dos Android lo bajaron y reabrieron la app, y estaban en el FORMULARIO). SystemBars de
// Capacitor 8, en modo 'css', sustituía el `adjustResize` de Android por su propio padding de la DecorView. La web no
// lo puede arreglar sola: si la WebView no cambia de tamaño, el `visualViewport` tampoco, y la red de seguridad del
// formulario (lote 166) no ve teclado. Es config del binario: no viaja por OTA.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { campoTapadoPorTeclado } from '../hooks/useCampoVisibleConTeclado';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 170 · el teclado de Android', () => {
    it('SystemBars sin escuchador de márgenes, y el adjustResize de Android sigue declarado', () => {
        const cap = leer('capacitor.config.ts');
        const plugins = cap.slice(cap.indexOf('plugins: {'));
        expect(plugins).toContain("SystemBars: { insetsHandling: 'disable' },");
        expect(leer('android/app/src/main/AndroidManifest.xml')).toContain('android:windowSoftInputMode="adjustResize"');
    });

    it('solo es seguro sin borde a borde: targetSdk ≤ 34 (con 35 Android lo impone y hay que repensar los márgenes)', () => {
        const target = Number(/targetSdkVersion\s*=\s*(\d+)/.exec(leer('android/variables.gradle'))[1]);
        expect(target).toBeLessThanOrEqual(34);
        expect(leer('android/app/src/main/java/com/bioboros/app/MainActivity.java')).not.toMatch(/setDecorFitsSystemWindows|EdgeToEdge/);
    });

    it('la red del formulario no ve un teclado que no encoge la WebView; con adjustResize, sí', () => {
        // Campo al pie de una pantalla de 800 px; el teclado mide 350.
        const campo = { getBoundingClientRect: () => ({ top: 600, bottom: 640 }) };
        // Modo 'css' en el teléfono del tester: la WebView no cambia de tamaño y el visualViewport tampoco.
        expect(campoTapadoPorTeclado(campo, { height: 800, offsetTop: 0 })).toBe(false);
        // APK 104: Android encoge la WebView a 450 → el campo queda fuera y la red lo sube.
        expect(campoTapadoPorTeclado(campo, { height: 450, offsetTop: 0 })).toBe(true);
    });

    it('APK 104 sin subir el umbral de OTA: la web funciona con los dos binarios', () => {
        const gradle = leer('android/app/build.gradle');
        const code = Number(/versionCode\s+(\d+)/.exec(gradle)[1]);
        expect(code).toBeGreaterThanOrEqual(104);
        expect(gradle).toContain(`versionName "1.0.${code}"`);
        const ota = JSON.parse(leer('ota.config.json'));
        expect(ota.minNativeBuild).toBe(13);
        expect(ota._nota_lote_170).toContain('insetsHandling');
    });
});
