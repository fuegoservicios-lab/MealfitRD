// frontend/src/utils/adminCuentas.js
// [P1-PLAN-LOTE-833 · 2026-09-29] Lo que comparten la lista de cuentas y la ficha ampliada del panel /admin (spec
// docs/superpowers/specs/2026-09-29-admin-cuentas-actividad-pruebas-design.md): la petición con la cabecera de acción,
// las URLs de la lista y del CSV (contratos 1 y 2), el nombre del archivo del CSV y el formato de fechas, cifras e
// importes. Panel interno —solo el dueño, solo español—: los nombres fijos llevan su marca de exención de i18n.
import { fetchWithAuth } from '../config/api';
import { formatDate, formatNumber } from '../i18n';

/** Los POST del panel la llevan: el servidor rechaza (403) una escritura del admin sin ella. */
export const CABECERA_ACCION = { 'Content-Type': 'application/json', 'X-Admin-Accion': '1' };

/**
 * GET sin cuerpo; POST con él y la cabecera de acción. Un fallo lanza un `Error` con `status` y `detalle` (el código
 * del servidor, p. ej. `salio_ella`); su mensaje es el `detail` si es texto.
 * [P1-PLAN-LOTE-834 · 2026-09-29] `signal` opcional: el detalle de prueba aborta la petición de la pestaña o del rango
 * que se deja atrás (sin él, las llamadas de siempre van igual).
 */
export async function pedirAdmin(url, cuerpo, { signal } = {}) {
    const opciones = cuerpo === undefined ? {} : { method: 'POST', headers: CABECERA_ACCION, body: JSON.stringify(cuerpo) };
    if (signal) opciones.signal = signal;
    const r = await fetchWithAuth(url, opciones);
    let datos = null;
    try { datos = await r.json(); } catch { /* respuesta sin cuerpo */ }
    if (!r.ok) {
        const detalle = datos && typeof datos.detail === 'string' ? datos.detail : null;
        const error = new Error(detalle || `Error ${r.status}`);
        error.status = r.status;
        error.detalle = detalle;
        throw error;
    }
    return datos;
}

/** Contrato 1: `GET /api/admin/cuentas` (50 por página). */
export const urlCuentas = ({ buscar = '', orden = 'actividad', filtro = 'todas', pagina = 1 } = {}) =>
    `/api/admin/cuentas?${new URLSearchParams({ buscar, orden, filtro, pagina: String(pagina) })}`;

/** Contrato 2: el CSV con los mismos filtros que la lista, sin página. */
export const urlCsvCuentas = ({ buscar = '', orden = 'actividad', filtro = 'todas' } = {}) =>
    `/api/admin/cuentas.csv?${new URLSearchParams({ buscar, orden, filtro })}`;

/** El nombre que manda el servidor en `Content-Disposition` (sin rutas), o `null`. */
export function nombreDeArchivo(disposicion) {
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(String(disposicion || ''));
    if (!m) return null;
    let nombre = m[1];
    try { nombre = decodeURIComponent(nombre); } catch { /* ya venía sin codificar */ }
    nombre = nombre.replace(/[\\/]/g, '_').trim();
    return nombre || null;
}

/** `cuentas-AAAAMMDD.csv` con la fecha del dispositivo: el respaldo si el servidor no nombra el archivo. */
export function nombreCsvDeHoy(ahora = new Date()) {
    const d = `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}`;
    return `cuentas-${d}.csv`;
}

const FORMATO_FECHA = { day: 'numeric', month: 'short', year: 'numeric' };
const FORMATO_FECHA_HORA = { ...FORMATO_FECHA, hour: '2-digit', minute: '2-digit' };

export const fecha = (iso) => (iso ? formatDate(iso, FORMATO_FECHA) || '—' : '—');
export const fechaHora = (iso) => (iso ? formatDate(iso, FORMATO_FECHA_HORA) || '—' : '—');
/** Importes en US$ con 2 decimales, como el resto del panel («US$0.28»). */
export const usd = (n) => `US$${(Number.isFinite(Number(n)) ? Number(n) : 0).toFixed(2)}`;
/** Una cifra con el formato del idioma activo; lo que no es cifra sale «—». */
export const cifra = (n, decimales = 0) => {
    if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '—';
    return formatNumber(Number(n), { maximumFractionDigits: decimales }) || '—';
};

// [I18N-EXEMPT: panel interno del dueño, solo español]
export const NOMBRE_PLAN = { gratis: 'Gratis', basic: 'Básico', plus: 'Plus', ultra: 'Max', admin: 'Administración' };
// [I18N-EXEMPT: panel interno del dueño, solo español]
export const NOMBRE_MODO = { plan: 'Plan', tracking: 'Seguimiento' };

/**
 * [P1-PLAN-LOTE-833 · 2026-09-29, ronda 1] ¿La cuenta está marcada AHORA? El bloque `prueba` puede venir con
 * `estado: "sin_marca"` (hubo marcas, ninguna viva: la quitó el equipo o salió la persona) para enseñar su historial:
 * eso NO es una cuenta de prueba (sin etiqueta «Prueba», se puede volver a marcar).
 */
export const marcaViva = (prueba) => Boolean(prueba) && prueba.estado !== 'sin_marca';

// [I18N-EXEMPT: panel interno del dueño, solo español] «web» es nombre común; los otros dos, propios.
const NOMBRE_PLATAFORMA = { web: 'web', ios: 'iOS', android: 'Android' };
// [I18N-EXEMPT: panel interno del dueño, solo español]
const PLATAFORMA_AL_INICIO = { web: 'Web' };
/** `["web","android"]` o `"android,web"` → «Web, Android» / «Android, web». Lo que no conoce sale tal cual. */
export function nombresDePlataformas(valor) {
    const lista = (Array.isArray(valor) ? valor : String(valor ?? '').split(','))
        .map((p) => String(p).trim()).filter(Boolean);
    return lista.map((p, i) => {
        const k = p.toLowerCase();
        return (i === 0 && PLATAFORMA_AL_INICIO[k]) || NOMBRE_PLATAFORMA[k] || p;
    }).join(', ');
}

function nombreIntl(tipo, codigo) {
    if (!codigo || typeof codigo !== 'string') return null;
    try {
        return new Intl.DisplayNames(['es'], { type: tipo }).of(codigo) || codigo;
    } catch {
        return codigo;
    }
}
/** «DO» → «República Dominicana». Lo que Intl no conoce sale tal cual. */
export const nombrePais = (codigo) => nombreIntl('region', codigo);
/** «es-DO» → «español (República Dominicana)». */
export const nombreIdioma = (codigo) => nombreIntl('language', codigo);
