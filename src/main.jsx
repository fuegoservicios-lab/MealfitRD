import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from "@sentry/react";
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// Register Service Worker
registerSW({ immediate: true })

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: 1.0, 
  replaysSessionSampleRate: 0.1, 
  replaysOnErrorSampleRate: 1.0, 
});

createRoot(document.getElementById('root')).render(
  // <StrictMode>
    <App />
  // </StrictMode>,
)

// Remove the PWA splash screen smoothly once React has hydrated
const splash = document.getElementById('pwa-splash');
if (splash) {
  setTimeout(() => {
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.remove();
    }, 500); // Wait for CSS transition to finish
  }, 100); // Brief delay to ensure React has fully painted
}