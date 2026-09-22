// [P1-PLAN-LOTE-159 · 2026-09-22] Clave de firma FIJA para el APK de los testers.
//
// `assembleDebug` firma con la clave de depuración que genera la MÁQUINA del build, y las de
// Codemagic son efímeras: cada APK salía con una firma distinta, Android se negaba a instalarlo
// encima del anterior («no se pudo instalar») y el tester tenía que desinstalar — perdiendo la
// sesión y volviendo a entrar con su correo y su código. Repartir un arreglo costaba una
// reinstalación por persona.
//
// Y mirando al siguiente paso que el dueño preguntó: **Google como botón de entrada en Android
// se ata a la huella (SHA-1/SHA-256) de la clave de firma**. Con una clave que cambia en cada
// build, ese login se rompería en cada APK. Fijar la clave va ANTES, no después.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '..', '..');
const leer = (rel) => fs.readFileSync(path.resolve(raiz, rel), 'utf-8');

describe('[P1-PLAN-LOTE-159] la firma del APK de los testers', () => {
    const gradle = leer('android/app/build.gradle');
    const cm = leer('codemagic.yaml');

    it('el flujo pide la clave por su nombre de referencia', () => {
        expect(cm).toContain('android_signing:');
        expect(cm).toContain('- bioboros_testers');
    });

    it('el APK que se reparte (debug) se firma con ella, no con la de la máquina', () => {
        const debug = gradle.slice(gradle.indexOf('debug {'), gradle.indexOf('}', gradle.indexOf('debug {')));
        expect(debug).toContain('signingConfig signingConfigs.testers');
    });

    it('la clave sale del ENTORNO: no hay secreto en el repositorio', () => {
        expect(gradle).toContain('System.getenv("CM_KEYSTORE_PATH")');
        expect(gradle).toContain('System.getenv("CM_KEYSTORE_PASSWORD")');
        // Lo que NUNCA puede aparecer aquí es el material de la clave.
        expect(gradle).not.toMatch(/storePassword\s+['"]/);
        expect(gradle).not.toMatch(/keyPassword\s+['"]/);
        expect(gradle).not.toContain('.jks');
        expect(gradle).not.toContain('.keystore');
    });

    it('sin la clave, un build local sigue funcionando', () => {
        // Es lo que permite mergear esto hoy sin romper nada: el bloque entero es condicional.
        // Si alguien lo vuelve incondicional, `assembleDebug` en una máquina sin las variables
        // falla con «storeFile null» y nadie puede construir en local.
        expect(gradle).toContain('def _cmKeystore = System.getenv("CM_KEYSTORE_PATH")');
        expect(gradle).toMatch(/if\s*\(_cmKeystore\)\s*\{\s*signingConfigs/);
        expect(gradle).toMatch(/if\s*\(_cmKeystore\)\s*\{\s*signingConfig signingConfigs\.testers/);
    });

    it('el número de versión sube: sin eso no se instala encima', () => {
        const code = Number(/versionCode\s+(\d+)/.exec(gradle)[1]);
        expect(code).toBeGreaterThan(100);
        // Y sigue por encima del umbral de OTA, que es lo que vigilaba el 152.
        expect(code).toBeGreaterThanOrEqual(JSON.parse(leer('ota.config.json')).minNativeBuild);
    });

    it('el almacén de claves NO está en el árbol', () => {
        // Un `.jks` commiteado sería la clave de firma de la app en un repositorio: quien lo
        // tenga puede publicar actualizaciones que el teléfono acepta como nuestras.
        const sospechosos = [];
        const recorrer = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                if (e.name === 'node_modules' || e.name === '.git' || e.name === 'build') continue;
                const p = path.join(dir, e.name);
                if (e.isDirectory()) recorrer(p);
                else if (/\.(jks|keystore|p12)$/i.test(e.name)) sospechosos.push(p);
            }
        };
        recorrer(path.join(raiz, 'android'));
        expect(sospechosos).toEqual([]);
    });
});
