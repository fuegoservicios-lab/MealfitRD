// [P1-PLAN-LOTE-1184 · 2026-11-27] Las fotos del ESCÁNER también en el servidor.
//
// El dueño registró un almuerzo con el escáner en el iPhone y en el PC no veía la foto, ni en el diario ni en el chat
// del coach: la foto vivía SOLO en el dispositivo (fotosDeComidas.js, lote 721) porque la Política de Privacidad decía
// que el servidor no la conservaba. Decisión del dueño: guardarla en el servidor (la política se actualizó a la vez).
//
//  · `subirFotoDeComida`: tras registrar con el escáner, la foto (1024 px) y su miniatura (160 px) suben a
//    `POST /api/diary/meal/{id}/photo`. El servidor la pone además en el mensaje «Registré mi …» del chat.
//  · `traerFotosDelServidor`: al abrir el diario (y al volver a primer plano) baja al dispositivo las fotos que este
//    aún no tiene, con el MISMO almacén local de siempre: el resto de la interfaz (miniatura de la fila, ficha,
//    galería) no cambia. Una comida que ya tiene foto en el dispositivo no se toca (el iPhone que la tomó no la duplica).
//  · [P1-PLAN-LOTE-1185] `subirFotosPendientes`: el dispositivo que tomó fotos del escáner ANTES de 1184 las sube él
//    mismo (las del escáner son las que no traen id: las del chat ya viven en el servidor). Así el almuerzo de
//    ese día aparece también en el PC y en el chat. Cada comida se intenta una vez por dispositivo.
//
// Nada de esto lanza hacia la interfaz: si algo falla, la comida sale sin foto, como antes.
import { fetchWithAuth } from '../config/api';
import { guardarFotoDeComida, idsConFoto, leerFotosDeComida, reducirImagen } from './fotosDeComidas';

const LADO_FOTO = 1024;
const CALIDAD_FOTO = 0.8;
const LADO_MINI = 160;
const CALIDAD_MINI = 0.72;
// Bajar fotos del servidor como mucho una vez por minuto por usuario: el diario se abre y se cierra a menudo.
export const INTERVALO_MS = 60 * 1000;
const _ultimaVez = new Map();
const _enCurso = new Set();

const _uuid = (s) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);

/** Sube la foto de una comida recién registrada. true si quedó en el servidor. */
export async function subirFotoDeComida(mealId, archivo) {
    if (!_uuid(mealId) || !(archivo instanceof Blob)) return false;
    try {
        const [foto, mini] = await Promise.all([
            reducirImagen(archivo, LADO_FOTO, CALIDAD_FOTO),
            reducirImagen(archivo, LADO_MINI, CALIDAD_MINI, true),
        ]);
        if (!foto) return false;
        const fd = new FormData();
        fd.append('foto', foto, 'foto.jpg');
        if (mini) fd.append('mini', mini, 'mini.jpg');
        const r = await fetchWithAuth(`/api/diary/meal/${mealId}/photo`, { method: 'POST', body: fd });
        if (!r.ok) return false;
        // El servidor pone la foto en el mensaje del chat en segundo plano (espera al puente): se avisa al chat dos
        // veces para que la recoja sin recargar.
        if (typeof window !== 'undefined') {
            for (const ms of [4000, 12000]) {
                setTimeout(() => { try { window.dispatchEvent(new Event('mealfit:refresh-chat')); } catch { /* nada */ } }, ms);
            }
        }
        return true;
    } catch {
        return false;
    }
}

const MAX_SUBIDAS_POR_PASADA = 8;
const _fallos = new Map();
const _claveIntentadas = (userId) => `mealfit_fotos_subidas:${userId}`;
function _intentadas(userId) {
    try {
        const v = JSON.parse(localStorage.getItem(_claveIntentadas(userId)) || '[]');
        return new Set(Array.isArray(v) ? v : []);
    } catch { return new Set(); }
}
function _marcarIntentada(userId, set, mealId) {
    set.add(mealId);
    try { localStorage.setItem(_claveIntentadas(userId), JSON.stringify([...set].slice(-500))); } catch { /* nada */ }
}

