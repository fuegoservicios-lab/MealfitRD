// [P1-PLAN-LOTE-726 · 2026-09-28] La foto que mandas al CHAT aparece en la ficha de la comida que el coach registra.
//
// El dueño: «yo subí una foto al agente IA chat de un plato que me comí y cuando lo guardo no veo la foto en los
// detalles de dicho plato». El escáner guarda la foto en el teléfono bajo el id de la comida que él mismo registra
// (`fotosDeComidas.js`); en el chat la comida la registra el COACH en el servidor, y el id de esa fila nunca llega al
// navegador (va solo en el mensaje interno de la herramienta). Así que el enlace se hace aquí, al cerrar cada turno:
//
//  1. al subir una foto de COMIDA al chat (`photo_kind` 'plato' o 'items') se recuerda: su blob (mientras la página
//     viva), su `image_url` firmada (para después de recargar, o si se contestan sus dudas en otro turno), lo que la
//     foto dice que muestra y el chat en que se mandó;
//  2. al terminar un turno se pide el día (hoy y ayer) y cada comida registrada por el coach (`source === 'chat'`,
//     `GET /api/diary/meal/{id}`) DESPUÉS de una foto y dentro de `VENTANA_MS`, sin foto todavía, recibe la foto más
//     reciente anterior a ella; se guarda con `guardarFotoDeComida` (solo en este teléfono, como el escáner);
//  3. una foto ya enlazada solo se reutiliza para lo registrado en el MISMO momento (`MISMO_TURNO_MS`: el coach puede
//     partir un plato en dos registros); una comida anotada más tarde a mano no hereda una foto vieja.
//
// [P1-PLAN-LOTE-727 · 2026-09-29] «sigue sin haber foto en los detalles» (Limoncillos, 28-sep 21:11 hora RD). La foto
// se clasificó 'items' (frutas SUELTAS, no un plato servido) y el 726 solo recordaba 'plato': nunca se guardó. Y ya no
// se puede recuperar: al resumir el chat (02:02 UTC) el servidor borró sus mensajes viejos y la foto se fue con ellos
// (`chat_attachments.message_id` ON DELETE CASCADE). Ahora:
//  - se recuerdan 'plato' e 'items' (no 'etiqueta' —la tabla de un pote va a la Alacena— ni 'otro', que no es comida);
//  - como 'items' también es la foto de una COMPRA, una foto solo se da a lo que el coach anota en SU turno o, en los
//    `MAX_TURNOS_DESPUES` turnos siguientes de ese chat (el coach pregunta «¿te los comiste?»), a una comida cuyo
//    nombre o ingredientes nombren algo de lo que la foto muestra (`hablanDeLoMismo`);
//  - el panel también enlaza al abrirse o volver a primer plano (`useEnlazarFotosDelChat`): si sales del chat antes
//    de que termine el turno, el coach lo termina igual (760) pero este teléfono nunca ve su `done`;
//  - el cierre relee la lista antes de escribir: una foto subida mientras se enlazaba no se pierde.
//
// Nada de esto lanza hacia la interfaz: si algo falla, la comida sale sin foto, como antes.
// Las correcciones se enlazan por el ID que confirma el servidor, aunque la fila sea anterior a la foto.
import { guardarFotoDeComida, idsConFoto } from './fotosDeComidas';
import { fetchWithAuth } from '../config/api';

export const VENTANA_MS = 45 * 60 * 1000;
export const MISMO_TURNO_MS = 2 * 60 * 1000;
export const MAX_TURNOS_DESPUES = 2;
const TIPOS_DE_COMIDA = new Set(['plato', 'items']);
const CLAVE = (userId) => `mealfit_fotos_del_chat:${userId}`;
const CLAVE_CORRECCIONES = (userId) => `mealfit_fotos_corregidas:${userId}`;
const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const MAX = 6;
const _blobs = new Map();   // attachmentId -> Blob (solo mientras la página viva)

const _valido = (u) => typeof u === 'string' && u.length > 0 && u !== 'guest';

