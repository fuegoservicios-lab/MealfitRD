// [P1-PLAN-LOTE-909 · 2026-09-30] Diagnóstico anónimo del dictado y el modo voz.
//
// El dueño: «en android todavía tienen problemas». El servidor no veía nada: el dictado ocurre en el teléfono y, si no
// oye, no manda nada. Esto avisa a `POST /api/chat/diagnostico-voz`:
//   · cada fallo del reconocedor (con el código ORIGINAL de Android en `crudo`, que el adaptador traducía y perdía);
//   · una vez por arranque de la app nativa, el ESTADO de la voz en ese binario (¿trae los plugins? ¿qué motor
//     elige? ¿se ofrece el micrófono?): cubre el caso en que el botón ni aparece, que no produce ningún fallo.
// Nunca audio ni texto dicho: solo códigos. Con tope: el mismo aviso una vez por minuto y 20 por arranque.
import { fetchWithAuth } from '../config/api';
import { nativePlatform, nativePluginAvailable } from '../config/platform';

export const DIAGNOSTICO_MAX_POR_ARRANQUE = 20;
const MISMO_AVISO_MS = 60000;

let enviados = 0;
let estadoEnviado = false;
const ultimaVez = new Map();

/** Solo para los tests. */
export function _reiniciarDiagnosticoVoz() {
    enviados = 0;
    estadoEnviado = false;
    ultimaVez.clear();
}

/** Qué reconocedor usaría la app aquí: el plugin de Android, el del navegador, o ninguno. */
export function motorActual(win = typeof window !== 'undefined' ? window : undefined) {
    if (nativePlatform() === 'android' && nativePluginAvailable('SpeechRecognition')) return 'plugin_android';
    if (win?.SpeechRecognition) return 'web';
    if (win?.webkitSpeechRecognition) return 'webkit';
    return 'ninguno';
}

function enviar(cuerpo) {
    if (enviados >= DIAGNOSTICO_MAX_POR_ARRANQUE) return;
    enviados += 1;
    try {
        Promise.resolve(fetchWithAuth('/api/chat/diagnostico-voz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plataforma: nativePlatform(), motor: motorActual(), ...cuerpo }),
        })).catch(() => { /* sin red: el diagnóstico no molesta */ });
    } catch { /* nunca rompe a quien avisa */ }
}

/** Un fallo del dictado o del modo voz. `donde`: 'dictado' | 'modo_voz' | 'sintesis'. */
export function avisarFalloDeVoz({ donde, codigo, crudo, idioma } = {}) {
    const clave = `${donde}:${codigo}:${crudo || ''}`;
    const ahora = Date.now();
    if (ahora - (ultimaVez.get(clave) || 0) < MISMO_AVISO_MS) return;
    ultimaVez.set(clave, ahora);
    enviar({ donde, codigo: codigo || null, crudo: crudo ? String(crudo).slice(0, 80) : null, idioma: idioma || null });
}

/** Una vez por arranque, solo en la app nativa: en qué estado está la voz en ESTE binario. */
export function avisarEstadoDeVozUnaVez({ dictadoDisponible } = {}) {
    if (estadoEnviado || nativePlatform() === 'web') return;
    estadoEnviado = true;
    enviar({
        donde: 'estado',
        plugin_reconocimiento: nativePluginAvailable('SpeechRecognition'),
        plugin_sintesis: nativePluginAvailable('SpeechSynthesis'),
        dictado_disponible: typeof dictadoDisponible === 'boolean' ? dictadoDisponible : null,
    });
}
