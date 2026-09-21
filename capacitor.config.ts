import type { CapacitorConfig } from '@capacitor/cli';

// [P1-IOS-NATIVE-SHELL · 2026-08-21] Wrapper nativo de la PWA para la App Store.
// `appId` es el bundle ID: cambiable SOLO hasta la primera subida a App Store Connect.
// El único gate de plataforma del frontend vive en `src/config/platform.js` — aquí no se
// decide nada de producto. Spec: docs/superpowers/specs/2026-08-21-ios-native-shell-design.md
const config: CapacitorConfig = {
  appId: 'com.bioboros.app',
  appName: 'Bioboros',
  webDir: 'dist',
  ios: {
    // [P1-IOS-WEBVIEW-SCROLL · 2026-08-22 · corregido el mismo día] Primer build en
    // el iPhone: «el scroll del login sobrepasa lo normal, como si se saliera de la
    // pantalla». Mi primer arreglo fue apagar `scrollEnabled` creyendo que dejaba el
    // scroll al contenido web: NO — apaga el scroll ENTERO del WebView (build 8: el
    // dashboard quedó clavado; el login pareció arreglado porque cabe en una
    // pantalla). NO volver a ponerlo. Lo que de verdad sobraba era el inset:
    //
    //  - `contentInset: 'never'` (era 'automatic'). 'automatic' suma el alto de la
    //    barra de estado al área desplazable; el login mide `min-height: 100dvh` y
    //    la página acababa midiendo 100dvh + inset — al llegar abajo «sobraba» justo
    //    esa franja. El CSS ya gestiona el notch con `env(safe-area-inset-*)`.
    //  - El rebote (rubber-band) es del UIScrollView nativo y ningún CSS lo frena:
    //    se apaga donde vive, `webView.scrollView.bounces = false` en
    //    ios/App/App/AppDelegate.swift.
    contentInset: 'never',
    // [P1-PLAN-LOTE-125] El binario DECLARA que ya trae los permisos de micrófono y voz del Info.plist
    // (`NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription`). La web no puede leer el plist, y
    // un paquete OTA también corre sobre binarios viejos: sin esta marca `utils/dictado.js` no pinta el micrófono
    // (iOS negaría el permiso sin preguntar). Van JUNTOS: no quites una cosa sin la otra.
    appendUserAgent: 'BioborosNative/mic',
    // La PWA ya pinta su propio color de barra por página (useThemeColor); el WebView
    // nativo no debe superponer un fondo blanco al arrancar.
    backgroundColor: '#0b0b0b',
  },
  // [P1-PLAN-LOTE-152 · 2026-09-21] Android. Hasta hoy el único binario era el de iOS y «probar en Android»
  // significaba abrir la web en Chrome — otra cosa distinta.
  //
  // Lo que NO se replica de iOS, a propósito:
  //   · `appendUserAgent: 'BioborosNative/mic'`. Esa marca dice «este binario trae los permisos de micrófono del
  //     Info.plist», y es una respuesta a un problema de iOS. En el WebView de Android no existe
  //     `SpeechRecognition` (es de Chrome, no del WebView), así que el dictado se esconde solo por su propia
  //     comprobación. Ponerla aquí pintaría un micrófono muerto.
  //   · `contentInset`. Es de UIScrollView; en Android el notch lo resuelve el CSS con `env(safe-area-inset-*)`.
  android: {
    // EXPLÍCITO, no por defecto: de este esquema sale el ORIGEN del WebView (`https://localhost`), y ese
    // origen tiene que estar en la lista CORS del backend. Dejarlo implícito significa que un cambio de
    // versión de Capacitor puede mover el origen y tirar todas las llamadas a la API sin tocar una línea
    // nuestra. iOS usa `capacitor://localhost` y lleva en la lista desde agosto; Android es el que faltaba.
    androidScheme: 'https',
    // Mismo negro que iOS: el WebView no debe destellar en blanco al arrancar.
    backgroundColor: '#0b0b0b',
    // El WebView de Android permite depurar con Chrome DevTools solo si se pide. Con 5 testers y sin poder
    // tocarles el teléfono, poder mirar la consola por USB vale más que esconderla.
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    // [P1-PLAN-LOTE-108] OTA autoalojada (src/native/liveUpdate.js). SIN `appId` ni
    // `autoUpdateStrategy`: eso es Capawesome Cloud y aquí los paquetes salen de nuestro
    // VPS. `readyTimeout` es la red de seguridad: un paquete que no llama a `ready()` en
    // 10 s se descarta y la app vuelve sola al del binario. NO lo pongas a 0.
    LiveUpdate: { readyTimeout: 10000, autoDeleteBundles: true },
  },
};

export default config;
