// [P1-LOGIN-OTP-RESUME · 2026-08-10] El paso del código sobrevive a que el usuario
// salga de la app.
//
// EL FALLO QUE CIERRA: todo el flujo vivía en `useState`. Pero este flujo EXIGE salir
// de la app a leer el correo, y el manifiesto declara `display: standalone` — modo en
// el que iOS termina el proceso al pasar a segundo plano y lo relanza limpio. El
// usuario volvía al paso 1 con el código ya gastado en la mano. Es, además,
// exactamente lo que hará un revisor de tienda.
//
// localStorage y NO sessionStorage: esta última muere con el webview, que es justo el
// evento del que hay que sobrevivir.
//
// [P1-PLAN-LOTE-680] Vivía dentro de `Login.jsx`. Sale a su módulo porque la hoja
// «Guarda tu plan» del invitado (`HojaGuardarPlanHost`) también tiene que saber si hay
// un código en vuelo —para reabrirse en el paso del código cuando iOS relanza la app—
// y el host se carga con la app entera: importar `Login.jsx` para leer una clave
// metería la pantalla de login en la carga inicial.
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './safeLocalStorage';

export const OTP_PENDING_KEY = 'mf_otp_pending';
const OTP_PENDING_TTL_MS = 15 * 60 * 1000; // ventana generosa sobre la validez del código

export const loadPendingOtp = () => {
    try {
        const raw = safeLocalStorageGet(OTP_PENDING_KEY, null);
        if (!raw) return null;
        const p = JSON.parse(raw);
        if (!p?.email || !p?.sentAt) return null;
        if (Date.now() - p.sentAt > OTP_PENDING_TTL_MS) {
            safeLocalStorageRemove(OTP_PENDING_KEY);
            return null;
        }
        return p;
    } catch { return null; }
};

export const savePendingOtp = (email) => {
    safeLocalStorageSet(OTP_PENDING_KEY, JSON.stringify({ email, sentAt: Date.now() }));
};

export const clearPendingOtp = () => {
    safeLocalStorageRemove(OTP_PENDING_KEY);
};