/** Sube las fotos del escáner que este dispositivo tiene y el servidor no. Devuelve cuántas subió. */
export async function subirFotosPendientes(userId, comidasConFotoEnServidor, locales) {
    if (!userId || userId === 'guest') return 0;
    const intentadas = _intentadas(userId);
    let subidas = 0;
    let intentos = 0;
    for (const mealId of locales) {
        if (intentos >= MAX_SUBIDAS_POR_PASADA) break;
        if (!_uuid(mealId) || comidasConFotoEnServidor.has(mealId) || intentadas.has(mealId)) continue;
        const delEscaner = (await leerFotosDeComida(userId, mealId, 'foto')).filter((f) => !f.id && f.blob);
        if (!delEscaner.length) { _marcarIntentada(userId, intentadas, mealId); continue; }
        intentos += 1;
        if (await subirFotoDeComida(mealId, delEscaner[0].blob)) {
            subidas += 1;
            _marcarIntentada(userId, intentadas, mealId);
        } else {
            // Sin red se reintenta en la siguiente pasada; a la 3.ª (p. ej. comida borrada en otro dispositivo,
            // que el servidor rechaza siempre) se deja.
            const n = (_fallos.get(mealId) || 0) + 1;
            _fallos.set(mealId, n);
            if (n >= 3) _marcarIntentada(userId, intentadas, mealId);
        }
    }
    return subidas;
}

/** Baja al dispositivo las fotos del servidor de las comidas que aquí no tienen ninguna. Devuelve cuántas guardó. */
export async function traerFotosDelServidor(userId, { ahora = Date.now(), forzar = false } = {}) {
    if (!userId || userId === 'guest' || _enCurso.has(userId)) return 0;
    if (!forzar && ahora - (_ultimaVez.get(userId) || 0) < INTERVALO_MS) return 0;
    _ultimaVez.set(userId, ahora);
    _enCurso.add(userId);
    let guardadas = 0;
    try {
        const r = await fetchWithAuth('/api/diary/meal-photos');
        if (!r.ok) return 0;
        const data = await r.json().catch(() => null);
        const fotos = Array.isArray(data?.photos) ? data.photos : [];
        const locales = await idsConFoto(userId);
        const enServidor = new Set(fotos.map((f) => f?.meal_id).filter(_uuid));
        await subirFotosPendientes(userId, enServidor, locales).catch(() => 0);
        if (!fotos.length) return 0;
        const porComida = new Map();
        for (const f of fotos) {
            if (!_uuid(f?.meal_id) || !_uuid(f?.id) || typeof f?.url !== 'string') continue;
            if (!f.url.startsWith(`/api/diary/meal-photo/${f.id}`)) continue;   // solo URLs de este endpoint
            if (locales.has(f.meal_id)) continue;
            if (!porComida.has(f.meal_id)) porComida.set(f.meal_id, []);
            porComida.get(f.meal_id).push(f);
        }
        for (const [mealId, lista] of porComida) {
            let primera = true;
            for (const f of lista.slice(0, 4)) {
                const rb = await fetchWithAuth(f.url).catch(() => null);
                const blob = rb && rb.ok ? await rb.blob().catch(() => null) : null;
                if (!(blob instanceof Blob)) continue;
                if (await guardarFotoDeComida(userId, mealId, blob, { attachmentId: `srv:${f.id}`, anexar: !primera })) {
                    primera = false;
                    guardadas += 1;
                }
            }
        }
        return guardadas;
    } catch {
        return guardadas;
    } finally {
        _enCurso.delete(userId);
    }
}

/** Solo para pruebas. */
export function _reiniciarParaPruebas() {
    _ultimaVez.clear();
    _fallos.clear();
    _enCurso.clear();
}
