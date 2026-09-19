// [P1-PLAN-LOTE-125 · 2026-09-19] Dictado por voz del chat — la parte que se prueba sin micrófono.
//
// El dueño: «agrega un microfonito para poder hablar en vez de escribir, hazlo lo mejor posible, fluido».
//
// El motor es el reconocimiento de voz del propio navegador (`SpeechRecognition`): escribe MIENTRAS se habla, no
// cuesta nada por uso y el audio no pasa por nuestro backend. Lo que aquí se decide, y por qué vive aparte:
//
//   · DÓNDE se ofrece. Un botón que siempre falla es peor que no tenerlo, y hay dos sitios donde fallaría seguro:
//       – la web con `Permissions-Policy: microphone=()` (nginx): el navegador niega el micrófono sin preguntar;
//       – la app nativa cuyo binario no declara `NSMicrophoneUsageDescription` / `NSSpeechRecognitionUsageDescription`:
//         iOS niega sin preguntar. El JS no puede leer el Info.plist, así que el BINARIO lo declara: la misma
//         versión que gana las claves añade `BioborosNative/mic` a su user agent (`capacitor.config.ts`), y un
//         paquete OTA corriendo sobre un binario viejo no pinta el botón.
//   · EN QUÉ IDIOMA. `es-DO` no existe en todos los motores (Apple): se prueba una lista, de más a menos cercano.
//   · CÓMO SE UNE lo dictado con lo que ya estaba escrito (un espacio, mayúscula tras punto, tope del campo).
//
// El ciclo de vida (arrancar, reiniciar, silencio, cancelar) vive en `hooks/useDictado.js`.
import { i18nKey } from '../i18n';

/** Lo añade al user agent el binario nativo que YA declara los permisos de micrófono y voz. */
export const DICTADO_UA_NATIVO = 'BioborosNative/mic';
/** Sin oír nada nuevo durante este tiempo, el dictado se apaga solo (nadie quiere un micrófono olvidado). */
export const DICTADO_SILENCIO_MS = 7000;
/** Si ni siquiera llega a oír una palabra, espera un poco más antes de rendirse. */
export const DICTADO_SIN_VOZ_MS = 9000;
/** El mismo tope que el campo del chat (P0-CHAT-PROMPT-MAXLEN). */
export const DICTADO_MAX_CHARS = 8192;

export function motorDeDictado(win = typeof window !== 'undefined' ? window : undefined) {
    return win?.SpeechRecognition || win?.webkitSpeechRecognition || null;
}

function politicaPermiteMicrofono(doc) {
    try {
        const politica = doc?.permissionsPolicy || doc?.featurePolicy;
        if (politica && typeof politica.allowsFeature === 'function') return politica.allowsFeature('microphone') !== false;
    } catch { /* sin API de políticas: no se puede saber, se deja pasar */ }
    return true;
}

export function dictadoDisponible({
    win = typeof window !== 'undefined' ? window : undefined,
    doc = typeof document !== 'undefined' ? document : undefined,
    esNativa = false,
    userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
} = {}) {
    if (!motorDeDictado(win)) return false;
    if (esNativa) return String(userAgent || '').includes(DICTADO_UA_NATIVO);
    return politicaPermiteMicrofono(doc);
}

const IDIOMAS = {
    'es-DO': ['es-DO', 'es-US', 'es-MX', 'es-ES'],
    'en-US': ['en-US'],
    'pt-BR': ['pt-BR', 'pt-PT'],
    'fr-FR': ['fr-FR'],
    'it-IT': ['it-IT'],
};

/** Idiomas que se le proponen al motor, en orden: si rechaza uno (`language-not-supported`) se prueba el siguiente. */
export function idiomasDeDictado(locale) {
    return IDIOMAS[locale] || IDIOMAS['es-DO'];
}

/** Android repite cada frase dentro de la misma sesión continua: allí se dicta frase a frase y se reinicia. */
export function dictadoContinuo(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
    return !/android/i.test(String(userAgent || ''));
}

/** Lee TODA la lista de resultados de la sesión (no solo el último): lo firme y lo que aún puede cambiar. */
export function leerResultados(results) {
    let finales = '';
    let provisional = '';
    for (let i = 0; i < (results?.length || 0); i += 1) {
        const trozo = results[i]?.[0]?.transcript || '';
        if (results[i]?.isFinal) finales += trozo;
        else provisional += trozo;
    }
    return { finales, provisional };
}

const limpiar = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Lo que ya estaba escrito + lo dictado: un solo espacio entre ambos y mayúscula al empezar frase. */
export function unirDictado(base, dicho, max = DICTADO_MAX_CHARS) {
    const antes = String(base || '').replace(/\s+$/, '');
    let nuevo = limpiar(dicho);
    if (!nuevo) return String(base || '').slice(0, max);
    if (!antes || /[.!?…:]$/.test(antes)) nuevo = nuevo.charAt(0).toUpperCase() + nuevo.slice(1);
    return (antes ? `${antes} ${nuevo}` : nuevo).slice(0, max);
}

/** Código de error del motor → lo que se le dice al usuario (clave i18n) o `null` si no hay nada que decir. */
export function mensajeDeErrorDeDictado(code) {
    switch (code) {
        case 'aborted':
            return null;
        case 'not-allowed':
        case 'service-not-allowed':
            return i18nKey('Permite el micrófono para dictar');
        case 'audio-capture':
            return i18nKey('No encuentro un micrófono');
        case 'network':
            return i18nKey('El dictado necesita conexión');
        case 'no-speech':
            return i18nKey('No te escuché. Toca el micrófono y habla');
        case 'language-not-supported':
            return i18nKey('El dictado no está disponible en tu idioma');
        default:
            return i18nKey('No pude iniciar el dictado');
    }
}
