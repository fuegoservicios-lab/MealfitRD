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
import { nativePlatform, nativePluginAvailable, registrarPluginNativo } from '../config/platform';

// [P1-PLAN-LOTE-962 · 2026-10-01] Sin el pitido del reconocedor de Android. El dueño: «quita también el pitido de
// Android». El plugin de voz solo silencia el de ARRANQUE (devuelve el volumen en cuanto el reconocedor está listo),
// así que el de cierre sonaba siempre. Con el APK que trae `MfSilencioVoz` (plugin local, MainActivity) los canales
// de notificación y de sistema se silencian ANTES de cada escucha y se devuelven `SILENCIO_TRAS_FIN_MS` después de
// terminar (el pitido de cierre suena justo al parar). Entre turnos seguidos no se restaura: la siguiente escucha
// cancela la restauración pendiente. En un APK viejo, sin el plugin, se queda como estaba (`muteRecognizerBeep`).
// El plugin nativo restaura también al pasar a segundo plano, con un tope de 2 min y tras una muerte de la app.
export const SILENCIO_TRAS_FIN_MS = 900;
let pluginSilencio = null;
// Perezoso y SÍNCRONO (lo que vuelve es un Proxy: jamás desde una función async — lección del 133). Perezoso para que
// importar este módulo en la web o en los tests no registre nada.
const silencioVoz = () => {
    if (!pluginSilencio) pluginSilencio = registrarPluginNativo('MfSilencioVoz');
    return pluginSilencio;
};
let restauracionPendiente = null;

export function silencioDelSistemaDisponible() {
    return nativePlatform() === 'android' && nativePluginAvailable('MfSilencioVoz');
}

function silenciarSistema(plugin) {
    if (restauracionPendiente) { clearTimeout(restauracionPendiente); restauracionPendiente = null; }
    try { Promise.resolve(plugin.silenciar()).catch(() => {}); } catch { /* sin plugin: suena el del sistema */ }
}

function restaurarSistemaLuego(plugin, ms = SILENCIO_TRAS_FIN_MS) {
    if (restauracionPendiente) clearTimeout(restauracionPendiente);
    restauracionPendiente = setTimeout(() => {
        restauracionPendiente = null;
        try { Promise.resolve(plugin.restaurar()).catch(() => {}); } catch { /* el nativo restaura solo */ }
    }, ms);
}

export function vozNativaDisponible() {
    return reconocimientoNativoDisponible() && sintesisNativaDisponible();
}

// [P1-PLAN-LOTE-902 · 2026-09-29] Cada motor por separado, y cuando está, MANDA sobre el del WebView. El dueño: «en
// android están teniendo problemas con el modo de voz y con el modo de micrófono normal». Los registros del servidor:
// los Android con la app abrieron el chat una y otra vez y NINGUNO llegó a mandar un mensaje. `motorDeDictado` elegía
// primero `webkitSpeechRecognition`, y el WebView de Android EXPONE ese objeto sin un servicio de voz detrás: el
// micrófono «arrancaba» y no oía nada. El 683 lo probó con `win = {}` («el WebView no trae SpeechRecognition»), que
// nadie comprobó en un teléfono. Con el plugin en el binario, el reconocedor es el de Android, siempre.
export function reconocimientoNativoDisponible() {
    return nativePlatform() === 'android' && nativePluginAvailable('SpeechRecognition');
}

