// [P1-PLAN-LOTE-726 · 2026-09-28] La foto que mandas al CHAT aparece en la ficha de la comida que el coach registra.
//
// El dueño: «yo subí una foto al agente IA chat de un plato que me comí y cuando lo guardo no veo la foto en los
// detalles de dicho plato». El escáner guarda la foto en el teléfono bajo el id de la comida que él mismo registra
// (`fotosDeComidas.js`); en el chat la comida la registra el COACH en el servidor, y el id de esa fila nunca llega al
// navegador (va solo en el mensaje interno de la herramienta). Así que el enlace se hace aquí, al cerrar cada turno:
//
//  1. al subir una foto de PLATO al chat (`photo_kind === 'plato'`) se recuerda: su blob (mientras la página viva) y su
//     `image_url` firmada (para después de recargar, o si se contestan sus dudas en otro turno);
//  2. al terminar un turno se pide el día (hoy y ayer) y cada comida registrada por el coach (`source === 'chat'`,
//     `GET /api/diary/meal/{id}`) DESPUÉS de una foto y dentro de `VENTANA_MS`, sin foto todavía, recibe la foto más
//     reciente anterior a ella; se guarda con `guardarFotoDeComida` (solo en este teléfono, como el escáner);
//  3. una foto ya enlazada solo se reutiliza para lo registrado en el MISMO momento (`MISMO_TURNO_MS`: el coach puede
//     partir un plato en dos registros); una comida anotada más tarde a mano no hereda una foto vieja.
//
// Nada de esto lanza hacia la interfaz: si algo falla, la comida sale sin foto, como antes.
import { guardarFotoDeComida, idsConFoto } from './fotosDeComidas';

export const VENTANA_MS = 45 * 60 * 1000;
export const MISMO_TURNO_MS = 2 * 60 * 1000;
const CLAVE = (userId) => `mealfit_fotos_del_chat:${userId}`;
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

/** Recuerda las fotos de PLATO de un turno recién subidas (las de la compra o sin comida no se enlazan). */
export function recordarFotosDelChat(userId, subidas, ahora = Date.now()) {
    if (!_valido(userId) || !Array.isArray(subidas)) return;
    const nuevas = subidas.filter((s) => s && s.kind === 'plato' && s.attachment_id && !s.analysis_failed);
    if (!nuevas.length) return;
    const lista = _leer(userId).filter((f) => ahora - Number(f.t) < VENTANA_MS);
    nuevas.forEach((s) => {
        if (s.file instanceof Blob) _blobs.set(String(s.attachment_id), s.file);
        if (!lista.some((f) => f.id === String(s.attachment_id))) {
            lista.push({ id: String(s.attachment_id), url: s.image_url || '', t: ahora, enlazadaEn: null });
        }
    });
    _escribir(userId, lista);
}

/** Qué foto le toca a una comida creada en `creada` (ms), o null. Pura: se prueba sin red. */
export function fotoParaComida(fotos, creada) {
    const candidatas = (Array.isArray(fotos) ? fotos : [])
        .filter((f) => Number(f.t) <= creada + 5000 && creada - Number(f.t) <= VENTANA_MS)
        .filter((f) => f.enlazadaEn == null || Math.abs(creada - Number(f.enlazadaEn)) <= MISMO_TURNO_MS)
        .sort((a, b) => Number(b.t) - Number(a.t));
    return candidatas[0] || null;
}

const _fechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Enlaza las comidas que el coach registró tras una foto. Devuelve cuántas fotos guardó. `fetchJson(url)` y
 *  `fetchBlob(url)` se inyectan (en la app, sobre `fetchWithAuth`). */
export async function vincularFotosDelChat(userId, { fetchJson, fetchBlob, ahora = Date.now() } = {}) {
    if (!_valido(userId) || typeof fetchJson !== 'function') return 0;
    let fotos = _leer(userId).filter((f) => ahora - Number(f.t) < VENTANA_MS + MISMO_TURNO_MS);
    if (!fotos.length) return 0;
    const desde = Math.min(...fotos.map((f) => Number(f.t))) - 5000;

    const tz = new Date().getTimezoneOffset();
    const hoy = new Date(ahora);
    const ayer = new Date(ahora - 86400000);
    let comidas = [];
    for (const d of [hoy, ayer]) {
        try {
            const data = await fetchJson(`/api/diary/consumed/${userId}?date=${_fechaLocal(d)}&tzOffset=${tz}`);
            if (Array.isArray(data?.meals)) comidas = comidas.concat(data.meals);
        } catch { /* ese día sin datos */ }
    }
    const conFoto = await idsConFoto(userId);
    const nuevas = comidas
        .filter((m) => m?.id && !conFoto.has(m.id) && Date.parse(m.created_at) >= desde)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

    let guardadas = 0;
    for (const m of nuevas) {
        const creada = Date.parse(m.created_at);
        const foto = fotoParaComida(fotos, creada);
        if (!foto) continue;
        let detalle = null;
        try { detalle = await fetchJson(`/api/diary/meal/${m.id}`); } catch { detalle = null; }
        if (detalle?.meal?.source !== 'chat') continue;
        let blob = _blobs.get(foto.id) || null;
        if (!blob && foto.url && typeof fetchBlob === 'function') {
            try { blob = await fetchBlob(foto.url); } catch { blob = null; }
        }
        if (!(blob instanceof Blob)) continue;
        if (await guardarFotoDeComida(userId, m.id, blob)) {
            guardadas += 1;
            fotos = fotos.map((f) => (f.id === foto.id && f.enlazadaEn == null ? { ...f, enlazadaEn: creada } : f));
        }
    }
    _escribir(userId, fotos);
    return guardadas;
}
