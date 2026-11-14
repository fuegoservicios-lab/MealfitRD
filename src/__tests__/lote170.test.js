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
        expect(plugins).toContain("SystemBars: { insetsHandling: 'disable', style: 'DARK' },");
        expect(leer('android/app/src/main/AndroidManifest.xml')).toContain('android:windowSoftInputMode="adjustResize"');
    });

    // [ANDROID-PLAY-TARGET-36 · 2026-11-13] Era «targetSdk ≤ 34»: Play exige 36 y ahí Android impone el borde a borde.
    // Lo que este test protege no cambió —la WebView se ENCOGE con el teclado—; cambió quién lo hace: MainActivity.
    it('targetSdk 36 (Play) y MainActivity aparta la WebView de las barras y del teclado', () => {
        const target = Number(/targetSdkVersion\s*=\s*(\d+)/.exec(leer('android/variables.gradle'))[1]);
        expect(target).toBeGreaterThanOrEqual(36);
        const actividad = leer('android/app/src/main/java/com/bioboros/app/MainActivity.java');
        expect(actividad).not.toMatch(/setDecorFitsSystemWindows|EdgeToEdge/);
        expect(actividad).toContain('setOnApplyWindowInsetsListener');
        // el teclado entra en el padding: sin esto la caja de escribir queda tapada (el fallo del lote 170)
        expect(actividad).toContain('Math.max(barras.bottom, teclado.bottom)');
        // y a la WebView le llega en cero: si le llega, Chromium se encoge otra vez
        expect(actividad).toContain('.setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)');
        expect(actividad).not.toContain('WindowInsetsCompat.CONSUMED;');
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
