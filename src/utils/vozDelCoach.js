// [P1-PLAN-LOTE-682 · 2026-09-28] La voz del coach: el propio dispositivo lee en voz alta lo que el coach responde.
//
// El dueño: «necesito un efecto wow y útil para el usuario que no tenga ganas de escribir… no tengo mucho
// presupuesto». La investigación del 28-sep descartó por ahora una voz en tiempo real de pago (Gemini Live: la sesión
// vuelve a cobrar todo el contexto en cada turno; saldo de Gemini: US$2,52 y la tarjeta rechazada). Esto cuesta CERO:
//
//   · OÍR: el mismo reconocimiento de voz del dictado (`utils/dictado.js`).
//   · PENSAR: el coach de siempre, con su cuota y todas sus defensas (el turno es un mensaje normal del chat).
//   · HABLAR: `speechSynthesis`, la voz del sistema. Frase a frase MIENTRAS llega la respuesta, no al final.
//
// Aquí vive lo que se prueba sin altavoz: qué texto se dice (sin formato, sin emojis, con las unidades dichas
// enteras), cómo se trocea, qué voz se elige y la cola que las encadena. El bucle de la conversación (escuchar →
// enviar → hablar → escuchar) está en `hooks/useConversacionPorVoz.js`.

import { sintesisNativa, vozNativaDisponible } from './vozNativa';

export function sintesisDisponible(win = typeof window !== 'undefined' ? window : undefined) {
    // [P1-PLAN-LOTE-683] En la app de Android habla el TextToSpeech del sistema (plugin) con la misma forma.
    return Boolean(win?.speechSynthesis && typeof win.SpeechSynthesisUtterance === 'function') || vozNativaDisponible();
}

// «~650 kcal» se lee «aproximadamente 650 calorías»: una abreviatura leída letra a letra rompe el efecto entero.
const UNIDADES = {
    es: { kcal: 'calorías', g: 'gramos', mg: 'miligramos', ml: 'mililitros', min: 'minutos', aprox: 'aproximadamente' },
    en: { kcal: 'calories', g: 'grams', mg: 'milligrams', ml: 'milliliters', min: 'minutes', aprox: 'about' },
    pt: { kcal: 'calorias', g: 'gramas', mg: 'miligramas', ml: 'mililitros', min: 'minutos', aprox: 'aproximadamente' },
    fr: { kcal: 'calories', g: 'grammes', mg: 'milligrammes', ml: 'millilitres', min: 'minutes', aprox: 'environ' },
    it: { kcal: 'calorie', g: 'grammi', mg: 'milligrammi', ml: 'millilitri', min: 'minuti', aprox: 'circa' },
};

const unidadesDe = (locale) => UNIDADES[String(locale || '').slice(0, 2).toLowerCase()] || UNIDADES.es;