function _leer(userId) {
    try {
        const raw = window.localStorage.getItem(CLAVE(userId));
        const lista = raw ? JSON.parse(raw) : [];
        return Array.isArray(lista) ? lista : [];
    } catch {
        return [];
    }
}

function _escribir(userId, lista) {
    try { window.localStorage.setItem(CLAVE(userId), JSON.stringify(lista.slice(-MAX))); } catch { /* sin almacenamiento */ }
}

// Palabras que salen en cualquier descripción o receta y no dicen QUÉ se comió (medidas, cocciones, colores, rótulos
// de comida): con ellas, la foto de una compra «casaría» con cualquier plato.
const _VACIAS = new Set(('plato platos porcion porciones racion raciones comida comidas unidad unidades gramo gramos '
    + 'taza tazas vaso vasos cucharada cucharadas cucharadita cucharaditas rebanada rebanadas pieza piezas trozo trozos '
    + 'mediano mediana medianos medianas grande grandes pequeno pequena pequenos pequenas cocido cocida cocidos cocidas '
    + 'frito frita fritos fritas hervido hervida hervidos hervidas asado asada asados asadas horneado horneada natural '
    + 'casero casera caseros caseras entero entera enteros enteras mitad medio media servido servida acompanado '
    + 'acompanada acompanados acompanadas blanco blanca blancos blancas verde verdes rojo roja rojos rojas maduro madura '
    + 'maduros maduras fresco fresca frescos frescas salsa aceite azucar desayuno almuerzo cena merienda snack bebida '
    + 'sobre para unos unas algo este esta estos estas cada aprox aproximadamente alrededor junto tipo estilo foto '
    + 'imagen mesa bandeja fondo visible parece posible posiblemente probablemente paquete botella lata').split(' '));

function _raices(texto) {
    const out = new Set();
    String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .split(/[^a-z]+/)
        .forEach((w) => {
            if (w.length < 4 || _VACIAS.has(w)) return;
            out.add(w.endsWith('s') ? w.slice(0, -1) : w);
        });
    return out;
}

const _mismaRaiz = (a, b) => a === b
    || (Math.min(a.length, b.length) >= 4 && Math.abs(a.length - b.length) <= 1 && (a.startsWith(b) || b.startsWith(a)));

/** ¿Nombra la comida algo de lo que la foto muestra? («2 limoncillos» ↔ «Limoncillos»; «limones» ↔ «limón»;
 *  «papa» NO es «papaya»). Pura. */
export function hablanDeLoMismo(descripcion, textoDeLaComida) {
    const a = _raices(descripcion);
    if (!a.size) return false;
    const b = [..._raices(textoDeLaComida)];
    return [...a].some((x) => b.some((y) => _mismaRaiz(x, y)));
}

/** Recuerda las fotos de COMIDA de un turno recién subidas (las de etiquetas o sin comida no se enlazan). */
export function recordarFotosDelChat(userId, subidas, { ahora = Date.now(), sesion = null } = {}) {
    if (!_valido(userId) || !Array.isArray(subidas)) return;
    const nuevas = subidas.filter((s) => s && TIPOS_DE_COMIDA.has(s.kind) && s.attachment_id && !s.analysis_failed);
    if (!nuevas.length) return;
    const lista = _leer(userId).filter((f) => ahora - Number(f.t) < VENTANA_MS);
    nuevas.forEach((s) => {
        if (s.file instanceof Blob) _blobs.set(String(s.attachment_id), s.file);
        if (!lista.some((f) => f.id === String(s.attachment_id))) {
            lista.push({
                id: String(s.attachment_id), url: s.image_url || '', t: ahora, enlazadaEn: null,
                kind: s.kind, desc: String(s.description || '').slice(0, 400), ses: sesion || null, turnos: 0,
            });
        }
    });
    _escribir(userId, lista);
}

/** Qué foto le toca a una comida creada en `creada` (ms), o null. `textoDeLaComida` (nombre + ingredientes) decide
 *  las fotos de turnos anteriores; sin él solo valen las del mismo turno. Pura: se prueba sin red. */
