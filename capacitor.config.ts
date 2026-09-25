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
    // [P1-PLAN-LOTE-280 · 2026-09-25] Icono de la barra de estado de los avisos locales (comidas, agua, plan listo):
    // la silueta blanca del brote (res/drawable/ic_stat_bioboros.xml). Sin esto Android pintaba el icono de la app,
    // que es a color con fondo, como un cuadrado blanco. Config del binario: llega con el APK, no por OTA.
    LocalNotifications: { smallIcon: 'ic_stat_bioboros', iconColor: '#4F46E5' },
    // [P1-PLAN-LOTE-108] OTA autoalojada (src/native/liveUpdate.js). SIN `appId` ni
    // `autoUpdateStrategy`: eso es Capawesome Cloud y aquí los paquetes salen de nuestro
    // VPS. `readyTimeout` es la red de seguridad: un paquete que no llama a `ready()` en
    // ese plazo se descarta y la app vuelve sola al del binario. NO lo pongas a 0.
    // [P1-PLAN-LOTE-166 · 2026-09-22] 10 s → 15 s: el reloj corre desde que se crea el plugin, antes de evaluar el JS, y
    // en un Android de gama baja el margen no alcanzaba (y la vuelta atrás veta ESE paquete para siempre). Solo cambia
    // con un binario nuevo (APK 103 / siguiente build de iOS); el JS ya confirma antes (liveUpdate.js).
    LiveUpdate: { readyTimeout: 15000, autoDeleteBundles: true },
    // [P1-PLAN-LOTE-170 · 2026-09-23] Android: «el teclado le sigue tapando todo; en iPhone se ve bien», con el paquete
    // OTA del teclado ya instalado (nginx: los dos Android lo bajaron y reabrieron la app). Capacitor 8 trae SystemBars,
    // que en modo 'css' (el de por defecto) pone un escuchador de márgenes en la DecorView que SUSTITUYE el manejo de
    // Android: reconstruye los márgenes sin el teclado (el `adjustResize` del manifiesto deja de actuar) y encoge la
    // pantalla con un padding propio, solo si `isVisible(ime())`. Además deja pasar el margen del teclado a la WebView,
    // que con `viewport-fit=cover` + `interactive-widget=resizes-content` y WebView ≥ 140 puede encogerse OTRA vez
    // (incidencias #8601 y #8611 de Capacitor). La web ya no tiene cómo corregirlo: si la WebView no encoge, el
    // `visualViewport` tampoco se entera y nuestra red de seguridad (lote 166) no ve teclado.
    // 'disable' quita ese escuchador y devuelve el `adjustResize` de siempre: nuestra ventana NO es de borde a borde
    // (targetSdk 34, ver variables.gradle), así que Android ya reserva las barras del sistema y encoge la WebView UNA vez
    // con el teclado. Nada en la web lee las `--safe-area-inset-*` que inyectaba el modo 'css'. Solo Android (iOS lo
    // ignora) y solo con un binario nuevo: APK 104. Si en un futuro subes targetSdk a 35, esto hay que revisarlo:
    // ahí Android impone el borde a borde y alguien tiene que volver a manejar los márgenes.
    SystemBars: { insetsHandling: 'disable' },
  },
};

export default config;
