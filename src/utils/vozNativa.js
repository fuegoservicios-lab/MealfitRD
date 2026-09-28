// [P1-PLAN-LOTE-683 · 2026-09-28] Voz en la app de Android: los plugins nativos con la forma de la Web Speech API.
//
// El dueño: «implementa lo del plugin para android y hacemos otra apk». El WebView de Android no trae
// `SpeechRecognition` ni `speechSynthesis`, así que el dictado y el modo voz (lote 682) no aparecían en su app.
// Dos plugins de Capacitor 8 lo resuelven con los motores del propio teléfono (cero coste de API):
//   · @capgo/capacitor-speech-recognition → el reconocedor de Android (SpeechRecognizer);
//   · @capgo/capacitor-speech-synthesis   → el TextToSpeech del sistema.
//
// Aquí se ADAPTAN a la forma del navegador (`new Motor()` con lang/onresult/onend…, y un `speechSynthesis` con
// `speak(locución)`), para que `useDictado`, `useConversacionPorVoz` y `crearVozDelCoach` no sepan que están en
// Android. Solo en Android: en iOS el WKWebView ya trae las dos APIs y no se toca nada.
//
// SE DECIDE POR EL BINARIO, no por la plataforma: un paquete OTA nuevo corre también en APKs viejos sin los
// plugins; `isPluginAvailable` dice la verdad de ESE binario y en uno viejo, sencillamente, no hay botón.
import { nativePlatform, nativePluginAvailable } from '../config/platform';

export function vozNativaDisponible() {
    return nativePlatform() === 'android'
        && nativePluginAvailable('SpeechRecognition')
        && nativePluginAvailable('SpeechSynthesis');
}

// Los códigos del reconocedor de Android → los de la Web Speech API, que es lo que entienden los hooks.
export function errorWebDesdeAndroid(code) {
    const c = String(code || '');
    if (c === 'NO_MATCH' || c === 'SPEECH_TIMEOUT') return 'no-speech';
    if (c === 'INSUFFICIENT_PERMISSIONS') return 'not-allowed';
    if (c === 'NETWORK' || c === 'NETWORK_TIMEOUT' || c === 'SERVER' || c === 'SERVER_DISCONNECTED') return 'network';
    if (c === 'AUDIO') return 'audio-capture';
    if (c === 'CLIENT' || c === 'RECOGNIZER_BUSY') return 'aborted';
    // ERROR_LANGUAGE_NOT_SUPPORTED (12) y ERROR_LANGUAGE_UNAVAILABLE (13) llegan como UNKNOWN_n.
    if (c === 'UNKNOWN_12' || c === 'UNKNOWN_13') return 'language-not-supported';
    return 'start';
}

const cargarReconocedor = () => import('@capgo/capacitor-speech-recognition').then((m) => m.SpeechRecognition);

/** Un resultado con la forma que lee `leerResultados` (utils/dictado.js). */
const resultados = (texto, final) => {
    const r = [Object.assign([{ transcript: texto }], { isFinal: final })];
    return { results: r };
};

/** El reconocedor nativo con la forma de `SpeechRecognition`: `new ReconocimientoNativo()`, lang, onresult, start… */
export class ReconocimientoNativo {
    constructor({ cargar = cargarReconocedor } = {}) {
        this.lang = 'es-US';
        this.interimResults = true;
        this.continuous = false;           // Android corta solo al callar; los hooks ya saben reabrir
        this.maxAlternatives = 1;
        this.onstart = null;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        this._cargar = cargar;
        this._subs = [];
        this._texto = '';
        this._empezado = false;
        this._arrancado = false;
        this._terminado = false;
        this._plugin = null;
    }

    // Los oyentes del plugin son GLOBALES: uno que se queda colgado oye las sesiones siguientes.
    // Se vacía el MISMO array (splice), nunca `this._subs = []`: `this._subs.push(await …)` resuelve `this._subs`
    // ANTES del await, y el enganche que llegase tarde caería en un array huérfano que nadie suelta.
    _soltar() {
        for (const s of this._subs.splice(0)) {
            try { Promise.resolve(s?.remove?.()).catch(() => {}); } catch { /* ya estaba suelto */ }
        }
    }

    _terminar() {
        if (this._terminado) return;
        this._terminado = true;
        this._soltar();
        this.onend?.();
    }

    start() {
        // La Web Speech API arranca sin promesa: aquí todo fallo se convierte en onerror + onend, nunca en un rechazo.
        this._arrancar().catch(() => {
            if (this._terminado) return;
            this.onerror?.({ error: 'start' });
            this._terminar();
        });
    }

