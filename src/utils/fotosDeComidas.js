// [P1-PLAN-LOTE-721 · 2026-09-28] La foto de un plato registrado con el escáner, guardada SOLO en este dispositivo.
//
// El dueño pidió ver «las imágenes de los platos» del contador. El servidor no las tiene, y no por olvido: la
// Política de Privacidad publicada dice «No retenemos la imagen una vez procesada» y la de IA «La foto no se conserva
// una vez analizada». Guardarlas allí exige cambiar la política (decisión del dueño). [FUSIÓN legal ronda 2 · 2026-09-28]
// Ya no lo dicen así: la foto del ESCÁNER no se guarda en el servidor, las del CHAT sí (chat_attachments) y esta copia
// del dispositivo figura en Privacidad §13. Guardar en el servidor la del escáner sigue exigiendo cambiar la política.
// Aquí se guardan en el teléfono del usuario (IndexedDB), la ficha lo dice («Solo en este dispositivo»), y el servidor sigue sin retener nada.
//
// Reglas:
//  · La clave lleva el usuario (`<userId>:<mealId>`) y toda lectura lo comprueba: la app jamás pinta la foto de una
//    cuenta en otra. Por eso el cierre de sesión NO las borra (lo que limpia `_clearUserScopedCaches` son cachés SIN
//    usuario en la clave); borrar la CUENTA sí (`borrarFotosDelUsuario`).
//  · Borrar la comida borra su foto (los dos caminos de borrar: la papelera de la fila y la ficha).
//  · Retención: 90 días (lo que enseña el cajón de días anteriores) y 400 fotos como máximo en el dispositivo; al
//    guardar se poda lo más viejo, leyendo SOLO claves (un cursor de claves no carga los blobs).
//  · Dos tamaños: la foto (1024 px de lado, lo mismo que se sube al análisis) y la miniatura cuadrada de 160 px de la
//    fila. Un formato que el navegador no sabe pintar (HEIC en el escritorio) no se guarda: sin foto, no una rota.
//  · Nada de esto lanza hacia la interfaz: sin IndexedDB (modo privado, cuota llena) la ficha sale sin foto.
export const EVENTO_FOTOS_DE_COMIDAS = 'mealfit:fotos-de-comidas';
export const RETENCION_DIAS = 90;
export const MAX_FOTOS = 400;

const DB_NOMBRE = 'bioboros-fotos-de-comidas';
const DB_VERSION = 1;
const ALMACEN = 'fotos';
const LADO_FOTO = 1024;
const CALIDAD_FOTO = 0.8;
const LADO_MINI = 160;
const CALIDAD_MINI = 0.72;

const _clave = (userId, mealId) => `${userId}:${mealId}`;
const _valido = (v) => typeof v === 'string' && v.length > 0 && v !== 'guest';

let _db = null;

function _abrir() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (_db) return _db;
    _db = new Promise((resolve) => {
        let req;
        try {
            req = indexedDB.open(DB_NOMBRE, DB_VERSION);
        } catch {
            resolve(null);
            return;
        }
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(ALMACEN)) {
                const s = db.createObjectStore(ALMACEN, { keyPath: 'clave' });
                s.createIndex('userId', 'userId', { unique: false });
                s.createIndex('creada', 'creada', { unique: false });
            }
        };
        req.onsuccess = () => {
            const db = req.result;
            // Safari (iOS) puede cerrar la conexión con la app en segundo plano («Connection to Indexed Database server
            // lost»): se olvida la cacheada para que la próxima operación abra otra en vez de fallar hasta recargar.
            db.onclose = () => { _db = null; };
            db.onversionchange = () => { db.close(); _db = null; };
            resolve(db);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
    }).then((db) => {
        if (!db) _db = null;   // que el próximo intento vuelva a probar
        return db;
    });
    return _db;
}

/** Corre `fn(almacen)` en una transacción. `{ valor }` al completarse (una petición → su `result`; un `delete`
 *  completa con `valor: undefined`, que NO es un fallo), o null si la transacción falló o no hay base. */
async function _conAlmacen(modo, fn, reintento = true) {
    const db = await _abrir();
    if (!db) return null;
    return new Promise((resolve) => {
        let tx;
        let peticion;
        try {
            tx = db.transaction(ALMACEN, modo);
            peticion = fn(tx.objectStore(ALMACEN));
        } catch (e) {
            // una conexión que se estaba cerrando (InvalidStateError): una vez, con otra conexión
            if (reintento && e && e.name === 'InvalidStateError') {
                _db = null;
                resolve(_conAlmacen(modo, fn, false));
                return;
            }
            resolve(null);
            return;
        }
        tx.oncomplete = () => {
            const valor = peticion && typeof peticion === 'object' && 'result' in peticion ? peticion.result : peticion;
            resolve({ valor });
        };
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
    });
}

function _avisar(userId) {
    try {
        window.dispatchEvent(new CustomEvent(EVENTO_FOTOS_DE_COMIDAS, { detail: { userId } }));
    } catch { /* sin window */ }
}

// Tope del reescalado: un navegador que no llega a decodificar la imagen (ni `onload` ni `onerror`) no puede dejar
// colgado el guardado —ni la promesa del escáner que lo lanzó—.
const TOPE_DECODIFICAR_MS = 15000;

