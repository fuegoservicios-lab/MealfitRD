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
    contentInset: 'automatic',
    // La PWA ya pinta su propio color de barra por página (useThemeColor); el WebView
    // nativo no debe superponer un fondo blanco al arrancar.
    backgroundColor: '#0b0b0b',
  },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