export function fotoParaComida(fotos, creada, textoDeLaComida = '') {
    const candidatas = (Array.isArray(fotos) ? fotos : [])
        .filter((f) => Number(f.t) <= creada + 5000 && creada - Number(f.t) <= VENTANA_MS)
        .filter((f) => f.enlazadaEn == null || Math.abs(creada - Number(f.enlazadaEn)) <= MISMO_TURNO_MS)
        .filter((f) => {
            const turnos = Number(f.turnos) || 0;
            if (turnos > MAX_TURNOS_DESPUES) return false;
            return turnos === 0 || hablanDeLoMismo(f.desc, textoDeLaComida);
        })
        .sort((a, b) => Number(b.t) - Number(a.t));
    return candidatas[0] || null;
}

const _fechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const _fetchJson = async (url) => { const r = await fetchWithAuth(url); return r.ok ? r.json() : null; };
const _fetchBlob = async (url) => { const r = await fetchWithAuth(url); return r.ok ? r.blob() : null; };

const _textoDeLaComida = (meal) => [meal?.meal_name || '']
    .concat((meal?.ingredientes?.lineas || []).map((l) => l?.texto || ''))
    .join(' ');

function _leerCorrecciones(userId) {
    try {
        const lista = JSON.parse(window.localStorage.getItem(CLAVE_CORRECCIONES(userId)) || '[]');
        return Array.isArray(lista) ? lista : [];
    } catch { return []; }
}

function _escribirCorrecciones(userId, lista) {
    try { window.localStorage.setItem(CLAVE_CORRECCIONES(userId), JSON.stringify(lista.slice(-20))); } catch { /* cuota */ }
}

/** Enlaza comidas nuevas o corregidas con su foto. Devuelve cuántas fotos guardó. `fetchJson(url)` y
 *  `fetchBlob(url)` se inyectan en las pruebas (por defecto, sobre `fetchWithAuth`). `cierraTurnoDe` = el chat cuyo
 *  turno acaba de terminar: sus fotos cuentan un turno más (el panel enlaza sin cerrar turnos). */
