// [P1-PLAN-LOTE-1055 · 2026-11-17] Formateadores de `Intl` reutilizados.
//
// `formatDate`/`formatNumber` construían un `Intl.DateTimeFormat`/`Intl.NumberFormat` NUEVO en cada llamada, y lo caro
// de `Intl` es construirlo (resolver locale y opciones), no formatear. Medido en el chat (arnés de producción, CPU ×4):
// `formatDate` era la función con más tiempo propio de la página mientras se escribía y mientras llegaba la respuesta del
// coach — la lista de chats y la hora de cada burbuja lo llaman en cada pintada.
//
// Mismo resultado byte a byte: un formateador con el mismo locale y las mismas opciones formatea igual. La clave lleva
// el locale, así que cambiar de idioma no reutiliza el del idioma anterior. El huso horario se fija al construir: la
// caché se vacía al volver a la app (`visibilitychange`), que es cuando un viaje pudo cambiarlo.
const _cache = new Map();
const _TOPE = 200;   // opciones distintas que se usan de verdad: unas decenas

let _escuchando = false;
function _vaciarAlVolver() {
    if (_escuchando || typeof document === 'undefined') return;
    _escuchando = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _cache.clear();
    });
}

function _clave(tipo, locale, options) {
    let opciones = '';
    if (options) {
        try { opciones = JSON.stringify(options); } catch { return null; }
    }
    return `${tipo}|${locale}|${opciones}`;
}

function _reutilizado(tipo, Ctor, locale, options) {
    const clave = _clave(tipo, locale, options);
    if (clave === null) return new Ctor(locale, options);
    let f = _cache.get(clave);
    if (!f) {
        f = new Ctor(locale, options);   // si las opciones no valen, lanza aquí y no se guarda nada
        if (_cache.size >= _TOPE) _cache.clear();
        _cache.set(clave, f);
        _vaciarAlVolver();
    }
    return f;
}

export const formateadorDeFecha = (locale, options) => _reutilizado('fecha', Intl.DateTimeFormat, locale, options);
export const formateadorDeNumero = (locale, options) => _reutilizado('numero', Intl.NumberFormat, locale, options);

/** Solo para pruebas. */
export function _vaciarFormateadores() { _cache.clear(); }
export const _tamanoDeLaCache = () => _cache.size;