export function sintesisNativaDisponible() {
    return nativePlatform() === 'android' && nativePluginAvailable('SpeechSynthesis');
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

// Capacitor devuelve Proxy con un método `then`: resolver una promesa con el plugin la deja colgada.
// Se espera el módulo (un objeto normal) y se extrae el plugin fuera de la cadena de promesas.
const cargarReconocedor = () => import('@capgo/capacitor-speech-recognition');

/** Un resultado con la forma que lee `leerResultados` (utils/dictado.js). */
const resultados = (texto, final) => {
    const r = [Object.assign([{ transcript: texto }], { isFinal: final })];
    return { results: r };
};

/** El reconocedor nativo con la forma de `SpeechRecognition`: `new ReconocimientoNativo()`, lang, onresult, start… */
export class ReconocimientoNativo {
    constructor({ cargar = cargarReconocedor, silencio = null } = {}) {
        // [P1-PLAN-LOTE-962] `silencio`: el plugin `MfSilencioVoz` (los tests pasan uno falso); null = el del binario si lo trae.
        this._silencio = silencio || (silencioDelSistemaDisponible() ? silencioVoz() : null);
        this.lang = 'es-US';
        this.interimResults = true;
        this.continuous = false;           // Android corta solo al callar; los hooks ya saben reabrir
        this.maxAlternatives = 1;
        this.onstart = null;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        this.onesperandopermiso = null;    // [P1-PLAN-LOTE-909] (true/false): el vigía del arranque no cuenta ese rato
        // [P1-PLAN-LOTE-951] En qué paso va: si el micrófono no arranca, el diagnóstico dice DÓNDE se quedó
        // (cargando el plugin, el permiso, los oyentes, el `start()` pendiente, o arrancando sin llegar a oír).
        this.fase = 'nuevo';
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
        this.fase = 'terminado';
        this._soltar();
        if (this._silenciado) restaurarSistemaLuego(this._silencio);   // [P1-PLAN-LOTE-962] tras el pitido de cierre
        this.onend?.();
    }

    start() {
        // La Web Speech API arranca sin promesa: aquí todo fallo se convierte en onerror + onend, nunca en un rechazo.
        this._arrancar().catch((err) => {
            if (this._terminado) return;
            // [P1-PLAN-LOTE-909] `crudo`: lo que dijo el plugin, para el diagnóstico (el hook solo entiende `error`).
            this.onerror?.({ error: 'start', crudo: `start:${String(err?.code || err?.message || err || '').slice(0, 60)}` });
            this._terminar();
        });
    }

    async _arrancar() {
        this.fase = 'cargando';
        const { SpeechRecognition: plugin } = await this._cargar();
        this._plugin = plugin;
        this.fase = 'permiso';
        let permiso = await plugin.checkPermissions();
        if (permiso?.speechRecognition !== 'granted') {
            this.onesperandopermiso?.(true);
            try { permiso = await plugin.requestPermissions(); } finally { this.onesperandopermiso?.(false); }
        }
        if (this._terminado) return;       // lo abortaron mientras se pedía el permiso
        if (permiso?.speechRecognition !== 'granted') {
            this.onerror?.({ error: 'not-allowed', crudo: `permiso:${permiso?.speechRecognition || '?'}` });
            this._terminar();
            return;
        }
        this.fase = 'oyentes';
        this._subs.push(await plugin.addListener('partialResults', (e) => {
            const t = (e?.matches && e.matches[0]) || e?.accumulatedText || '';
            if (!t) return;
            this._texto = t;
            this.onresult?.(resultados(t, false));
        }));
        this._subs.push(await plugin.addListener('listeningState', async (e) => {
            const estado = e?.state || e?.status;
            if (estado === 'startingListening') this.fase = 'arrancando';
            if (estado === 'started' && !this._empezado) {
                this._empezado = true;
                this.fase = 'oyendo';
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
            this.onerror?.({ error: errorWebDesdeAndroid(e?.code), crudo: String(e?.code || e?.message || '') });
        }));
        // Abortado mientras se enganchaban los oyentes: soltarlos y NO abrir el micrófono.
        if (this._terminado) { this._soltar(); return; }
        this._arrancado = true;
        this.fase = 'start';
        // [P1-PLAN-LOTE-962] Con nuestro silencio, el plugin de voz NO toca volúmenes: los dos a la vez se pisarían
        // (él guarda el volumen ya silenciado y lo «restaura» a 0). Sin `await`: los plugins comparten un hilo (951).
        if (this._silencio) { this._silenciado = true; silenciarSistema(this._silencio); }
        await plugin.start({
            language: this.lang,
            partialResults: true,
            popup: false,
            maxResults: 1,
            muteRecognizerBeep: !this._silencio,
        });
        // El plugin resuelve `start()` justo después de emitir «started»: si resolvió y no llegó, el evento se perdió.
        if (!this._empezado && !this._terminado) this.fase = 'start_resuelto_sin_started';
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

const cargarSintesis = () => import('@capgo/capacitor-speech-synthesis');

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

    // El TextToSpeech de Android arranca asíncrono: pedidas demasiado pronto, las voces llegan VACÍAS (no es un
    // error). Entonces no se da por buena la lista y se vuelve a pedir en el siguiente `getVoices()`.
    let pidiendoVoces = null;
    const pedirVoces = (p) => {
        if (pidiendoVoces) return pidiendoVoces;
        pidiendoVoces = Promise.resolve()
            .then(() => p.getVoices())
            .then((r) => {
                const lista = (r?.voices || [])
                    // Las locales primero: `elegirVoz` desempata por orden, y una voz de red tarda en cada frase.
                    .slice()
                    .sort((a, b) => Number(Boolean(a?.isNetworkConnectionRequired)) - Number(Boolean(b?.isNetworkConnectionRequired)))
                    .map((v) => ({
                        name: v.name,
                        lang: v.language,
                        id: v.id,
                        default: Boolean(v.default),
                        localService: !v.isNetworkConnectionRequired,
                    }));
                if (!lista.length) return;
                voces = lista;
                for (const f of oyentesDeVoces) { try { f(); } catch { /* un oyente roto no para a los demás */ } }
            })
            .catch(() => { /* sin lista: se habla con el idioma pedido */ })
            .finally(() => { pidiendoVoces = null; });
        return pidiendoVoces;
    };

    // [P1-PLAN-LOTE-951 · 2026-09-30] La lista de voces se pide DESPUÉS de la primera locución, nunca al crear la voz.
    // Capacitor corre los métodos nativos de TODOS los plugins en un único hilo, y `getVoices()` del plugin de TTS es
    // una llamada síncrona al motor de voz del teléfono (sin comprobar siquiera que haya arrancado). El modo voz creaba
    // esta voz y, 350 ms después, abría el micrófono: en un Xiaomi (Android 16) el `start()` del reconocedor se quedó
    // detrás de esa llamada y nunca llegó a «started» (diagnóstico `sin_arranque` del 909, sin ningún error). La voz
    // del coach en Android suele ser la de la nube; la del teléfono es respaldo y puede hablar sin lista (por idioma).
    let hablado = false;
    let enVuelo = 0;
    const listo = cargar().then(async ({ SpeechSynthesis: p }) => {
        plugin = p;
        for (const tipo of ['start', 'end', 'boundary', 'error']) {
            await p.addListener(tipo, (e) => despachar(tipo, e));
        }
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
            hablado = true;
            enVuelo += 1;
            listo
                .then(() => plugin.speak({
                    text: loc.text,
                    language: loc.lang || undefined,
                    voiceId: loc.voice?.id || undefined,
                    rate: loc.rate,
                    pitch: loc.pitch,
                    volume: loc.volume,
                    queueStrategy: 'Add',
                }))
                .then((r) => {
                    enVuelo -= 1;
                    const id = r?.utteranceId;
                    porId.set(id, loc);
                    const antes = adelantados.get(id) || [];
                    adelantados.delete(id);
                    for (const [tipo, e] of antes) despachar(tipo, e);
                    if (!voces.length && plugin) pedirVoces(plugin);    // ya suena: ahora sí, la lista para la siguiente
                })
                .catch((err) => { enVuelo -= 1; loc.onerror?.({ error: String(err?.message || err) }); });
        },
        cancel() {
            const habia = porId.size > 0 || enVuelo > 0;
            porId.clear();
            adelantados.clear();
            // Sin nada sonando ni en camino no se molesta al motor: `cancel()` es otra llamada síncrona en el hilo que
            // comparte con el micrófono, y `escuchar()` cancela SIEMPRE antes de abrirlo.
            if (!habia) return;
            try { Promise.resolve(plugin?.cancel?.()).catch(() => {}); } catch { /* nada que cortar */ }
        },
        getVoices() {
            if (!voces.length && plugin && hablado) pedirVoces(plugin);    // llegaron vacías: el motor aún arrancaba
            return voces;
        },
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