export async function vincularFotosDelChat(userId, {
    fetchJson = _fetchJson, fetchBlob = _fetchBlob, ahora = Date.now(), cierraTurnoDe = null, idsCorregidos = [],
} = {}) {
    if (!_valido(userId) || typeof fetchJson !== 'function') return 0;
    const vigente = (f) => ahora - Number(f.t) < VENTANA_MS + MISMO_TURNO_MS && (Number(f.turnos) || 0) <= MAX_TURNOS_DESPUES;
    let fotos = _leer(userId).filter(vigente);
    const enlaces = new Map();   // id de foto -> instante de la comida a la que se dio
    let guardadas = 0;
    // A correction keeps created_at and may target an older day or a manually logged meal.
    // These IDs come from successful server tool receipts, never from the assistant's prose.
    let correcciones = _leerCorrecciones(userId).filter((c) => UUID_RE.test(c.id) && ahora - Number(c.t) < VENTANA_MS);
    if (cierraTurnoDe && fotos.some((f) => f.ses === cierraTurnoDe)) {
        for (const id of Array.isArray(idsCorregidos) ? idsCorregidos : []) {
            if (typeof id !== 'string' || !UUID_RE.test(id)) continue;
            correcciones = correcciones.filter((c) => c.id !== id);
            correcciones.push({ id, ses: cierraTurnoDe, t: ahora });
        }
    }
    _escribirCorrecciones(userId, correcciones);
    const completadas = new Set();
    for (const c of correcciones) {
        let detalle = null;
        try { detalle = await fetchJson(`/api/diary/meal/${c.id}`); } catch { /* retry when the panel opens */ }
        if (detalle?.meal?.id !== c.id) continue; // Owned endpoint: no deleted/missing/foreign meal.
        const candidatas = fotos.filter((f) => f.ses === c.ses
            && Number(f.t) <= Number(c.t) + 5000 && Number(c.t) - Number(f.t) <= VENTANA_MS
            && (f.enlazadaEn == null || Math.abs(Number(c.t) - Number(f.enlazadaEn)) <= MISMO_TURNO_MS))
            .sort((a, b) => Number(b.t) - Number(a.t));
        const coincidentes = candidatas.filter((f) => hablanDeLoMismo(f.desc, _textoDeLaComida(detalle.meal)));
        const foto = coincidentes[0] || (candidatas.length === 1 && !Number(candidatas[0].turnos) ? candidatas[0] : null);
        if (!foto) continue;
        let blob = _blobs.get(foto.id) || null;
        if (!blob && foto.url && typeof fetchBlob === 'function') {
            try { blob = await fetchBlob(foto.url); } catch { /* retry */ }
        }
        if (!(blob instanceof Blob)) continue;
        if (await guardarFotoDeComida(userId, c.id, blob)) {
            guardadas += 1;
            completadas.add(`${c.id}:${c.t}`);
            enlaces.set(foto.id, Number(c.t));
            fotos = fotos.map((f) => f.id === foto.id ? { ...f, enlazadaEn: Number(c.t) } : f);
        }
    }
    // Preserve receipts arriving during these asynchronous reads; retain failed saves for a retry.
    _escribirCorrecciones(userId, _leerCorrecciones(userId).filter((c) => !completadas.has(`${c.id}:${c.t}`)
        && ahora - Number(c.t) < VENTANA_MS));
    if (fotos.length) {
        const desde = Math.min(...fotos.map((f) => Number(f.t))) - 5000;
        const tz = new Date().getTimezoneOffset();
        let comidas = [];
        for (const d of [new Date(ahora), new Date(ahora - 86400000)]) {
            try {
                const data = await fetchJson(`/api/diary/consumed/${userId}?date=${_fechaLocal(d)}&tzOffset=${tz}`);
                if (Array.isArray(data?.meals)) comidas = comidas.concat(data.meals);
            } catch { /* ese día sin datos */ }
        }
        const conFoto = await idsConFoto(userId);
        const vistas = new Set();
        const nuevas = comidas
            .filter((m) => m?.id && !vistas.has(m.id) && vistas.add(m.id) && !conFoto.has(m.id) && Date.parse(m.created_at) >= desde)
            .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

        for (const m of nuevas) {
            const creada = Date.parse(m.created_at);
            // sin ninguna foto posible por la hora, ni se pregunta el detalle
            if (!fotos.some((f) => Number(f.t) <= creada + 5000 && creada - Number(f.t) <= VENTANA_MS)) continue;
            let detalle = null;
            try { detalle = await fetchJson(`/api/diary/meal/${m.id}`); } catch { detalle = null; }
            if (detalle?.meal?.source !== 'chat') continue;
            const foto = fotoParaComida(fotos, creada, _textoDeLaComida(detalle.meal));
            if (!foto) continue;
            let blob = _blobs.get(foto.id) || null;
            if (!blob && foto.url && typeof fetchBlob === 'function') {
                try { blob = await fetchBlob(foto.url); } catch { blob = null; }
            }
            if (!(blob instanceof Blob)) continue;
            if (await guardarFotoDeComida(userId, m.id, blob)) {
                guardadas += 1;
                if (foto.enlazadaEn == null) {
                    enlaces.set(foto.id, creada);
                    fotos = fotos.map((f) => (f.id === foto.id ? { ...f, enlazadaEn: creada } : f));
                }
            }
        }
    }
    // Relee antes de escribir: lo subido mientras se enlazaba sigue ahí (y su turno no ha terminado: no cuenta).
    const cerrada = (f) => cierraTurnoDe && Number(f.t) <= ahora && (f.ses == null || f.ses === cierraTurnoDe);
    const final = _leer(userId)
        .map((f) => {
            let g = f;
            if (enlaces.has(f.id)) g = { ...g, enlazadaEn: enlaces.get(f.id) };
            if (cerrada(g)) g = { ...g, turnos: (Number(g.turnos) || 0) + 1 };
            return g;
        })
        .filter((f) => ahora - Number(f.t) < VENTANA_MS + MISMO_TURNO_MS && (Number(f.turnos) || 0) <= MAX_TURNOS_DESPUES);
    _escribir(userId, final);
    return guardadas;
}
