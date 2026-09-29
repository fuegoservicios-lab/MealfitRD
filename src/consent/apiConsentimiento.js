// [P1-PLAN-LOTE-844 · 2026-09-29] TODAS las llamadas al backend del permiso para la IA de terceros, en un solo sitio:
// si el contrato de la Task 843 cambia en la revisión, el ajuste es aquí y en ningún otro fichero.
//
// Contrato (backend/docs/consentimiento_ia.md § «Contrato para el frontend»):
//   GET  /api/consents            → { version, vigente, ai_consent_version, ai_consent_at, ai_cn_transfer_at,
//                                     ai_consent_revoked_at, analytics }
//   POST /api/consents            → conceder (las DOS claves de IA a true) y/o anotar la analítica; + plan_reanudado
//   POST /api/consents/withdraw   → retirar; + plan_pausado
//   POST /api/consents/guest      → el del invitado, con su session_id; responde { ok, version, header, ai, analytics }
// Errores con cuerpo PLANO `{ error_code, version, detail }`: 409 ai_consent_version_outdated, 422 ai_consent_*,
// 503 ai_consent_unavailable. Exentos de cuota; limitados a 30/60 s (lectura) y 10/60 s (escritura).
import { fetchWithAuth } from '../config/api';
import { getLocale } from '../i18n';
import { nativePlatform } from '../config/platform';
import { APP_VERSION } from '../config/appVersion';
import { AI_CONSENT_VERSION } from './version';

/** El 428 de un endpoint de IA sin permiso, y el 503 de «no pudimos leer tu permiso» (este NO abre la hoja). */
export const PERMISO_REQUERIDO = 'ai_consent_required';
export const PERMISO_NO_DISPONIBLE = 'ai_consent_unavailable';
export const VERSION_ANTIGUA = 'ai_consent_version_outdated';

/** Un fallo con el `error_code` del backend (o `http_<n>` / `red`), para que la hoja diga lo que pasó. */
export class ErrorDePermisoIA extends Error {
    constructor(codigo, status = 0) {
        super(codigo);
        this.codigo = codigo;
        this.status = status;
    }
}

/** Desde dónde se decidió: idioma, plataforma y paquete web. El backend lo guarda junto a cada decisión. */
export function contextoDelDispositivo() {
    const plataforma = nativePlatform();
    const paquete = typeof __OTA_BUNDLE_ID__ === 'string' && __OTA_BUNDLE_ID__ ? __OTA_BUNDLE_ID__ : '';
    const locale = getLocale();
    return {
        ...(typeof locale === 'string' && locale ? { locale } : {}),
        platform: plataforma === 'ios' || plataforma === 'android' ? plataforma : 'web',
        app_build: (paquete ? `${APP_VERSION}+${paquete}` : APP_VERSION).slice(0, 64),
    };
}

async function _leerCuerpo(res) {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

async function _enviar(ruta, cuerpo) {
    let res;
    try {
        res = await fetchWithAuth(ruta, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo),
        });
    } catch {
        throw new ErrorDePermisoIA('red');
    }
    const datos = await _leerCuerpo(res);
    if (res.ok) return datos || {};
    // Un backend anterior a la Task 843 no tiene la ruta (404 de FastAPI, «Not Found»): no hay nada que anotar ni
    // nada que lo exija. `null` = «el servidor no lleva permiso»; la hoja sigue y el permiso queda en el dispositivo.
    if (res.status === 404 && datos && datos.detail === 'Not Found') return null;
    throw new ErrorDePermisoIA((datos && datos.error_code) || `http_${res.status}`, res.status);
}

function _decision({ analytics, textoSha256 }) {
    return {
        version: AI_CONSENT_VERSION,
        ai_processing: true,
        ai_transfer_cn: true,
        analytics: analytics === true,
        ...(textoSha256 ? { text_sha256: textoSha256 } : {}),
        ...contextoDelDispositivo(),
    };
}

/** El estado de la cuenta (la misma forma que `profile.ai_consent`). Lanza `ErrorDePermisoIA` si no se pudo leer. */
export async function leerPermisoIA() {
    let res;
    try {
        res = await fetchWithAuth('/api/consents');
    } catch {
        throw new ErrorDePermisoIA('red');
    }
    const datos = await _leerCuerpo(res);
    if (!res.ok || !datos) throw new ErrorDePermisoIA((datos && datos.error_code) || `http_${res.status}`, res.status);
    return datos;
}

/** La cuenta concede la IA (las dos casillas) y, aparte, dice sí o no a la analítica. */
export function concederPermisoIA({ analytics = false, textoSha256 = null } = {}) {
    return _enviar('/api/consents', _decision({ analytics, textoSha256 }));
}

/** El invitado concede la IA con su `session_id` (el de `mealfit_guest_session_id`); se guarda su hash. */
export function concederPermisoIAInvitado({ sessionId, analytics = false, textoSha256 = null } = {}) {
    return _enviar('/api/consents/guest', { ..._decision({ analytics, textoSha256 }), session_id: sessionId });
}

/** La cuenta retira el permiso de IA (el backend pausa también el generador). */
export function retirarPermisoIA() {
    return _enviar('/api/consents/withdraw', contextoDelDispositivo());
}

/** Solo la analítica («Ayuda a mejorar»): es el MISMO dato que la casilla opcional de la hoja. */
export function guardarAnaliticaEnServidor(analytics) {
    return _enviar('/api/consents', { version: AI_CONSENT_VERSION, analytics: analytics === true, ...contextoDelDispositivo() });
}