    async _arrancar() {
        const plugin = await this._cargar();
        this._plugin = plugin;
        let permiso = await plugin.checkPermissions();
        if (permiso?.speechRecognition !== 'granted') permiso = await plugin.requestPermissions();
        if (this._terminado) return;       // lo abortaron mientras se pedía el permiso
        if (permiso?.speechRecognition !== 'granted') {
            this.onerror?.({ error: 'not-allowed' });
            this._terminar();
            return;
        }
        this._subs.push(await plugin.addListener('partialResults', (e) => {
            const t = (e?.matches && e.matches[0]) || e?.accumulatedText || '';
            if (!t) return;
            this._texto = t;
            this.onresult?.(resultados(t, false));
        }));
        this._subs.push(await plugin.addListener('listeningState', async (e) => {
            const estado = e?.state || e?.status;
            if (estado === 'started' && !this._empezado) {
                this._empezado = true;
                this.onstart?.();
            } else if (estado === 'stopped') {
                // El último resultado puede no haber llegado como parcial: se pide antes de cerrar.
                try {
                    const ultimo = await plugin.getLastPartialResult();
                    if (ultimo?.available && ultimo.text && ultimo.text !== this._texto) {
                        this._texto = ultimo.text;
                        this.onresult?.(resultados(ultimo.text, true));
                    }
                } catch { /* sin último resultado: vale lo que ya llegó */ }
                this._terminar();
            }
        }));
        this._subs.push(await plugin.addListener('error', (e) => {
            this.onerror?.({ error: errorWebDesdeAndroid(e?.code) });
        }));
        // Abortado mientras se enganchaban los oyentes: soltarlos y NO abrir el micrófono.
        if (this._terminado) { this._soltar(); return; }
        this._arrancado = true;
        await plugin.start({
            language: this.lang,
            partialResults: true,
            popup: false,
            maxResults: 1,
            muteRecognizerBeep: true,
        });
    }

    stop() {
        // Aún no oía (el plugin cargaba o pedía permiso): parar es no empezar, con su onend, como en el navegador.
        if (!this._arrancado) { this.abort(); return; }
        try { Promise.resolve(this._plugin?.stop?.()).catch(() => {}); } catch { /* ya paraba */ }
    }

    abort() {
        if (this._arrancado) {
            try { Promise.resolve(this._plugin?.forceStop?.()).catch(() => {}); } catch { /* ya paraba */ }
        }
        this._terminar();
    }
}

const cargarSintesis = () => import('@capgo/capacitor-speech-synthesis').then((m) => m.SpeechSynthesis);

/**
 * La voz nativa con la forma de `speechSynthesis` + `SpeechSynthesisUtterance`, para `crearVozDelCoach`.
 * `speak()` del plugin devuelve un id y el inicio, el fin y cada palabra llegan como eventos con ese id: aquí se
 * enlazan con la locución que los espera (y se guardan si llegan antes que el id, por si el puente los adelanta).
 */
export function crearSintesisNativa({ cargar = cargarSintesis } = {}) {
    const porId = new Map();
    const adelantados = new Map();
    const oyentesDeVoces = new Set();
    let voces = [];
    let plugin = null;

    const despachar = (tipo, e) => {
        const id = e?.utteranceId;
        const loc = porId.get(id);
        if (!loc) {
            if (!adelantados.has(id)) adelantados.set(id, []);
            adelantados.get(id).push([tipo, e]);
            return;
        }
        if (tipo === 'start') loc.onstart?.();
        else if (tipo === 'boundary') loc.onboundary?.({ name: 'word' });
        else if (tipo === 'end') { porId.delete(id); loc.onend?.(); }
        else if (tipo === 'error') { porId.delete(id); loc.onerror?.({ error: e?.error }); }
    };

    const listo = cargar().then(async (p) => {
        plugin = p;
        for (const tipo of ['start', 'end', 'boundary', 'error']) {
            await p.addListener(tipo, (e) => despachar(tipo, e));
        }
        try {
            const r = await p.getVoices();
            voces = (r?.voices || []).map((v) => ({ name: v.name, lang: v.language, id: v.id, default: Boolean(v.default) }));
            for (const f of oyentesDeVoces) { try { f(); } catch { /* un oyente roto no para a los demás */ } }
        } catch { /* sin lista: se habla con el idioma pedido */ }
        return p;
    });

    class LocucionNativa {
        constructor(text) {
            this.text = String(text || '');
            this.lang = '';
            this.voice = null;
            this.rate = 1;
            this.pitch = 1;
            this.volume = 1;
            this.onstart = null;
            this.onend = null;
            this.onerror = null;
            this.onboundary = null;
        }
    }

    const synth = {
        speak(loc) {
            if (!loc?.text?.trim() || loc.volume === 0) return;    // la locución muda de desbloqueo es cosa de iOS
            listo
                .then((p) => p.speak({
                    text: loc.text,
                    language: loc.lang || undefined,
                    voiceId: loc.voice?.id || undefined,
                    rate: loc.rate,
                    pitch: loc.pitch,
                    volume: loc.volume,
                    queueStrategy: 'Add',
                }))
                .then((r) => {
                    const id = r?.utteranceId;
                    porId.set(id, loc);
                    const antes = adelantados.get(id) || [];
                    adelantados.delete(id);
                    for (const [tipo, e] of antes) despachar(tipo, e);
                })
                .catch((err) => loc.onerror?.({ error: String(err?.message || err) }));
        },
        cancel() {
            porId.clear();
            adelantados.clear();
            try { Promise.resolve(plugin?.cancel?.()).catch(() => {}); } catch { /* nada que cortar */ }
        },
        getVoices: () => voces,
        addEventListener(tipo, f) { if (tipo === 'voiceschanged') oyentesDeVoces.add(f); },
        removeEventListener(tipo, f) { if (tipo === 'voiceschanged') oyentesDeVoces.delete(f); },
    };

    return { speechSynthesis: synth, SpeechSynthesisUtterance: LocucionNativa };
}

let _sintesisNativa = null;
/** Una sola por app: el plugin tiene un motor y sus oyentes son globales. */
export function sintesisNativa() {
    if (!_sintesisNativa) _sintesisNativa = crearSintesisNativa();
    return _sintesisNativa;
}
