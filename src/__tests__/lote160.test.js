// [P1-PLAN-LOTE-160 · 2026-09-22] «Continuar con Google» en Android.
//
// El dueño: «dale con el continuar con google en android».
//
// POR QUÉ NO SE COPIÓ EL CAMINO DE iOS. El lote 147 abre la pantalla de Google en una vista web del
// sistema y vuelve por un esquema propio, trayendo un CÓDIGO que canjea el backend (PKCE). Google retiró
// ese destino en Android — «Custom URI schemes are no longer supported on Android» —, así que no hay
// vuelta y no hay código que canjear. El camino vigente es Credential Manager, que entrega el `id_token`
// ya firmado. Es una diferencia de PROTOCOLO, no de plataforma; por eso son dos módulos y no un `if`.
//
// Y por qué iba DESPUÉS de la clave fija (lote 159): Google ata la autorización de la app a su paquete
// más la huella SHA-1 de su clave de firma. Con una clave que cambiaba en cada build, este login se
// habría roto en cada APK.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '..', '..');
const leer = (rel) => fs.readFileSync(path.resolve(raiz, rel), 'utf-8');

describe('[P1-PLAN-LOTE-160] Google en Android', () => {
    const plat = leer('src/config/platform.js');
    const util = leer('src/utils/googleSignInAndroid.js');
    const login = leer('src/pages/Login.jsx');
    const plugin = leer('android/app/src/main/java/com/bioboros/app/MfGoogleId.java');

    it('el gate pregunta por el BINARIO, y ahora admite los dos mecanismos', () => {
        // Un OR, no un `isIOS()`: un binario viejo sin su plugin contesta false y cae al camino web,
        // que es la degradación correcta y no un caso a evitar.
        expect(plat).toMatch(/nativePluginAvailable\('MfWebAuth'\)\s*\|\|\s*nativePluginAvailable\('MfGoogleId'\)/);
        expect(plat).toContain('export function googleSignInPorCredentialManager()');
    });

    it('el login elige el mecanismo por el plugin, no por la plataforma', () => {
        expect(login).toContain('googleSignInPorCredentialManager()');
        expect(login).toContain('pedirTokenDeGoogle()');
        // El gate de arriba no cambia: el JSX del botón sigue siendo uno solo.
        expect(login).toContain("const handleGoogle = () => (googleSignInNativo() ? handleGoogleNativo() : handleOAuth('google'));");
    });

    it('el plugin se registra a nivel de MÓDULO, nunca devuelto desde una async', () => {
        // La trampa del lote 133: es un Proxy; si sale de una promesa el motor le lee `.then` y se cuelga.
        expect(util).toMatch(/^const MfGoogleId = registrarPluginNativo\('MfGoogleId'\);$/m);
    });

    it('lo que va a Google es el cliente WEB, que es el error fácil de cometer', () => {
        // En Android el token NO se emite para el cliente de tipo Android: Google exige pasar el de tipo
        // Web como `serverClientId`, y ése acaba en el `aud`. El de tipo Android existe aparte y es lo que
        // ata la app a su paquete y a la huella de su clave; nunca viaja en el token.
        expect(util).toContain("export const GOOGLE_SERVER_CLIENT_ID = '323329713741-qqcajd7sslluuegc1hq0pcdcrik0mvkb.apps.googleusercontent.com'");
        expect(util).toContain('serverClientId: GOOGLE_SERVER_CLIENT_ID');
    });

    it('cada pulsación lleva su propio nonce aleatorio', () => {
        // Es lo que ata el token a ESTA pulsación: viaja dentro del token firmado por Google y en el cuerpo
        // de nuestra petición, y solo se juntan en el backend. Un nonce fijo no ataría nada.
        expect(util).toContain('const nonce = aleatorio(32)');
        expect(util).toContain('crypto.getRandomValues');
        expect(util).toMatch(/return \{ idToken, nonce \}/);
    });

    it('cerrar la hoja no es un error, y no tener cuentas tampoco', () => {
        // [P1-PLAN-LOTE-162] …y trae el detalle nativo, lo único que separa un «ahora no» de un fallo de configuración
        expect(util).toContain("if (e?.code === 'CANCELADO') return { cancelado: true, detalle: e?.data?.detalle || null };");
        expect(util).toContain("if (e?.code === 'SIN_CUENTAS') return { sinCuentas: true };");
        expect(plugin).toContain('"CANCELADO"');
        expect(plugin).toContain('"SIN_CUENTAS"');
        expect(login).toContain('if (vuelta.sinCuentas)');
    });

    it('el plugin nativo es TONTO: no mira el token, solo lo pasa', () => {
        // Toda la verificación (firma, emisor, audiencia, nonce, frescura) vive en el backend. Una defensa
        // dentro del binario sería imposible de arreglar sin repartir otro APK.
        expect(plugin).toContain('salida.put("idToken", google.getIdToken())');
        expect(plugin).not.toMatch(/\bverify|\bdecode|jwt/i);
        // Y comprueba el TIPO antes de leer el bundle: Credential Manager es genérico.
        expect(plugin).toContain('TYPE_GOOGLE_ID_TOKEN_CREDENTIAL');
    });

    it('el plugin local está registrado, o el botón no aparece y nadie se entera', () => {
        const main = leer('android/app/src/main/java/com/bioboros/app/MainActivity.java');
        expect(main).toContain('registerPlugin(MfGoogleId.class);');
        // Y antes de la llamada al padre: el puente se construye ahí y solo publica lo ya declarado. Se
        // ancla la llamada CON sus argumentos, que aparece una sola vez — el nombre a secas también sale
        // en el comentario que lo explica, y anclarlo ahí mediría la prosa en vez del código.
        expect(main.indexOf('registerPlugin(MfGoogleId.class);'))
            .toBeLessThan(main.indexOf('super.onCreate(savedInstanceState);'));
    });

    it('las dependencias de Credential Manager están declaradas', () => {
        const gradle = leer('android/app/build.gradle');
        expect(gradle).toContain('androidx.credentials:credentials:$androidxCredentialsVersion');
        // Sin el puente con los Servicios de Google la hoja no aparece, y falla en EJECUCIÓN, no al compilar.
        expect(gradle).toContain('androidx.credentials:credentials-play-services-auth:$androidxCredentialsVersion');
        expect(gradle).toContain('com.google.android.libraries.identity.googleid:googleid:$googleIdVersion');
        const vars = leer('android/variables.gradle');
        expect(vars).toMatch(/androidxCredentialsVersion = '1\.6\.0'/);
    });

    it('sube el versionCode y NO el umbral de OTA', () => {
        const gradle = leer('android/app/build.gradle');
        const code = Number(/versionCode\s+(\d+)/.exec(gradle)[1]);
        // [P1-PLAN-LOTE-163] el 103 (gesto atrás + icono) sigue por encima: lo que se vigila es que el 160 subió
        expect(code).toBeGreaterThanOrEqual(102);
        // Mismo criterio que el 133 y el 152: la capacidad está gateada por `nativePluginAvailable`, así que
        // un binario sin el plugin degrada bien. Subir el umbral dejaría sin OTA a los ya instalados por una
        // capacidad que no les afecta.
        expect(JSON.parse(leer('ota.config.json')).minNativeBuild).toBe(13);
    });

    it('el mensaje de «sin cuentas» existe en los cuatro catálogos', () => {
        const clave = 'No hay ninguna cuenta de Google en este teléfono. Añade una en los ajustes del sistema, o entra con tu correo.';
        for (const idioma of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(leer(`src/i18n/locales/${idioma}.json`));
            expect(cat[clave], idioma).toBeTruthy();
        }
    });

    it('no hay ningún secreto de Google en el árbol', () => {
        // El cliente Web trae un secreto que este flujo NO usa: solo se verifica un token ya emitido, nunca
        // se canjea un código. Si aparece uno en el árbol, es que alguien lo pegó «por si acaso».
        //
        // El prefijo se compone en tiempo de ejecución a propósito: escrito entero, este fichero se
        // encontraría a sí mismo y el test sería imposible de pasar.
        const marca = 'GOCSPX' + '-';
        const sospechosos = [];
        const recorrer = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                // [P1-PLAN-LOTE-190] 'public' = android/app/src/main/assets/public, la COPIA generada del build web
                // (7,3 MB, ignorada por git, igual que dist): leerla hacía pasar este test de 5 s bajo carga y tumbó
                // dos despliegues. Un secreto ahí vendría de src/, que sí se recorre.
                if (['node_modules', '.git', 'build', 'dist', 'coverage', 'public', '.gradle'].includes(e.name)) continue;
                const p = path.join(dir, e.name);
                if (e.isDirectory()) recorrer(p);
                else if (/\.(js|jsx|json|java|gradle|xml|ts|tsx|mjs)$/.test(e.name)
                         && fs.readFileSync(p, 'utf-8').includes(marca)) sospechosos.push(p);
            }
        };
        recorrer(path.join(raiz, 'src'));
        recorrer(path.join(raiz, 'android'));
        expect(sospechosos).toEqual([]);
    }, 20000);
});
