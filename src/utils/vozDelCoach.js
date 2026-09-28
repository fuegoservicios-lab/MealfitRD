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

export function sintesisDisponible(win = typeof window !== 'undefined' ? window : undefined) {
    return Boolean(win?.speechSynthesis && typeof win.SpeechSynthesisUtterance === 'function');
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
 * La cola de voz. `encolar(texto)` acepta trozos del stream tal como llegan; cada frase es una locución propia
 * (así la primera suena en cuanto llega, y Chrome no corta las largas). `cancelar()` sube la generación: las
 * locuciones de antes que aún disparen `onend` ya no mueven la cola.
 */
export function crearVozDelCoach({
    win = typeof window !== 'undefined' ? window : undefined,
    locale = 'es-DO',
    velocidad = 1.04,
    alEmpezarFrase,
    alPalabra,
    alVaciarse,
} = {}) {
    const synth = win?.speechSynthesis;
    const Locucion = win?.SpeechSynthesisUtterance;
    let voz = null;
    let cola = [];
    let hablando = false;
    let generacion = 0;
    let vigia = null;

    const cargarVoz = () => { try { voz = elegirVoz(synth?.getVoices?.() || [], locale); } catch { voz = null; } };
    cargarVoz();
    try { synth?.addEventListener?.('voiceschanged', cargarVoz); } catch { /* navegador sin el evento */ }

    const soltarVigia = () => { if (vigia) clearTimeout(vigia); vigia = null; };

    const siguiente = () => {
        if (hablando || !synth || !Locucion) return;
        const frase = cola.shift();
        if (frase === undefined) { alVaciarse?.(); return; }
        const gen = generacion;
        const loc = new Locucion(frase);
        if (voz) { loc.voice = voz; loc.lang = voz.lang; } else loc.lang = locale;
        loc.rate = velocidad;
        loc.pitch = 1;
        let terminada = false;
        const fin = () => {
            if (terminada || gen !== generacion) return;
            terminada = true;
            soltarVigia();
            hablando = false;
            siguiente();
        };
        loc.onstart = () => { if (gen === generacion) alEmpezarFrase?.(frase); };
        loc.onboundary = (e) => { if (gen === generacion && e?.name !== 'sentence') alPalabra?.(); };
        loc.onend = fin;
        loc.onerror = fin;
        hablando = true;
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

    return {
        encolar(texto) {
            for (const f of trocearParaVoz(textoParaHablar(texto, locale))) cola.push(f);
            siguiente();
        },
        cancelar() {
            generacion += 1;
            cola = [];
            hablando = false;
            soltarVigia();
            try { synth?.cancel(); } catch { /* nada que cortar */ }
        },
        /** La primera locución de iOS tiene que salir de un toque del usuario: esta, muda, la desbloquea. */
        desbloquear() {
            if (!synth || !Locucion) return;
            try {
                const muda = new Locucion(' ');
                muda.volume = 0;
                synth.speak(muda);
            } catch { /* sin voz: el texto sigue en pantalla */ }
        },
        get ocupada() { return hablando || cola.length > 0; },
        destruir() {
            this.cancelar();
            try { synth?.removeEventListener?.('voiceschanged', cargarVoz); } catch { /* noop */ }
        },
    };
}
