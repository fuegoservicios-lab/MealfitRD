// [P1-PLAN-LOTE-961 · 2026-10-01] Los sonidos de abrir y cerrar el modo voz son NUESTROS.
//
// El dueño: «el pitido de abrir y cerrar se escucha bajito y mediocre». La app no tenía sonido propio: lo que se oía
// era el del sistema (el reconocedor de voz del teléfono), y en el iPhone, con el micrófono abierto, el audio sale por
// el auricular de llamada — por eso «bajito». Ahora el modo voz tiene su propia señal, sintetizada con Web Audio (sin
// ficheros que descargar ni precachear):
//   · abrir  → dos notas cálidas ASCENDENTES (sol → re, una quinta): «te escucho»;
//   · cerrar → las mismas DESCENDENTES, más cortas y algo más suaves: «listo».
// Cada nota es una sinusoide con un armónico suave y una envolvente de campana (ataque de 6 ms y caída exponencial):
// nada de onda cuadrada ni de clics. Suena por el ALTAVOZ (en iOS se pide la ruta de reproducción antes de sonar) y
// dura menos que la pausa antes de abrir el micrófono (350 ms), así que no se cuela en el dictado.
// Fallo silencioso siempre: sin Web Audio, o con el contexto roto, no suena nada y el modo voz sigue igual.

const NOTA_SOL5 = 783.99;
const NOTA_RE6 = 1174.66;

// [frecuencia, inicio (s), duración (s), volumen pico]
export const MELODIA_ABRIR = [[NOTA_SOL5, 0, 0.2, 0.2], [NOTA_RE6, 0.08, 0.24, 0.17]];
export const MELODIA_CERRAR = [[NOTA_RE6, 0, 0.16, 0.14], [NOTA_SOL5, 0.075, 0.24, 0.13]];

// Lo que tarda en apagarse la última nota, más margen: después la ruta de audio vuelve a la de siempre.
const duracionMs = (melodia) => Math.ceil(Math.max(...melodia.map(([, ini, dur]) => ini + dur)) * 1000) + 60;

let contextoCompartido = null;

function contexto(win) {
    const Ctx = win?.AudioContext || win?.webkitAudioContext;
    if (!Ctx) return null;
    if (!contextoCompartido || contextoCompartido.state === 'closed') {
        try { contextoCompartido = new Ctx(); } catch { contextoCompartido = null; }
    }
    return contextoCompartido;
}

function nota(c, salida, frecuencia, inicio, duracion, pico) {
    const t0 = c.currentTime + inicio;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(pico, t0 + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
    env.connect(salida);
    // Fundamental + octava muy baja: da brillo de campana sin sonar a pitido electrónico.
    for (const [mult, vol] of [[1, 1], [2, 0.12]]) {
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frecuencia * mult, t0);
        if (vol === 1) {
            osc.connect(env);
        } else {
            const g = c.createGain();
            g.gain.setValueAtTime(vol, t0);
            osc.connect(g);
            g.connect(env);
        }
        osc.start(t0);
        osc.stop(t0 + duracion + 0.02);
    }
}

function sonar(melodia, win) {
    try {
        const c = contexto(win);
        if (!c) return false;
        // iOS: con el micrófono reciente el audio va al auricular; la señal del modo voz va por el altavoz.
        try { if (win?.navigator?.audioSession) win.navigator.audioSession.type = 'playback'; } catch { /* sin API */ }
        if (c.state !== 'running') { try { Promise.resolve(c.resume()).catch(() => {}); } catch { /* lo reanuda el próximo toque */ } }
        const filtro = c.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.setValueAtTime(5200, c.currentTime);
        filtro.connect(c.destination);
        for (const [f, ini, dur, pico] of melodia) nota(c, filtro, f, ini, dur, pico);
        return true;
    } catch {
        return false;
    }
}

/** El sonido de ABRIR el modo voz. Llamarlo DENTRO del toque del usuario (iOS solo arranca el audio así). */
export function sonarAperturaVoz(win = typeof window !== 'undefined' ? window : undefined) {
    return sonar(MELODIA_ABRIR, win);
}

/** El sonido de CERRAR el modo voz. Devuelve la ruta de audio de iOS a la de siempre cuando termina de sonar. */
export function sonarCierreVoz(win = typeof window !== 'undefined' ? window : undefined) {
    const ok = sonar(MELODIA_CERRAR, win);
    if (ok) {
        setTimeout(() => {
            try { if (win?.navigator?.audioSession) win.navigator.audioSession.type = 'auto'; } catch { /* sin API */ }
        }, duracionMs(MELODIA_CERRAR));
    }
    return ok;
}

export const DURACION_ABRIR_MS = duracionMs(MELODIA_ABRIR);

/** Solo para los tests: olvidar el contexto compartido. */
export function _reiniciarParaTests() { contextoCompartido = null; }