/** Reescala a JPEG. `cuadrado`: recorta al centro un cuadrado de `lado` (la miniatura de la fila). null si no pudo. */
export function reducirImagen(archivo, lado, calidad, cuadrado = false) {
    return new Promise((resolveOriginal) => {
        if (typeof document === 'undefined' || !(archivo instanceof Blob)) {
            resolveOriginal(null);
            return;
        }
        let hecho = false;
        const tope = setTimeout(() => resolve(null), TOPE_DECODIFICAR_MS);
        function resolve(v) {
            if (hecho) return;
            hecho = true;
            clearTimeout(tope);
            resolveOriginal(v);
        }
        let url;
        try {
            url = URL.createObjectURL(archivo);
        } catch {
            resolve(null);
            return;
        }
        const img = new Image();
        img.onload = () => {
            try {
                const w0 = img.naturalWidth || img.width;
                const h0 = img.naturalHeight || img.height;
                if (!w0 || !h0) {
                    resolve(null);
                    return;
                }
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (cuadrado) {
                    const corte = Math.min(w0, h0);
                    const n = Math.max(1, Math.min(lado, corte));
                    canvas.width = n;
                    canvas.height = n;
                    ctx.drawImage(img, (w0 - corte) / 2, (h0 - corte) / 2, corte, corte, 0, 0, n, n);
                } else {
                    const escala = Math.min(1, lado / Math.max(w0, h0));
                    canvas.width = Math.max(1, Math.round(w0 * escala));
                    canvas.height = Math.max(1, Math.round(h0 * escala));
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                }
                canvas.toBlob((b) => resolve(b || null), 'image/jpeg', calidad);
            } catch {
                resolve(null);
            } finally {
                URL.revokeObjectURL(url);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

/** Qué claves podar: las de más de `RETENCION_DIAS` y, del resto, las más viejas por encima de `MAX_FOTOS`.
 *  `entradas` = [{ clave, creada }] en orden ascendente de `creada`. Pura: se prueba sin IndexedDB. */
export function clavesAPodar(entradas, ahora = Date.now(), dias = RETENCION_DIAS, max = MAX_FOTOS) {
    const limite = ahora - dias * 86400000;
    const lista = Array.isArray(entradas) ? entradas : [];
    const viejas = lista.filter((e) => Number(e.creada) < limite).map((e) => e.clave);
    const vivas = lista.filter((e) => !(Number(e.creada) < limite));
    const sobran = Math.max(0, vivas.length - max);
    return [...viejas, ...vivas.slice(0, sobran).map((e) => e.clave)];
}

async function _podar() {
    const entradas = [];
    const db = await _abrir();
    if (!db) return;
    await new Promise((resolve) => {
        try {
            const tx = db.transaction(ALMACEN, 'readonly');
            const cursor = tx.objectStore(ALMACEN).index('creada').openKeyCursor();
            cursor.onsuccess = () => {
                const c = cursor.result;
                if (!c) return;
                entradas.push({ clave: c.primaryKey, creada: c.key });
                c.continue();
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
    const fuera = clavesAPodar(entradas);
    if (!fuera.length) return;
    await _conAlmacen('readwrite', (s) => {
        fuera.forEach((k) => s.delete(k));
        return true;
    });
}

/** Guarda la foto de la comida `mealId`. true si quedó guardada. */
export async function guardarFotoDeComida(userId, mealId, archivo) {
    if (!_valido(userId) || !_valido(mealId) || !(archivo instanceof Blob)) return false;
    if (!(await _abrir())) return false;   // sin base (modo privado, cuota) ni se decodifica
    const [foto, mini] = await Promise.all([
        reducirImagen(archivo, LADO_FOTO, CALIDAD_FOTO),
        reducirImagen(archivo, LADO_MINI, CALIDAD_MINI, true),
    ]);
    if (!foto || !mini) return false;
    const ok = await _conAlmacen('readwrite', (s) => s.put({
        clave: _clave(userId, mealId), userId, mealId, foto, mini, creada: Date.now(),
    }));
    if (ok === null) return false;
    await _podar();
    _avisar(userId);
    return true;
}

/** La foto (`'foto'`) o la miniatura (`'mini'`) de la comida, o null. */
export async function leerFotoDeComida(userId, mealId, tipo = 'foto') {
    if (!_valido(userId) || !_valido(mealId)) return null;
    const reg = (await _conAlmacen('readonly', (s) => s.get(_clave(userId, mealId))))?.valor;
    if (!reg || reg.userId !== userId) return null;
    const blob = tipo === 'mini' ? reg.mini : reg.foto;
    return blob instanceof Blob ? blob : null;
}

/** Los `mealId` de este usuario que tienen foto en el dispositivo (solo claves: no carga imágenes). */
export async function idsConFoto(userId) {
    if (!_valido(userId)) return new Set();
    const claves = (await _conAlmacen('readonly', (s) => s.index('userId').getAllKeys(userId)))?.valor;
    const prefijo = `${userId}:`;
    return new Set((Array.isArray(claves) ? claves : [])
        .filter((k) => typeof k === 'string' && k.startsWith(prefijo))
        .map((k) => k.slice(prefijo.length)));
}

export async function borrarFotoDeComida(userId, mealId) {
    if (!_valido(userId) || !_valido(mealId)) return;
    const hecho = await _conAlmacen('readwrite', (s) => s.delete(_clave(userId, mealId)));
    if (hecho !== null) _avisar(userId);
}

/** Al borrar la cuenta: todas las fotos de ese usuario en este dispositivo. */
export async function borrarFotosDelUsuario(userId) {
    if (!_valido(userId)) return;
    const claves = (await _conAlmacen('readonly', (s) => s.index('userId').getAllKeys(userId)))?.valor;
    if (!Array.isArray(claves) || !claves.length) return;
    await _conAlmacen('readwrite', (s) => {
        claves.forEach((k) => s.delete(k));
        return true;
    });
    _avisar(userId);
}