/** Lo que el coach escribió → lo que se dice: sin marcas de formato, etiquetas de la UI, enlaces ni emojis. */
export function textoParaHablar(texto, locale = 'es-DO') {
    const u = unidadesDe(locale);
    let s = String(texto || '');
    s = s.replace(/\[UI_ACT[^\]]*\]?/g, ' ');               // etiquetas de acción de la UI, completas o a medias
    s = s.replace(/```[\s\S]*?```/g, ' ');                  // bloques de código
    s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');          // [texto](enlace) → texto
    s = s.replace(/https?:\/\/\S+/g, ' ');
    s = s.replace(/^\s{0,3}(?:[-*•]|\d+[.)])\s+/gm, '');     // viñetas y listas numeradas
    s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');               // encabezados
    s = s.replace(/[*_`>#|]+/g, ' ');                       // marcas sueltas
    s = s.replace(/\p{Extended_Pictographic}|️|‍/gu, ' ');
    s = s.replace(/~\s*(?=\d)/g, `${u.aprox} `);
    s = s.replace(/(\d)\s*kcal\b/gi, `$1 ${u.kcal}`);
    s = s.replace(/(\d)\s*mg\b/gi, `$1 ${u.mg}`);
    s = s.replace(/(\d)\s*ml\b/gi, `$1 ${u.ml}`);
    s = s.replace(/(\d)\s*min\b/gi, `$1 ${u.min}`);
    s = s.replace(/(\d)\s*g\b/g, `$1 ${u.g}`);
    s = s.replace(/\s*\n+\s*/g, '. ');                      // un salto de línea es una pausa
    s = s.replace(/([.!?…])\s*\.+/g, '$1');
    // [P1-PLAN-LOTE-685] «**2 huevos**.» dejaba «huevos .»: se veía en el círculo y viajaba así a la voz de la nube.
    s = s.replace(/\s+([.,;:!?…)])/g, '$1');
    s = s.replace(/\s{2,}/g, ' ').trim();
    return s;
}

/** Frases de ~180 caracteres como mucho: Chrome corta en seco una locución de más de ~15 s. */
export function trocearParaVoz(texto, max = 180) {
    const frases = String(texto || '').match(/[^.!?…]+[.!?…]*/g) || [];
    const trozos = [];
    for (const bruta of frases) {
        let f = bruta.trim();
        while (f.length > max) {
            const corte = Math.max(f.lastIndexOf(', ', max), f.lastIndexOf('; ', max), f.lastIndexOf(' ', max));
            const i = corte > max * 0.4 ? corte + 1 : max;
            trozos.push(f.slice(0, i).trim());
            f = f.slice(i).trim();
        }
        if (f && /[\p{L}\p{N}]/u.test(f)) trozos.push(f);
    }
    return trozos;
}

// Para quien lee en es-DO no existe voz dominicana en casi ningún sistema: la de EE. UU. o México suena más cercana
// que la de España.
const PREFERENCIAS = {
    'es-DO': ['es-DO', 'es-US', 'es-MX', 'es-419', 'es-PR', 'es-CO', 'es-ES', 'es'],
    'en-US': ['en-US', 'en-GB', 'en'],
    'pt-BR': ['pt-BR', 'pt-PT', 'pt'],
    'fr-FR': ['fr-FR', 'fr-CA', 'fr'],
    'it-IT': ['it-IT', 'it'],
};
// Las voces buenas se delatan en el nombre: «Google español de Estados Unidos», «Paulina (Mejorada)», «… Natural».
const CALIDAD = /(natural|neural|premium|enhanced|mejorad|google|siri)/i;

/** El idioma que se le pide al motor cuando aún no hay voz elegida (Chrome carga las voces tarde): uno que exista. */
export function idiomaDeVoz(locale = 'es-DO') {
    return (PREFERENCIAS[locale] || PREFERENCIAS['es-DO'])[locale === 'es-DO' ? 1 : 0];
}

export function elegirVoz(voces, locale = 'es-DO') {
    const orden = (PREFERENCIAS[locale] || PREFERENCIAS['es-DO']).map((p) => p.toLowerCase());
    let mejor = null;
    let puntos = -1;
    for (const v of voces || []) {
        const lang = String(v?.lang || '').replace('_', '-').toLowerCase();
        const i = orden.findIndex((p) => lang === p || (p.length === 2 && lang.startsWith(`${p}-`)));
        if (i < 0) continue;
        let p = (orden.length - i) * 10;
        if (CALIDAD.test(String(v?.name || ''))) p += 5;
        if (v?.default) p += 1;
        if (p > puntos) { puntos = p; mejor = v; }
    }
    return mejor;
}

/** iOS (Audio Session API, Safari 16.4+): tras usar el micrófono, la voz puede salir bajito por el auricular. */
export function rutaDeAudio(win, tipo) {
    try { if (win?.navigator?.audioSession) win.navigator.audioSession.type = tipo; } catch { /* sin API: no se toca */ }
}

/**
 * [P1-PLAN-LOTE-684] Cuánto del texto que va llegando por el stream ya se puede decir (0 = nada completo todavía).
 * La PRIMERA frase de la respuesta sale en su primera coma, dos puntos o punto y coma si ya lleva `minComa`
 * caracteres: la voz en la nube tarda ~2 s por petición y cuanto antes salga el primer trozo, antes suena. Las
 * demás, por oraciones completas.
 */
export function siguienteTrozoParaVoz(texto, esPrimero = false, minComa = 24) {
    const s = String(texto || '');
    const oracion = s.match(/^.*?[.!?\n](?=\s|$)/s);
    if (esPrimero) {
        const clausula = s.match(new RegExp(`^.{${minComa},}?[,;:](?=\\s)`, 's'));
        if (clausula && (!oracion || clausula[0].length < oracion[0].length)) return clausula[0].length;
    }
    return oracion ? oracion[0].length : 0;
}

/**
 * La cola de voz. `encolar(texto)` acepta trozos del stream tal como llegan; cada frase es una locución propia
 * (así la primera suena en cuanto llega, y Chrome no corta las largas). `cancelar()` sube la generación: las
 * locuciones de antes que aún disparen `onend` ya no mueven la cola.
 *
 * [P1-PLAN-LOTE-685] Con `nube` ({ pedir(texto, { signal }) → ArrayBuffer | null }) habla la voz de Gemini: cada
 * frase se PIDE en cuanto se encola (en paralelo: la síntesis tarda ~2 s y así la siguiente ya está cuando acaba la
 * anterior) y SUENA en orden por Web Audio; el círculo late con la amplitud de la voz. La primera vez que la nube no
 * da audio (204, fallo, AudioContext roto) la sesión pasa entera a la voz del teléfono: nunca dos voces en la misma
 * respuesta salvo esa frase de transición, y nunca un silencio.
 */
export function crearVozDelCoach({
    win = typeof window !== 'undefined' ? window : undefined,
    locale = 'es-DO',
    velocidad = 1.04,
    nube = null,
    alEmpezarFrase,
    alPalabra,
    alVaciarse,
} = {}) {
    // Sin `speechSynthesis` en el WebView (Android), la voz nativa del plugin con la misma forma (P1-PLAN-LOTE-683).
    const fuente = win?.speechSynthesis ? win : (vozNativaDisponible() ? sintesisNativa() : win);
    const synth = fuente?.speechSynthesis;
    const Locucion = fuente?.SpeechSynthesisUtterance;
    const ContextoDeAudio = win?.AudioContext || win?.webkitAudioContext;
    let usarNube = Boolean(nube?.pedir && ContextoDeAudio);
    let ctx = null;
    let sonando = null;       // el AudioBufferSourceNode de la frase en curso (voz en la nube)
    let pulso = null;         // requestAnimationFrame del latido
    let voz = null;
    let cola = [];            // [{ frase, audio: Promise<ArrayBuffer|null> | null, ctrl: AbortController | null }]
    let hablando = false;
    let generacion = 0;
    let vigia = null;

    const cargarVoz = () => { try { voz = elegirVoz(synth?.getVoices?.() || [], locale); } catch { voz = null; } };
    cargarVoz();
    try { synth?.addEventListener?.('voiceschanged', cargarVoz); } catch { /* navegador sin el evento */ }

    const soltarVigia = () => { if (vigia) clearTimeout(vigia); vigia = null; };
    const pararPulso = () => {
        if (pulso) { try { win?.cancelAnimationFrame?.(pulso); } catch { /* ya no corría */ } }
        pulso = null;
    };
    const contexto = () => {
        if (ctx || !ContextoDeAudio) return ctx;
        try { ctx = new ContextoDeAudio(); } catch { ctx = null; }
        return ctx;
    };
    const pasarAlTelefono = () => {
        usarNube = false;
        for (const it of cola) { try { it.ctrl?.abort(); } catch { /* ya terminó */ } }
    };

    const terminarFrase = (gen) => {
        if (gen !== generacion) return;
        soltarVigia();
        pararPulso();
        sonando = null;
        hablando = false;
        siguiente();
    };

    const hablarEnElTelefono = (frase, gen) => {
        if (!synth || !Locucion) { terminarFrase(gen); return; }
        const loc = new Locucion(frase);
        if (!voz) cargarVoz();   // la primera frase puede llegar antes que `voiceschanged`
        if (voz) { loc.voice = voz; loc.lang = voz.lang; } else loc.lang = idiomaDeVoz(locale);
        loc.rate = velocidad;
        loc.pitch = 1;
        let terminada = false;
        const fin = () => {
            if (terminada) return;
            terminada = true;
            terminarFrase(gen);
        };
        loc.onstart = () => { if (gen === generacion) alEmpezarFrase?.(frase); };
        loc.onboundary = (e) => { if (gen === generacion && e?.name !== 'sentence') alPalabra?.(); };
        loc.onend = fin;
        loc.onerror = fin;
        // Red: hay motores que a veces no disparan `onend` y la conversación se quedaría muda para siempre.
        const palabras = frase.split(/\s+/).length;
        vigia = setTimeout(fin, 4000 + (palabras * 520) / velocidad);
        try {
            rutaDeAudio(win, 'playback');
            synth.speak(loc);
        } catch {
            fin();
        }
    };

    // El latido del círculo: un pico de amplitud (una sílaba fuerte) = una «palabra».
    const latir = (analizador, gen) => {
        if (!analizador || !win?.requestAnimationFrame) return;
        const datos = new Uint8Array(analizador.fftSize);
        let arriba = false;
        let ultimo = -1000;
        const paso = (t) => {
            if (gen !== generacion || !sonando) return;
            analizador.getByteTimeDomainData(datos);
            let suma = 0;
            for (let i = 0; i < datos.length; i += 1) { const v = (datos[i] - 128) / 128; suma += v * v; }
            const rms = Math.sqrt(suma / datos.length);
            if (!arriba && rms > 0.08 && t - ultimo > 170) { arriba = true; ultimo = t; alPalabra?.(); }
            else if (arriba && rms < 0.04) arriba = false;
            pulso = win.requestAnimationFrame(paso);
        };
        pulso = win.requestAnimationFrame(paso);
    };

    const sonar = async (bytes, frase, gen) => {
        const c = contexto();
        let audio = null;
        try { audio = c ? await c.decodeAudioData(bytes.slice(0)) : null; } catch { audio = null; }
        if (gen !== generacion) return;
        if (!audio) { pasarAlTelefono(); hablarEnElTelefono(frase, gen); return; }
        // Safari deja el contexto en «interrupted» (no solo «suspended») tras usar el micrófono: se reanuda igual.
        try { if (c.state !== 'running') await c.resume(); } catch { /* el próximo toque lo reanuda */ }
        if (gen !== generacion) return;
        const src = c.createBufferSource();
        src.buffer = audio;
        let analizador = null;
        try {
            analizador = c.createAnalyser();
            analizador.fftSize = 512;
            src.connect(analizador);
            analizador.connect(c.destination);
        } catch {
            analizador = null;
            src.connect(c.destination);
        }
        let terminada = false;
        const fin = () => {
            if (terminada) return;
            terminada = true;
            terminarFrase(gen);
        };
        src.onended = fin;
        sonando = src;
        vigia = setTimeout(fin, audio.duration * 1000 + 3000);   // red por si `onended` no llega
        rutaDeAudio(win, 'playback');
        alEmpezarFrase?.(frase);
        try { src.start(); } catch { fin(); return; }
        latir(analizador, gen);
    };

    const siguiente = () => {
        if (hablando) return;
        const item = cola.shift();
        if (item === undefined) { alVaciarse?.(); return; }
        hablando = true;
        const gen = generacion;
        if (usarNube && item.audio) {
            item.audio.then((bytes) => {
                if (gen !== generacion) return;
                if (!bytes) { pasarAlTelefono(); hablarEnElTelefono(item.frase, gen); return; }
                sonar(bytes, item.frase, gen);
            });
            return;
        }
        hablarEnElTelefono(item.frase, gen);
    };

    return {
        encolar(texto) {
            for (const frase of trocearParaVoz(textoParaHablar(texto, locale))) {
                const item = { frase, audio: null, ctrl: null };
                if (usarNube) {
                    item.ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
                    item.audio = Promise.resolve()
                        .then(() => nube.pedir(frase, { signal: item.ctrl?.signal }))
                        .catch(() => null);
                }
                cola.push(item);
            }
            siguiente();
        },
        cancelar() {
            generacion += 1;
            for (const it of cola) { try { it.ctrl?.abort(); } catch { /* ya terminó */ } }
            cola = [];
            hablando = false;
            soltarVigia();
            pararPulso();
            try { sonando?.stop(); } catch { /* ya había terminado */ }
            sonando = null;
            try { synth?.cancel(); } catch { /* nada que cortar */ }
        },
        /** La primera locución de iOS tiene que salir de un toque del usuario: esta, muda, la desbloquea. Con la voz en
         * la nube, el AudioContext también nace (o se reanuda) dentro de ese toque, con un sonido de una muestra. */
        desbloquear() {
            if (usarNube) {
                const c = contexto();
                try { if (c && c.state !== 'running') c.resume(); } catch { /* sin audio: el texto sigue en pantalla */ }
                try {
                    const b = c.createBuffer(1, 1, 22050);
                    const s = c.createBufferSource();
                    s.buffer = b;
                    s.connect(c.destination);
                    s.start(0);
                } catch { /* sin Web Audio: hablará el teléfono */ }
            }
            if (!synth || !Locucion) return;
            try {
                const muda = new Locucion(' ');
                muda.volume = 0;
                synth.speak(muda);
            } catch { /* sin voz: el texto sigue en pantalla */ }
        },
        get ocupada() { return hablando || cola.length > 0; },
        /** ¿Habla la voz de la nube? (el saludo se omite: esperar ~2 s su audio tras el toque parecería roto). */
        get enLaNube() { return usarNube; },
        destruir() {
            this.cancelar();
            try { synth?.removeEventListener?.('voiceschanged', cargarVoz); } catch { /* noop */ }
            try { ctx?.close?.(); } catch { /* ya cerrado */ }
            ctx = null;
        },
    };
}
