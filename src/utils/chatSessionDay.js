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
    return { sessionId: abrirSesionAutomatica({ hoy, nuevoId }), esNueva: true };
};

/**
 * Abre una sesión en blanco a nombre de la regla del día (no del usuario).
 * [P1-PLAN-LOTE-71] La marca automática permite que, si el servidor ya tiene
 * un chat de hoy, `sesionDelDiaAAdoptar` la cambie por ese.
 * [P1-PLAN-LOTE-73] La usa también la renovación de medianoche.
 */
export const abrirSesionAutomatica = ({ hoy = hoyLocal(), nuevoId } = {}) => {
    const id = nuevoId || crypto.randomUUID();
    safeLocalStorageSet(SESSION_KEY, id);
    safeLocalStorageSet(SESSION_DAY_KEY, hoy);
    safeLocalStorageSet(SESSION_AUTO_KEY, id);
    return id;
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

/** [P1-PLAN-LOTE-71] ¿La abrió la regla del día (y nadie la ha elegido ni usado)? */
export const esSesionAutomatica = (sessionId) => (
    pareceUuid(sessionId) && safeLocalStorageGet(SESSION_AUTO_KEY, null) === sessionId
);

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
    if (!esSesionAutomatica(actual)) return null;
    const lista = Array.isArray(sesiones) ? sesiones : [];
    if (lista.some((s) => s && s.id === actual && s.title_key !== 'empty')) return null;
    const deHoy = sesionDeHoyEnServidor(lista, hoy);
    return deHoy && deHoy !== actual ? deHoy : null;
};

// [P1-PLAN-LOTE-73 · 2026-09-16] La renovación diaria también con la pestaña
// abierta, y la cuenta regresiva bajo «Nuevo chat». El dueño pidió no tener que
// pulsar «Nuevo chat» cada día. Al ENTRAR ya era automático (la regla de arriba);
// lo que faltaba era el cambio cuando el Agente se queda abierto de un día para
// otro. Solo se renueva la sesión que nadie ha usado ni elegido HOY (su día
// anotado es anterior) y cuya conversación es de ayer por sus mensajes, y nunca
// se corta nada en curso: el último mensaje tiene al menos `MINUTOS_DE_GRACIA`,
// y no hay turno, borrador ni interacción reciente (eso lo mira `AgentPage`).
// Si escribes pasada la medianoche, el día anotado ya es hoy y el chat sigue; si
// abres a mano un chat viejo, también (elegirlo lo anota hoy).

/** Minutos que tiene que tener el último mensaje de ayer para dar el chat por cerrado. */
export const MINUTOS_DE_GRACIA = 15;

/** Milisegundos hasta la próxima medianoche local. */
export const msHastaMedianoche = (ahora = new Date()) => {
    const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0, 0, 0);
    return Math.max(0, manana.getTime() - ahora.getTime());
};

/** Horas y minutos (hacia abajo) de una cuenta regresiva. */
export const partesCuentaRegresiva = (ms) => {
    const minutos = Math.floor(Math.max(0, ms) / 60000);
    return { h: Math.floor(minutos / 60), m: minutos % 60, menosDeUnMinuto: minutos === 0 };
};

const _instante = (msg) => {
    if (!msg || msg.isWelcome || msg._isErrorBubble || !msg.created_at) return null;
    const t = new Date(msg.created_at).getTime();
    return Number.isNaN(t) ? null : t;
};

/** Instante (ms) del último mensaje real de la conversación, o null si no hay ninguno. */
export const ultimoMensajeReal = (messages) => {
    let ultimo = null;
    for (const m of Array.isArray(messages) ? messages : []) {
        const t = _instante(m);
        if (t !== null && (ultimo === null || t > ultimo)) ultimo = t;
    }
    return ultimo;
};

/** Día anotado para `sessionId` si es la sesión guardada, o null. */
// [P1-PLAN-LOTE-76 · 2026-09-17] «Nuevo chat» bloqueado mientras el chat abierto es el de HOY (día anotado =
// hoy, sea automático o elegido a mano): decisión del dueño, «bloqueo total hasta medianoche». Solo se habilita
// en el estado degenerado en que el día anotado no es hoy (renovación imposible, almacenamiento borrado): la
// salida de emergencia para no quedarse sin chat.
export const nuevoChatBloqueado = (sessionId, hoy = hoyLocal()) => diaAnotadoDe(sessionId) === hoy;

