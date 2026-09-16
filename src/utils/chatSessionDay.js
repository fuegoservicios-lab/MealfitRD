// [P1-AGENT-SESSION-DAY · 2026-08-14] Cuándo el Agente retoma tu chat y cuándo
// te abre uno nuevo.
//
// Historia, porque es la razón de que esto sea un umbral y no un sí/no:
//
//   · 2026-05-20 (P1-AGENT-PERSIST-SESSION) — el owner: «se refresca y
//     molesta». Cada vez que iba a Nevera/Plan/Recetas y volvía al Agente, el
//     componente remontaba, generaba un UUID nuevo y perdía la conversación EN
//     CURSO. Se arregló persistiendo la sesión activa en localStorage.
//   · 2026-08-14 — el mismo owner pide lo contrario: que entrar al Agente
//     abra un chat nuevo. Al mirarlo, le estaba resucitando una conversación
//     del 1 de agosto: trece días.
//
// No son peticiones opuestas: son los dos extremos del MISMO eje mal
// calibrado. La persistencia era absoluta —no caducaba nunca—, así que
// acertaba al volver a los treinta segundos y fallaba al volver a los trece
// días. Lo que faltaba era una frontera.
//
// La frontera es el DÍA, y no un número de horas, porque en esta app el día es
// la unidad real: el plan es diario, el diario de comidas es diario, y el
// propio chat razona en «te quedan 1280 kcal de hoy». Un chat de ayer discute
// otras comidas y otros números. Además es predecible sin tener que recordar
// ningún umbral: cada día se empieza fresco, y dentro del día se conserva el
// hilo (que es exactamente lo que se pidió en mayo).
//
// Día LOCAL, no UTC: para alguien en RD (UTC-4) el corte en UTC caería a las
// 20:00 y le cortaría el chat en plena cena.
//
// [P1-PLAN-LOTE-71 · 2026-09-16] El chat del día vive en el SERVIDOR, no solo en
// este navegador. El dueño cerró sesión, volvió a entrar y el Agente le abrió un
// chat en blanco, con su conversación de esa misma mañana (6 mensajes, la última
// a las 12:58) listada en «Recientes · Hoy». La regla de arriba solo miraba esta
// clave de localStorage, y el logout la BORRA a propósito (P2-CHAT-CACHE-XUSER:
// en un dispositivo compartido, el siguiente usuario no puede heredarla). Pasaría
// igual en un teléfono nuevo o tras limpiar el navegador.
//
// Por eso una sesión que abrió la regla (y no el usuario) queda marcada, y cuando
// llega la lista del servidor —que ya es solo tuya, por el token— se cambia por tu
// chat de hoy si existe. Una elegida a mano («Nuevo chat», «Recientes») o ya usada
// no se toca jamás: la marca se borra en cuanto hay actividad.
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './safeLocalStorage';

export const SESSION_KEY = 'mealfit_current_session';
export const SESSION_DAY_KEY = 'mealfit_current_session_day';
export const SESSION_AUTO_KEY = 'mealfit_current_session_auto';

/** Fecha local en YYYY-MM-DD. */
export const hoyLocal = (d = new Date()) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const pareceUuid = (s) => typeof s === 'string' && /^[0-9a-f-]{30,}$/i.test(s);

/**
 * La sesión que corresponde abrir ahora: la guardada si su última actividad
 * fue HOY, o una nueva en cualquier otro caso.
 *
 * Nota sobre las sesiones ya existentes: al desplegar esto nadie tiene todavía
 * la marca de día, así que la primera visita de cada usuario abre chat nuevo.
 * Es justo el efecto pedido, y sus conversaciones anteriores siguen en
 * «Recientes» — no se pierde nada, solo deja de resucitar solo.
 */
export const resolverSesionDelDia = ({ hoy = hoyLocal(), nuevoId } = {}) => {
    const guardada = safeLocalStorageGet(SESSION_KEY, null);
    const dia = safeLocalStorageGet(SESSION_DAY_KEY, null);
    if (pareceUuid(guardada) && dia === hoy) {
        return { sessionId: guardada, esNueva: false };
    }
    const id = nuevoId || crypto.randomUUID();
    safeLocalStorageSet(SESSION_KEY, id);
    safeLocalStorageSet(SESSION_DAY_KEY, hoy);
    // [P1-PLAN-LOTE-71] La abrió la regla, no el usuario: si el servidor ya
    // tiene un chat de hoy, `sesionDelDiaAAdoptar` la cambia por ese.
    safeLocalStorageSet(SESSION_AUTO_KEY, id);
    return { sessionId: id, esNueva: true };
};

/**
 * Marca actividad en la sesión abierta. Se llama cuando hay mensajes REALES
 * (no la pantalla de bienvenida), así que una sesión que solo se abrió y no se
 * usó no reclama el día para sí. También al elegir una sesión a mano.
 */
export const marcarActividad = (sessionId, hoy = hoyLocal()) => {
    if (!pareceUuid(sessionId)) return;
    safeLocalStorageSet(SESSION_KEY, sessionId);
    safeLocalStorageSet(SESSION_DAY_KEY, hoy);
    // [P1-PLAN-LOTE-71] Elegida o usada: ya no es «la que abrió la regla».
    safeLocalStorageRemove(SESSION_AUTO_KEY);
};

/** Día local (YYYY-MM-DD) de una marca de tiempo del servidor, o null. */
export const diaLocalDe = (marca) => {
    if (!marca) return null;
    const d = new Date(marca);
    return Number.isNaN(d.getTime()) ? null : hoyLocal(d);
};

/**
 * [P1-PLAN-LOTE-71] Tu chat de hoy según el servidor: la sesión con mensajes
 * cuya última actividad cae hoy (día local); de varias, la más reciente. El
 * backend marca con `title_key: 'empty'` la sesión en la que nadie escribió.
 * Misma fecha que agrupa «Hoy» en Recientes: `last_activity`, o `created_at`.
 */
export const sesionDeHoyEnServidor = (sesiones, hoy = hoyLocal()) => {
    let elegida = null;
    let masReciente = -Infinity;
    for (const s of Array.isArray(sesiones) ? sesiones : []) {
        if (!s || !pareceUuid(s.id) || s.title_key === 'empty') continue;
        const marca = s.last_activity || s.created_at;
        if (diaLocalDe(marca) !== hoy) continue;
        const instante = new Date(marca).getTime();
        if (instante > masReciente) {
            elegida = s.id;
            masReciente = instante;
        }
    }
    return elegida;
};

/**
 * [P1-PLAN-LOTE-71] A qué sesión pasar al recibir la lista del servidor, o null
 * para quedarse. Solo se cambia la sesión que abrió la regla del día (nunca una
 * elegida o usada) y solo si el servidor no la conoce con mensajes.
 */
export const sesionDelDiaAAdoptar = ({ sesiones, actual, hoy = hoyLocal() } = {}) => {
    if (!pareceUuid(actual)) return null;
    if (safeLocalStorageGet(SESSION_AUTO_KEY, null) !== actual) return null;
    const lista = Array.isArray(sesiones) ? sesiones : [];
    if (lista.some((s) => s && s.id === actual && s.title_key !== 'empty')) return null;
    const deHoy = sesionDeHoyEnServidor(lista, hoy);
    return deHoy && deHoy !== actual ? deHoy : null;
};
