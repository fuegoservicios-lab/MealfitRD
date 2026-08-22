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
    // [P1-IOS-WEBVIEW-SCROLL · 2026-08-22] Primer build en el iPhone: «el scroll del
    // login sobrepasa lo normal, como si se saliera de la pantalla». Dos causas:
    //
    //  - `scrollEnabled: false`. El WebView vive dentro de un UIScrollView NATIVO que
    //    rebota (rubber-band); `overscroll-behavior-y: none` en `body` no lo frena
    //    porque eso es CSS del documento y el que rebota es el contenedor nativo.
    //    Con esto el scroll lo hace el contenido web, que sí obedece al CSS.
    //  - `contentInset: 'never'` (era 'automatic'). 'automatic' suma el alto de la
    //    barra de estado al área desplazable; el login mide `min-height: 100dvh` y la
    //    página acababa midiendo 100dvh + inset — al llegar abajo «sobraba» justo esa
    //    franja. El CSS ya gestiona el notch con `env(safe-area-inset-*)`.
    scrollEnabled: false,
    contentInset: 'never',
    // La PWA ya pinta su propio color de barra por página (useThemeColor); el WebView
    // nativo no debe superponer un fondo blanco al arrancar.
    backgroundColor: '#0b0b0b',
  },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