export const diaAnotadoDe = (sessionId) => (
    pareceUuid(sessionId) && safeLocalStorageGet(SESSION_KEY, null) === sessionId
        ? safeLocalStorageGet(SESSION_DAY_KEY, null)
        : null
);

/**
 * ¿Hay que abrir el chat de hoy en lugar de `sessionId`? Solo si nadie la ha
 * usado ni elegido hoy (día anotado anterior a hoy), su conversación es de un
 * día anterior (por su último mensaje real) y ese mensaje tiene al menos
 * `minutosDeGracia`. Una conversación sin mensajes reales ya es «nueva».
 */
export const debeRenovarse = ({ messages, sessionId, ahora = new Date(), minutosDeGracia = MINUTOS_DE_GRACIA } = {}) => {
    const hoy = hoyLocal(ahora);
    const anotado = diaAnotadoDe(sessionId);
    if (!anotado || anotado >= hoy) return false;
    const ultimo = ultimoMensajeReal(messages);
    if (ultimo === null) return false;
    if (hoyLocal(new Date(ultimo)) >= hoy) return false;
    return ahora.getTime() - ultimo >= minutosDeGracia * 60000;
};

/**
 * Día de actividad que anotar para la sesión: el de su último mensaje real,
 * nunca anterior al que ya tenía. Antes se anotaba HOY cada vez que cambiaban
 * los mensajes, y eso incluye HIDRATAR: abrir a las 00:30 un chat de ayer lo
 * convertía en «el de hoy» y al volver a entrar resucitaba. Elegirlo a mano
 * (`marcarActividad` con hoy) sigue contando como hoy: el día no retrocede.
 */
export const diaDeActividad = (messages, sessionId, hoy = hoyLocal()) => {
    const ultimo = ultimoMensajeReal(messages);
    const delMensaje = ultimo === null ? hoy : hoyLocal(new Date(ultimo));
    const guardada = safeLocalStorageGet(SESSION_KEY, null);
    const anotado = guardada === sessionId ? safeLocalStorageGet(SESSION_DAY_KEY, null) : null;
    return anotado && anotado > delMensaje ? anotado : delMensaje;
};

/** Texto de la cuenta regresiva bajo «Nuevo chat» (`t` = el traductor de la app). */
export const textoCuentaRegresiva = (ms, t) => {
    const { h, m, menosDeUnMinuto } = partesCuentaRegresiva(ms);
    if (menosDeUnMinuto) return t('Nuevo chat automático en menos de un minuto');
    if (h === 0) return t('Nuevo chat automático en {m} min', { m });
    return t('Nuevo chat automático en {h} h {m} min', { h, m });
};

// [P1-PLAN-LOTE-226 · 2026-09-25] «Si entro a un chat pasado, ¿cómo vuelvo al de hoy?». Elegir un chat de
// «Recientes» lo anotaba como el de HOY (`marcarActividad` con hoy): «Nuevo chat» quedaba bloqueado hasta medianoche
// (P1-PLAN-LOTE-76) y al volver a entrar resucitaba el chat viejo. Ahora el chat elegido conserva SU día (hasta que
// escribas en él: entonces sí pasa a ser el de hoy) y, mientras lo lees, el botón dice «Volver al chat de hoy».

/** ¿La conversación abierta es de un día anterior (por su último mensaje real)? Sin mensajes reales: no. */
export const esChatDeOtroDia = (messages, hoy = hoyLocal()) => {
    const ultimo = ultimoMensajeReal(messages);
    return ultimo !== null && hoyLocal(new Date(ultimo)) < hoy;
};

/** Día que anotar al elegir `sesion` de «Recientes»: el de su última actividad, nunca posterior a hoy. */
export const diaAlElegir = (sesion, hoy = hoyLocal()) => {
    const dia = diaLocalDe(sesion?.last_activity || sesion?.created_at);
    return dia && dia < hoy ? dia : hoy;
};
