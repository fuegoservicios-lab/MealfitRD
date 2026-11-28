// [P1-PLAN-LOTE-117 · 2026-09-19] Las fotos del chat, cargadas de forma que SIEMPRE se puedan autenticar.
//
// EL DEFECTO («las imágenes aparecen que no están disponibles en móviles»). El backend entrega los adjuntos como
// ruta RELATIVA (`/api/chat/attachments/<id>`), protegida por la sesión del dueño. Un `<img src>` no puede mandar
// cabeceras, así que dependía de DOS cosas que en el teléfono no se cumplen:
//   · que la ruta relativa resuelva contra el backend — en la app nativa resuelve contra `capacitor://localhost`;
//   · que viaje una cookie de sesión — la app nativa se autentica con `Authorization`/`X-MF-Session`, y en la PWA de
//     iOS la cookie no sobrevive al reabrir (P1-FIRST-PARTY-SESSION).
// Resultado: 404/403 → `onError` → «Imagen no disponible». En el navegador de escritorio la cookie viaja y se veía.
//
// CÓMO. `fetchWithAuth` (que sí pone las cabeceras y la base absoluta) trae los bytes y la foto se pinta desde un
// `blob:`. En la app nativa es el camino directo; en la web se intenta primero el `<img>` de siempre —caché del
// navegador, carga diferida— y solo si FALLA se reintenta autenticado antes de dar la foto por perdida.
// `data:` y `blob:` (la miniatura y la vista previa locales) no pasan por aquí.
import { useEffect, useState } from 'react';
import { fetchWithAuth } from '../config/api';
import { isNativeApp } from '../config/platform';

const MAX_EN_CACHE = 60;
const _CHAT_IMG_CACHE_STORAGE = 'mealfit-chat-img-v1';
const _cache = new Map(); // ruta sin query (la firma caduca; el adjunto no) → blob:
const _enVuelo = new Map(); // clave → Promise<string> (deduplica peticiones simultáneas)

export const claveDeImagen = (url) => String(url || '').split('?')[0];
export const esRutaDelBackend = (url) => typeof url === 'string' && url.startsWith('/api/');

function guardar(clave, objectUrl) {
    _cache.set(clave, objectUrl);
    while (_cache.size > MAX_EN_CACHE) {
        const [vieja, viejaUrl] = _cache.entries().next().value;
        _cache.delete(vieja);
        try { URL.revokeObjectURL(viejaUrl); } catch { /* noop */ }
    }
}

async function _leerDeCacheStorage(clave) {
    if (typeof caches === 'undefined' || !caches?.open) return null;
    try {
        const store = await caches.open(_CHAT_IMG_CACHE_STORAGE);
        const match = await store.match(clave);
        if (!match) return null;
        const blob = await match.blob();
        if (!blob || blob.size === 0) return null;
        const objectUrl = URL.createObjectURL(blob);
        guardar(clave, objectUrl);
        return objectUrl;
    } catch {
        return null;
    }
}

async function _guardarEnCacheStorage(clave, blob, contentType) {
    if (typeof caches === 'undefined' || !caches?.open || !blob) return;
    try {
        const store = await caches.open(_CHAT_IMG_CACHE_STORAGE);
        await store.put(
            clave,
            new Response(blob, {
                status: 200,
                headers: { 'Content-Type': contentType || blob.type || 'image/jpeg' },
            })
        );
    } catch { /* best-effort */ }
}

function _cargarAutenticadaUnica(url) {
    const clave = claveDeImagen(url);
    if (_cache.has(clave)) return Promise.resolve(_cache.get(clave));
    if (_enVuelo.has(clave)) return _enVuelo.get(clave);

    const p = (async () => {
        const desdeDisco = await _leerDeCacheStorage(clave);
        if (desdeDisco) return desdeDisco;
        const r = await fetchWithAuth(url);
        if (!r.ok) throw new Error(`imagen_${r.status}`);
        const blob = await r.blob();
        const objectUrl = URL.createObjectURL(blob);
        guardar(clave, objectUrl);
        void _guardarEnCacheStorage(clave, blob, r.headers?.get?.('content-type'));
        return objectUrl;
    })().finally(() => {
        _enVuelo.delete(clave);
    });
    _enVuelo.set(clave, p);
    return p;
}

/** Precalienta las fotos más recientes del hilo en paralelo sin bloquear la UI. */
export function precargarImagenesDelChat(urls, { limit = 6 } = {}) {
    const lista = [];
    const vistas = new Set();
    for (const u of urls || []) {
        if (typeof u !== 'string' || !u || u.startsWith('blob:') || u.startsWith('data:')) continue;
        const c = claveDeImagen(u);
        if (!c || vistas.has(c)) continue;
        vistas.add(c);
        lista.push(u);
        if (lista.length >= limit) break;
    }
    if (!lista.length) return;
    const nativa = isNativeApp();
    for (const u of lista) {
        if (esRutaDelBackend(u) && nativa) {
            void _cargarAutenticadaUnica(u).catch(() => {});
        } else if (typeof Image !== 'undefined') {
            try {
                const img = new Image();
                img.decoding = 'async';
                img.src = u;
            } catch { /* noop */ }
        }
    }
}

/** Solo para tests. */
export function _vaciarCacheDeImagenes() { _cache.clear(); _enVuelo.clear(); }

/**
 * @returns {{ src: string|null, error: boolean, onError: () => void }}
 *   `src` null = todavía cargando · `onError` va al `<img>`: en la web dispara el reintento autenticado.
 */
export function useChatImageSrc(url) {
    const delBackend = esRutaDelBackend(url);
    const clave = claveDeImagen(url);
    const [falloDirecto, setFalloDirecto] = useState(null); // clave cuyo <img> directo falló
    const [resultado, setResultado] = useState(null); // { clave, src } | { clave, error: true }
    const autenticada = delBackend && (isNativeApp() || falloDirecto === clave);
    const enCache = autenticada ? _cache.get(clave) : null;

    useEffect(() => {
        if (!autenticada || _cache.has(clave)) return undefined;
        let vivo = true;
        _cargarAutenticadaUnica(url)
            .then((objectUrl) => {
                if (vivo) setResultado({ clave, src: objectUrl });
            })
            .catch(() => {
                if (vivo) setResultado({ clave, error: true });
            });
        return () => { vivo = false; };
    }, [autenticada, clave, url]);

    if (!autenticada) {
        return {
            src: url || null,
            error: false,
            onError: () => { if (delBackend) setFalloDirecto(clave); else setResultado({ clave, error: true }); },
            // fuera del backend (data:/blob:/http): un fallo es definitivo
            definitivo: !delBackend && resultado?.clave === clave && resultado.error === true,
        };
    }
    const mio = resultado?.clave === clave ? resultado : null;
    return {
        src: enCache || mio?.src || null,
        error: mio?.error === true,
        onError: () => setResultado({ clave, error: true }),
        definitivo: mio?.error === true,
    };
}
