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
import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';

export const SESSION_KEY = 'mealfit_current_session';
export const SESSION_DAY_KEY = 'mealfit_current_session_day';

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
    return { sessionId: id, esNueva: true };
};

/**
 * Marca actividad en la sesión abierta. Se llama cuando hay mensajes REALES
 * (no la pantalla de bienvenida), así que una sesión que solo se abrió y no se
 * usó no reclama el día para sí.
 */
export const marcarActividad = (sessionId, hoy = hoyLocal()) => {
    if (!pareceUuid(sessionId)) return;
    safeLocalStorageSet(SESSION_KEY, sessionId);
    safeLocalStorageSet(SESSION_DAY_KEY, hoy);
};
