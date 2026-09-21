// [P1-PLAN-LOTE-152 · 2026-09-21] Bioboros en Android: la plataforma que no existía.
//
// El dueño va a probar con 5 testers de iOS y Android. Había `ios/` y no había `android/`: «probar en Android»
// significaba abrir la web en Chrome, que es otra cosa — sin avisos programados en el teléfono, sin cámara
// nativa y sin OTA.
//
// Este test ancla lo que costó encontrar. No mide que Android «funcione» (eso solo lo dice un teléfono): mide
// las CUATRO cosas que, cada una por su cuenta, dejaban la app muerta o inservible y que un `cap sync` o una
// actualización de plantilla pueden deshacer sin que nadie lo note.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(process.cwd());
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 152 · la app de Android existe y arranca', () => {
    it('el proyecto nativo está en el repo', () => {
        for (const f of [
            'android/app/src/main/AndroidManifest.xml',
            'android/app/build.gradle',
            'android/variables.gradle',
            'android/app/src/main/res/values/styles.xml',
        ]) {
            expect(fs.existsSync(path.join(RAIZ, f)), `falta ${f}`).toBe(true);
        }
    });

    it('los colores que el tema cita EXISTEN — sin esto el build ni empieza', () => {
        // La plantilla de Capacitor deja `styles.xml` citando tres colores y no crea el fichero que los define:
        // el build falla con «resource color/colorPrimary not found».
        const estilos = leer('android/app/src/main/res/values/styles.xml');
        const colores = leer('android/app/src/main/res/values/colors.xml');
        for (const nombre of [...estilos.matchAll(/@color\/(\w+)/g)].map((m) => m[1])) {
            expect(colores, `styles.xml cita @color/${nombre} y colors.xml no lo define`)
                .toContain(`name="${nombre}"`);
        }
    });

    it('el WebView declara su esquema, que es de donde sale el origen CORS', () => {
        // `androidScheme` decide el origen (`https://localhost`) que el backend tiene que permitir. Explícito
        // para que una versión de Capacitor no lo mueva y tire todas las llamadas a la API.
        const cfg = leer('capacitor.config.ts');
        expect(cfg).toContain("androidScheme: 'https'");
        expect(cfg).toContain('android: {');
        // el micrófono NO se declara en Android: en su WebView no existe SpeechRecognition
        const bloqueAndroid = cfg.slice(cfg.indexOf('android: {'), cfg.indexOf('plugins: {'));
        expect(bloqueAndroid).not.toContain('BioborosNative/mic');
    });

    it('los permisos de cámara van aquí y los de los plugins NO se duplican', () => {
        const m = leer('android/app/src/main/AndroidManifest.xml');
        expect(m).toContain('android.permission.CAMERA');
        expect(m).toContain('android.permission.READ_MEDIA_IMAGES');
        // el permiso viejo, acotado: desde Android 13 ya no se concede y sin tope Play lo marca
        expect(m).toMatch(/READ_EXTERNAL_STORAGE"\s+android:maxSdkVersion="32"/);
        // estos los declara su propio plugin; repetirlos aquí es ruido que nadie sabe si puede quitar.
        // Se miran las DECLARACIONES, no los comentarios: el propio manifiesto los nombra para explicar
        // de quién son, y un `toContain` a secas se tropezaría con esa explicación.
        const sinComentarios = m.replace(/<!--[\s\S]*?-->/g, '');
        for (const suyo of ['POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'VIBRATE']) {
            expect(sinComentarios, `${suyo} lo declara su plugin, no este manifiesto`).not.toContain(suyo);
        }
    });

    it('el primer APK nace POR ENCIMA del umbral de OTA', () => {
        // Con versionCode 1 el APK quedaría por debajo de `minNativeBuild` y rechazaría TODOS los paquetes
        // OTA: cada arreglo exigiría repartir un APK nuevo a mano durante la prueba.
        const gradle = leer('android/app/build.gradle');
        const code = Number(/versionCode\s+(\d+)/.exec(gradle)[1]);
        const ota = JSON.parse(leer('ota.config.json'));
        expect(code).toBeGreaterThanOrEqual(ota.minNativeBuild);
    });

    it('el flujo de Codemagic para Android existe y no pide firma para el primer APK', () => {
        const cm = leer('codemagic.yaml');
        expect(cm).toContain('android-apk:');
        expect(cm).toContain('npx cap sync android');
        expect(cm).toContain('./gradlew assembleDebug');
        expect(cm).toContain('android/app/build/outputs/**/*.apk');
        // el de iOS sigue intacto
        expect(cm).toContain('ios-testflight:');
    });

    it('targetSdk 34: el borde a borde forzado dejaría la cabecera bajo el reloj', () => {
        const v = leer('android/variables.gradle');
        const target = Number(/targetSdkVersion\s*=\s*(\d+)/.exec(v)[1]);
        expect(target).toBeLessThanOrEqual(34);
        expect(v).toContain('env(safe-area-inset-*)');   // la razón, escrita donde se decide
    });
});
