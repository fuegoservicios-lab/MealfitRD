// frontend/src/pages/AdminPruebaDetalle.jsx
// [P1-PLAN-LOTE-834 · 2026-09-29] El detalle de una cuenta de PRUEBA en el panel /admin (spec
// docs/superpowers/specs/2026-09-29-admin-cuentas-actividad-pruebas-design.md §4.4, §4.5, §13.4; contrato 9). Se abre
// desde la ficha («Ver detalle») como ESTADO de la página, sin rutas: `/admin` es una ruta exacta.
//   · Cinco pestañas —Formulario · Comidas · Planes · Conversaciones · Actividad— y solo la abierta está montada: cada
//     una se pide AL ABRIRLA y otra vez cada vez que se abre. Sin caché a propósito: cada vista deja su fila en el
//     registro de accesos y una marca quitada (por el equipo o por la persona) corta la vista siguiente.
//   · Activación MANUAL (patrón ARIA de pestañas): las flechas, Inicio y Fin mueven el foco; el clic, Intro o Espacio
//     abren. Pasar por una pestaña con el teclado no la consulta (ni deja una fila en el registro).
//   · 409 `aviso_pendiente` ⇒ «Esperando a que vea el aviso en la app» (§13.4); 403 ⇒ «Esta cuenta ya no es de prueba».
//     [ronda 1] Se decide por el CÓDIGO del servidor (`aviso_pendiente` / `no_es_prueba`) y, si falta, por el estado HTTP.
//     Si lo dice un HIJO de la pestaña (el hilo de una conversación, los días de un plan) no se queda dentro de él: sube al
//     detalle entero, que desmonta los paneles —con su lista y sus vistas previas— y pinta ese mismo aviso en todas las
//     pestañas. Vale hasta «Comprobar otra vez» (409) o hasta volver a la ficha y reabrir el detalle.
//   · Lo que manda el servidor se pinta SIEMPRE como texto: los mensajes del chat traen markdown o HTML y se enseñan
//     tal cual, con sus saltos de línea; el formulario crudo va plegado, como JSON.
//   · Las fotos del chat se piden al endpoint de adjuntos con la sesión (`fetchWithAuth`: el token nunca va en un
//     `src`), se pintan desde un blob y se liberan al cerrar el hilo, cambiar de pestaña o salir del detalle.
//   · La petición de la pestaña, del rango o del hilo que se deja atrás se aborta: una respuesta vieja nunca pinta
//     sobre la nueva.
// Solo lectura. Interno —solo el dueño, solo español—: los textos fijos viven en TEXTOS y en las tablas de abajo.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { fetchWithAuth } from '../config/api';
import { formatDate } from '../i18n';
import { cifra, fecha, fechaHora, pedirAdmin, usd } from '../utils/adminCuentas';
import comun from './AdminCuentas.module.css';
import styles from './AdminPruebaDetalle.module.css';

// [I18N-EXEMPT: panel interno del dueño, solo español]
const TEXTOS = {
    titulo: (correo) => `Cuenta de prueba · ${correo}`,
    soloLectura: 'Solo lectura. Cada pestaña que abres queda anotada en el registro de accesos.',
    pestanas: 'Secciones del detalle',
    cargando: 'Cargando…',
    reintentar: 'Reintentar',
    comprobar: 'Comprobar otra vez',
    avisoPendiente: 'Esperando a que vea el aviso en la app.',
    avisoPendienteAyuda: 'Su contenido se abre cuando la persona vea en la app el aviso de cuenta de prueba. Los números y los ajustes ya están en la ficha.',
    noEsPrueba: 'Esta cuenta ya no es de prueba.',
    noEsPruebaAyuda: 'Quitaron la marca (el equipo o la propia persona): su contenido ya no se puede ver. Los números y los ajustes siguen en la ficha.',
    noDisponible: 'Esta sección no está disponible: el interruptor de cuentas de prueba está apagado o la cuenta ya no existe.',
    sinRastro: 'No se pudo anotar la consulta en el registro de accesos, así que no se enseña nada. Inténtalo de nuevo.',
    demasiadas: 'Demasiadas consultas seguidas. Espera un momento e inténtalo de nuevo.',
    errorCarga: 'No se pudo cargar esta sección.',
    si: 'Sí',
    no: 'No',
    sinNombre: 'Sin nombre',
    // Formulario
    formulario: 'Lo que indicó en el formulario',
    otrosCampos: 'Otros datos',
    sinCampos: 'El formulario está vacío.',
    crudo: 'Ver el formulario en crudo (JSON)',
    memoria: 'Lo que el coach recuerda',
    sinMemoria: 'El coach no recuerda nada de esta cuenta todavía.',
    guardado: (f) => `Guardado el ${f}`,
    relevancia: (r) => `relevancia ${r}`,
    // Comidas y días
    periodoComidas: 'Periodo de las comidas',
    ultimos: (d) => `Últimos ${d} días`,
    rango: (desde, hasta, n) => `Del ${desde} al ${hasta} · ${n}`,
    nComidas: (n) => (n === 1 ? '1 comida' : `${n} comidas`),
    sinComidas: 'No registró comidas en este periodo.',
    cabeceraDia: (dia, n, kcal) => `${dia} · ${n} · ${kcal} kcal`,
    kcal: (n) => `${n} kcal`,
    gramos: (nombre, n) => `${nombre} ${n} g`,
    macro: { proteina: 'Proteína', carbohidratos: 'Carbohidratos', grasas: 'Grasas' },
    delPlan: (dia, comida) => `Plan: día ${dia}, comida ${comida}`,
    refPlan: (ref) => `Plan: ${ref}`,
    origen: (o) => `Origen: ${o}`,
    // Planes
    sinPlanes: 'Todavía no tiene planes.',
    planSinNombre: 'Plan sin nombre',
    creado: (f) => `Creado el ${f}`,
    kcalDia: (n) => `${n} kcal al día`,
    nDias: (n) => (n === 1 ? '1 día' : `${n} días`),
    revision: (n) => `revisión ${n}`,
    bloques: (partes) => `Bloques: ${partes}`,
    sinBloques: 'Sin bloques en la cola.',
    verBloques: (n) => `Ver los bloques (${n})`,
    semana: (n) => `Semana ${n}`,
    empieza: (n) => `empieza en el día ${n}`,
    intentos: (n) => (n === 1 ? '1 intento' : `${n} intentos`),
    motivoFallo: (m) => `Motivo del fallo: ${m}`,
    verDias: 'Ver los días',
    ocultarDias: 'Ocultar los días',
    diaN: (n) => `Día ${n}`,
    sinDias: 'Este plan no tiene días.',
    diaVacio: 'Sin comidas este día.',
    ingredientes: 'Ingredientes',
    pasos: 'Pasos',
    planNoEncontrado: 'Este plan no es de esta cuenta o ya no existe.',
    // Conversaciones
    sinSesiones: 'No ha hablado con el coach todavía.',
    nMensajes: (n) => (n === 1 ? '1 mensaje' : `${n} mensajes`),
    nFotos: (n) => (n === 1 ? '1 foto' : `${n} fotos`),
    nNoUtiles: (n) => (n === 1 ? '1 respuesta marcada como no útil' : `${n} respuestas marcadas como no útiles`),
    ultimo: (f) => `último mensaje: ${f}`,
    sinTexto: '(sin texto)',
    volverConversaciones: 'Volver a las conversaciones',
    conversacionDel: (f) => `Conversación del ${f}`,
    mensajes: 'Mensajes',
    sinMensajes: 'Esta conversación no tiene mensajes.',
    hiloNoEncontrado: 'Esta conversación no es de esta cuenta o ya no existe.',
    persona: 'La persona',
    coach: 'El coach',
    feedback: { up: 'Marcada como útil', down: 'Marcada como no útil' },
    feedbackOtro: (v) => `Valoración: ${v}`,
    foto: 'Foto adjunta por la persona',
    fotoDe: (i, n) => `Foto adjunta por la persona (${i} de ${n})`,
    imagen: 'Imagen adjunta',
    cargandoFoto: 'Cargando la foto…',
    fotoFallo: 'No se pudo cargar la foto.',
    // Actividad
    periodoActividad: 'Periodo de la actividad',
    tiposEvento: 'Tipos de evento',
    tiposAyuda: 'Sin marcar ninguno, salen todos.',
    quitarFiltro: 'Quitar el filtro',
    gasto: (d, importe) => `Gasto de IA en estos ${d} días: ${importe}`,
    nEventos: (n) => (n === 1 ? '1 evento' : `${n} eventos`),
    tope: (n) => `${n} · solo los 500 más recientes: acota el periodo o los tipos`,
    sinEventos: 'Sin actividad en este periodo.',
};

// [I18N-EXEMPT: panel interno del dueño, solo español]
const PESTANAS = [
    ['formulario', 'Formulario'], ['comidas', 'Comidas'], ['planes', 'Planes'], ['conversaciones', 'Conversaciones'],
    ['actividad', 'Actividad'],
];
// [I18N-EXEMPT: panel interno del dueño, solo español] Contrato 9: `tipos` de la actividad, en ESTE orden.
const TIPOS_EVENTO = [
    ['comida', 'Comidas'], ['plan', 'Planes'], ['mensaje', 'Mensajes al coach'], ['bloque_fallido', 'Bloques fallidos'],
    ['ia', 'Uso de IA'], ['metrica', 'Métricas del flujo'], ['alerta', 'Alertas'], ['peso', 'Peso'], ['agua', 'Agua'],
    ['ajuste', 'Ajustes'],
];
// [I18N-EXEMPT: panel interno del dueño, solo español]
const NOMBRE_EVENTO = {
    comida: 'Comida', plan: 'Plan', mensaje: 'Mensaje al coach', bloque_fallido: 'Bloque fallido', ia: 'Uso de IA',
    metrica: 'Métrica del flujo', alerta: 'Alerta', peso: 'Peso', agua: 'Agua', ajuste: 'Ajuste',
};
// [I18N-EXEMPT: panel interno del dueño, solo español] `consumed_meals.meal_type` (canon en español; filas viejas en inglés).
const TIPO_COMIDA = {
    desayuno: 'Desayuno', almuerzo: 'Almuerzo', cena: 'Cena', merienda: 'Merienda', snack: 'Snack',
    breakfast: 'Desayuno', lunch: 'Almuerzo', dinner: 'Cena',
};
// [I18N-EXEMPT: panel interno del dueño, solo español] `consumed_meals.source` (ficha_comida.ORIGENES_DE_COMIDA).
const ORIGEN_COMIDA = {
    photo: 'Foto (escáner)', manual: 'Manual', estimate: 'Estimada por texto', plan_meal: 'Del plan («Me lo comí»)',
    chat: 'Desde el coach', repeat: 'Registrar otra vez',
};
// [I18N-EXEMPT: panel interno del dueño, solo español] `plan_data.generation_status`: [nombre, tono del chip].
const ESTADO_PLAN = {
    complete: ['Completo', 'bueno'], partial: ['Parcial', 'aviso'], complete_partial: ['Completo con huecos', 'aviso'],
    generating: ['Generándose', 'info'], in_progress: ['Generándose', 'info'], active: ['Activo', 'info'],
    failed: ['Falló', 'malo'], expired_pending_pantry: ['Caducó esperando la Nevera', 'malo'],
    paused_by_user: ['Pausado por la persona', 'neutro'], abandoned: ['Abandonado', 'neutro'],
};
// [I18N-EXEMPT: panel interno del dueño, solo español] `plan_chunk_queue.status`: [nombre, uno, varios], en este orden.
const ESTADO_BLOQUE = {
    completed: ['Completado', 'completado', 'completados'], processing: ['Generándose', 'generándose', 'generándose'],
    pending: ['En cola', 'en cola', 'en cola'],
    pending_user_action: ['Esperando a la persona', 'esperando a la persona', 'esperando a la persona'],
    stale: ['Atascado', 'atascado', 'atascados'], failed: ['Fallido', 'fallido', 'fallidos'],
    cancelled: ['Cancelado', 'cancelado', 'cancelados'],
};

const PERIODOS_COMIDAS = [7, 30, 90];
const PERIODOS_ACTIVIDAD = [7, 14, 30];
const TOPE_EVENTOS = 500;
const CLAVES_MACROS = {
    proteina: ['proteina', 'proteinas', 'protein', 'proteins', 'protein_g'],
    carbohidratos: ['carbohidratos', 'carbs', 'carbohydrates', 'carbs_g'],
    grasas: ['grasas', 'grasa', 'fats', 'fat', 'healthy_fats', 'fat_g'],
};
const FORMATO_HORA = { hour: '2-digit', minute: '2-digit' };
const FORMATO_DIA = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };

// ─── Formato: todo lo que llega se vuelve TEXTO (nunca HTML) y un tipo raro no revienta ──────────────────────────────
const esCifra = (v) => (typeof v === 'number' && Number.isFinite(v))
    || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
const objetos = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []);
const jsonCorto = (v) => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const jsonBonito = (v) => { try { return JSON.stringify(v, null, 2) ?? String(v); } catch { return String(v); } };
const texto = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    return typeof v === 'object' ? jsonCorto(v) : String(v);
};
const hora = (iso) => (iso ? formatDate(iso, FORMATO_HORA) || '—' : '—');
const diaLargo = (v) => (v ? formatDate(v, FORMATO_DIA) || '—' : '—');
/** «AAAA-MM-DD» del dispositivo (su fecha local, no la UTC). */
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** «AAAA-MM-DD» como día LOCAL: `new Date('2026-08-31')` es medianoche UTC y, visto desde RD, pinta el 30. */
function diaDeFecha(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
const fechaDia = (s) => fecha(diaDeFecha(s) || s);

/** `dias` días contando hoy: desde = hoy − (dias − 1). Así 90 cabe en el tope del servidor. */
function rangoDeDias(dias) {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1));
    return { desde: isoLocal(desde), hasta: isoLocal(hoy) };
}

/** Agrupa por día LOCAL, en el orden en que llegan (el servidor manda lo más nuevo primero). */
function porDia(items) {
    const grupos = new Map();
    for (const it of items) {
        const d = it.at ? new Date(it.at) : null;
        const clave = d && !Number.isNaN(d.getTime()) ? isoLocal(d) : '—';
        if (!grupos.has(clave)) grupos.set(clave, { clave, at: it.at || null, items: [] });
        grupos.get(clave).items.push(it);
    }
    return [...grupos.values()];
}

function agrupar(items, nombreDe) {
    const grupos = new Map();
    for (const it of items) {
        const nombre = nombreDe(it);
        if (!grupos.has(nombre)) grupos.set(nombre, { nombre, items: [] });
        grupos.get(nombre).items.push(it);
    }
    return [...grupos.values()];
}

function valorCampo(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? TEXTOS.si : TEXTOS.no;
    if (typeof v === 'number') return cifra(v, 2);
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
        const partes = v.filter((x) => x !== null && x !== undefined && x !== '').map((x) => (typeof x === 'object' ? jsonCorto(x) : String(x)));
        return partes.length > 0 ? partes.join(', ') : '—';
    }
    return jsonCorto(v);
}

function textoIngrediente(x) {
    if (typeof x === 'string') return x;
    if (x && typeof x === 'object') {
        const nombre = x.nombre ?? x.name ?? x.item ?? x.ingrediente;
        const cantidad = x.cantidad ?? x.quantity ?? x.qty ?? x.display_qty;
        if (nombre) return [cantidad, nombre].filter((p) => p !== null && p !== undefined && p !== '').join(' ');
    }
    return texto(x);
}
const listaTextos = (v) => {
    if (typeof v === 'string') return v.trim() ? [v] : [];
    return Array.isArray(v) ? v.map(textoIngrediente).filter(Boolean) : [];
};

function textoMacros(m) {
    return Object.keys(TEXTOS.macro)
        .filter((k) => esCifra(m[k]))
        .map((k) => TEXTOS.gramos(TEXTOS.macro[k], cifra(m[k], 1)))
        .join(' · ');
}
/** Las macros de una comida del plan: claves en español o inglés; si no se reconoce ninguna, el objeto tal cual. */
function macrosDelPlan(macros) {
    if (typeof macros === 'string') return macros;
    if (!macros || typeof macros !== 'object' || Array.isArray(macros)) return '';
    const m = {};
    for (const [k, alias] of Object.entries(CLAVES_MACROS)) {
        const clave = alias.find((a) => esCifra(macros[a]));
        if (clave) m[k] = macros[clave];
    }
    return textoMacros(m) || (Object.keys(macros).length > 0 ? jsonCorto(macros) : '');
}

/** `plan_ref` de «Me lo comí»: `{plan_id, day_index, meal_index}` con índices desde 0; se enseñan desde 1. */
function refDelPlan(ref) {
    if (ref && typeof ref === 'object' && esCifra(ref.day_index) && esCifra(ref.meal_index)) {
        return TEXTOS.delPlan(Number(ref.day_index) + 1, Number(ref.meal_index) + 1);
    }
    if (typeof ref === 'string' && ref) return TEXTOS.refPlan(ref);
    return null;
}

const nombreOrigen = (o) => ORIGEN_COMIDA[o] || TEXTOS.origen(texto(o));
const nombreTipoComida = (t) => TIPO_COMIDA[String(t).toLowerCase()] || texto(t);

function sentidoFeedback(v) {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).toLowerCase();
    if (['up', 'like', 'positive', '1', 'true'].includes(s)) return 'up';
    if (['down', 'dislike', 'negative', '-1', 'false'].includes(s)) return 'down';
    return 'otro';
}

function partesBloques(conteo) {
    const orden = Object.keys(ESTADO_BLOQUE);
    const claves = [...orden.filter((k) => k in conteo), ...Object.keys(conteo).filter((k) => !orden.includes(k))];
    return claves
        .filter((k) => esCifra(conteo[k]) && Number(conteo[k]) > 0)
        .map((k) => {
            const n = Number(conteo[k]);
            const nombres = ESTADO_BLOQUE[k];
            return `${cifra(n)} ${nombres ? nombres[n === 1 ? 1 : 2] : k}`;
        });
}

function lineaBloque(b) {
    const partes = [];
    if (esCifra(b.semana)) partes.push(TEXTOS.semana(cifra(b.semana)));
    if (esCifra(b.dias_offset)) partes.push(TEXTOS.empieza(cifra(Number(b.dias_offset) + 1)));
    partes.push(ESTADO_BLOQUE[b.estado]?.[0] || texto(b.estado));
    if (esCifra(b.intentos)) partes.push(TEXTOS.intentos(Number(b.intentos)));
    return partes.join(' · ');
}

function nombreDia(dia, i) {
    if (esCifra(dia)) return TEXTOS.diaN(cifra(dia));
    if (typeof dia === 'string' && dia) {
        const f = diaDeFecha(dia);
        return f ? diaLargo(f) : dia;
    }
    return TEXTOS.diaN(i + 1);
}

const sumaKcal = (comidas) => comidas.reduce((s, c) => s + (esCifra(c.kcal) ? Number(c.kcal) : 0), 0);

// ─── Petición de una sección ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * GET de una sección del detalle. Cambiar de `url` (o `recargar`) aborta la petición anterior: una respuesta vieja nunca
 * pinta sobre la nueva. `datos` puede ser aún la de la URL anterior mientras llega la nueva (se enseña atenuada);
 * `error` es solo el de la URL actual, y con un error no queda ningún dato de antes a la vista.
 */
function usePedido(url) {
    const [intento, setIntento] = useState(0);
    const [res, setRes] = useState(null);                   // { clave, datos, error }
    const clave = `${url}#${intento}`;
    useEffect(() => {
        const ctrl = new AbortController();
        const esta = `${url}#${intento}`;
        (async () => {
            try {
                const datos = await pedirAdmin(url, undefined, { signal: ctrl.signal });
                if (!ctrl.signal.aborted) setRes({ clave: esta, datos: datos && typeof datos === 'object' ? datos : {}, error: null });
            } catch (err) {
                if (!ctrl.signal.aborted) setRes({ clave: esta, datos: null, error: { status: Number(err?.status) || 0, detalle: err?.detalle ?? null } });
            }
        })();
        return () => ctrl.abort();
    }, [url, intento]);
    const actual = res !== null && res.clave === clave;
    return {
        cargando: !actual,
        datos: res && !res.error ? res.datos : null,
        error: actual ? res.error : null,
        recargar: () => setIntento((n) => n + 1),
    };
}

const Cargando = () => <p className={styles.estado} role="status">{TEXTOS.cargando}</p>;

/**
 * Lo que el servidor dice de la CUENTA entera: `aviso_pendiente` (la persona aún no vio el aviso) o `no_es_prueba` (ya no
 * es de prueba). Manda el CÓDIGO del servidor (`error.detalle`); si falta, el estado HTTP (409 / 403). Cualquier otro
 * fallo (404, 429, 503…) es de esa sección y no dice nada de la cuenta: `null`.
 */
function avisoDeLaCuenta(error) {
    if (error.detalle === 'aviso_pendiente' || error.detalle === 'no_es_prueba') return error.detalle;
    if (error.status === 409) return 'aviso_pendiente';
    if (error.status === 403) return 'no_es_prueba';
    return null;
}

/**
 * Un HIJO de la pestaña (un hilo, los días de un plan) que oye un aviso de la cuenta lo sube al detalle (`onInvalido`).
 * Va en un efecto de LAYOUT: el detalle cambia antes de pintar y nunca se ve, ni un fotograma, el aviso del hijo con su
 * botón de «Volver» (que dejaría entrar de nuevo a la lista).
 */
function useAvisoAlDetalle(error, onInvalido) {
    useLayoutEffect(() => {
        if (error && avisoDeLaCuenta(error)) onInvalido(error);
    }, [error, onInvalido]);
}

/** Aviso de la cuenta (ver `avisoDeLaCuenta`). 404: no existe (o no es de esta cuenta). Lo demás, fallo de la sección. */
function Aviso({ error, onReintentar, noEncontrado = TEXTOS.noDisponible }) {
    const cuenta = avisoDeLaCuenta(error);
    if (cuenta === 'aviso_pendiente') {
        return (
            <div className={styles.aviso} data-aviso="aviso_pendiente">
                <p className={styles.avisoTitulo} role="status">{TEXTOS.avisoPendiente}</p>
                <p className={styles.avisoTexto}>{TEXTOS.avisoPendienteAyuda}</p>
                <div><button type="button" className={comun.boton} onClick={onReintentar}>{TEXTOS.comprobar}</button></div>
            </div>
        );
    }
    if (cuenta === 'no_es_prueba') {
        return (
            <div className={styles.aviso} data-aviso="no_es_prueba">
                <p className={styles.avisoTitulo} role="status">{TEXTOS.noEsPrueba}</p>
                <p className={styles.avisoTexto}>{TEXTOS.noEsPruebaAyuda}</p>
            </div>
        );
    }
    if (error.status === 404) return <p className={styles.estado} role="status">{noEncontrado}</p>;
    let mensaje = TEXTOS.errorCarga;
    if (error.status === 503) mensaje = TEXTOS.sinRastro;
    else if (error.status === 429) mensaje = TEXTOS.demasiadas;
    return (
        <div className={styles.fallo}>
            <p className={styles.falloTexto} role="alert">{mensaje}</p>
            <button type="button" className={comun.boton} onClick={onReintentar}>{TEXTOS.reintentar}</button>
        </div>
    );
}

// ─── Formulario ───────────────────────────────────────────────────────────────────────────────────────────────────────
function GrupoCampos({ nombre, campos }) {
    const id = useId();
    return (
        <section className={styles.grupo} aria-labelledby={id}>
            <h4 id={id} className={styles.grupoTitulo}>{nombre}</h4>
            <dl className={styles.campos}>
                {campos.map((c, i) => (
                    <div key={`${texto(c.etiqueta)}-${i}`} className={styles.campo} data-campo="">
                        <dt className={styles.campoEtiqueta}>{texto(c.etiqueta)}</dt>
                        <dd className={styles.campoValor}>{valorCampo(c.valor)}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

function PanelFormulario({ raiz }) {
    const idCampos = useId();
    const idMemoria = useId();
    const { datos, error, recargar } = usePedido(`${raiz}/formulario`);
    if (error) return <Aviso error={error} onReintentar={recargar} />;
    if (!datos) return <Cargando />;
    const grupos = agrupar(objetos(datos.campos), (c) => (c.grupo ? texto(c.grupo) : TEXTOS.otrosCampos));
    const memoria = objetos(datos.memoria);
    const crudo = datos.crudo && typeof datos.crudo === 'object' ? datos.crudo : null;
    return (
        <div className={styles.contenido}>
            <section className={styles.bloque} aria-labelledby={idCampos}>
                <h3 id={idCampos} className={styles.subtitulo}>{TEXTOS.formulario}</h3>
                {grupos.length === 0 ? <p className={styles.vacio}>{TEXTOS.sinCampos}</p> : (
                    <div className={styles.grupos}>
                        {grupos.map((g) => <GrupoCampos key={g.nombre} nombre={g.nombre} campos={g.items} />)}
                    </div>
                )}
                {crudo && (
                    <details className={styles.plegable}>
                        <summary className={styles.resumenPlegable}>{TEXTOS.crudo}</summary>
                        <pre className={styles.json}>{jsonBonito(crudo)}</pre>
                    </details>
                )}
            </section>
            <section className={styles.bloque} aria-labelledby={idMemoria}>
                <h3 id={idMemoria} className={styles.subtitulo}>{TEXTOS.memoria}</h3>
                {memoria.length === 0 ? <p className={styles.vacio}>{TEXTOS.sinMemoria}</p> : (
                    <ul className={styles.memoria}>
                        {memoria.map((m, i) => {
                            const nota = [m.creado && TEXTOS.guardado(fecha(m.creado)), esCifra(m.relevancia) && TEXTOS.relevancia(cifra(m.relevancia, 2))]
                                .filter(Boolean).join(' · ');
                            return (
                                <li key={m.id ?? i} className={styles.recuerdo}>
                                    <span className={styles.recuerdoTexto}>{texto(m.dato)}</span>
                                    {nota && <span className={styles.nota}>{nota}</span>}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}

// ─── Comidas ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function Comida({ c }) {
    const macros = textoMacros({ proteina: c.proteina, carbohidratos: c.carbohidratos, grasas: c.grasas });
    const ingredientes = listaTextos(c.ingredientes);
    const origen = [c.origen && nombreOrigen(c.origen), refDelPlan(c.plan_ref)].filter(Boolean).join(' · ');
    return (
        <li className={styles.tarjeta} data-comida={c.id ?? ''}>
            <div className={styles.cabezaTarjeta}>
                {c.at && <time className={styles.hora} dateTime={c.at}>{hora(c.at)}</time>}
                {c.tipo && <span className={styles.chip}>{nombreTipoComida(c.tipo)}</span>}
                {esCifra(c.kcal) && <span className={styles.kcal}>{TEXTOS.kcal(cifra(c.kcal))}</span>}
            </div>
            <p className={styles.plato}>{texto(c.plato) || TEXTOS.sinNombre}</p>
            {macros && <p className={styles.nota}>{macros}</p>}
            {ingredientes.length > 0 && <p className={styles.ingredientes}>{ingredientes.join(', ')}</p>}
            {origen && <p className={styles.nota}>{origen}</p>}
        </li>
    );
}

function DiaComidas({ grupo }) {
    const id = useId();
    return (
        <section className={styles.dia} aria-labelledby={id}>
            <h3 id={id} className={styles.diaTitulo}>
                {TEXTOS.cabeceraDia(diaLargo(grupo.at), TEXTOS.nComidas(grupo.items.length), cifra(sumaKcal(grupo.items)))}
            </h3>
            <ul className={styles.tarjetas}>
                {grupo.items.map((c, i) => <Comida key={c.id ?? i} c={c} />)}
            </ul>
        </section>
    );
}

function PanelComidas({ raiz, dias, onDias }) {
    const idPeriodo = useId();
    const { desde, hasta } = rangoDeDias(dias);
    const { cargando, datos, error, recargar } = usePedido(`${raiz}/comidas?${new URLSearchParams({ desde, hasta })}`);
    const comidas = objetos(datos?.comidas);
    const resumen = datos && !error
        ? TEXTOS.rango(fechaDia(datos.desde || desde), fechaDia(datos.hasta || hasta), TEXTOS.nComidas(comidas.length))
        : '';
    let cuerpo;
    if (error) cuerpo = <Aviso error={error} onReintentar={recargar} />;
    else if (!datos) cuerpo = <Cargando />;
    else {
        cuerpo = (
            <div className={styles.lista} aria-busy={cargando ? 'true' : undefined}>
                {comidas.length === 0
                    ? <p className={styles.vacio}>{TEXTOS.sinComidas}</p>
                    : porDia(comidas).map((g) => <DiaComidas key={g.clave} grupo={g} />)}
            </div>
        );
    }
    return (
        <div className={styles.contenido}>
            <div className={styles.herramientas}>
                <div className={styles.campoFiltro}>
                    <label htmlFor={idPeriodo} className={comun.etiqueta}>{TEXTOS.periodoComidas}</label>
                    <select id={idPeriodo} className={comun.input} value={dias} onChange={(e) => onDias(Number(e.target.value))}>
                        {PERIODOS_COMIDAS.map((d) => <option key={d} value={d}>{TEXTOS.ultimos(d)}</option>)}
                    </select>
                </div>
                {resumen && <p className={cargando ? `${styles.meta} ${styles.atenuado}` : styles.meta}>{resumen}</p>}
            </div>
            {cuerpo}
        </div>
    );
}

// ─── Planes ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function ComidaDelPlan({ c }) {
    const ingredientes = listaTextos(c.ingredientes);
    const pasos = listaTextos(c.pasos);
    const cifras = [esCifra(c.kcal) && TEXTOS.kcal(cifra(c.kcal)), macrosDelPlan(c.macros)].filter(Boolean).join(' · ');
    return (
        <li className={styles.comidaPlan}>
            <p className={styles.cabezaTarjeta}>
                {c.tipo && <span className={styles.chip}>{nombreTipoComida(c.tipo)}</span>}
                <span className={styles.plato}>{texto(c.plato) || TEXTOS.sinNombre}</span>
            </p>
            {cifras && <p className={styles.nota}>{cifras}</p>}
            {ingredientes.length > 0 && (
                <>
                    <p className={styles.etiquetaLista}>{TEXTOS.ingredientes}</p>
                    <ul className={styles.listaTexto}>{ingredientes.map((x, k) => <li key={k}>{x}</li>)}</ul>
                </>
            )}
            {pasos.length > 0 && (
                <>
                    <p className={styles.etiquetaLista}>{TEXTOS.pasos}</p>
                    <ol className={styles.listaTexto}>{pasos.map((x, k) => <li key={k}>{x}</li>)}</ol>
                </>
            )}
        </li>
    );
}

function DiasDelPlan({ raiz, planId, onInvalido }) {
    const { datos, error, recargar } = usePedido(`${raiz}/planes/${encodeURIComponent(planId)}`);
    useAvisoAlDetalle(error, onInvalido);
    if (error) return <Aviso error={error} onReintentar={recargar} noEncontrado={TEXTOS.planNoEncontrado} />;
    if (!datos) return <Cargando />;
    const dias = objetos(datos.dias);
    if (dias.length === 0) return <p className={styles.vacio}>{TEXTOS.sinDias}</p>;
    return (
        <ol className={styles.listaDias}>
            {dias.map((d, i) => {
                const comidas = objetos(d.comidas);
                return (
                    <li key={`${texto(d.dia)}-${i}`}>
                        <details className={styles.plegable}>
                            <summary className={styles.resumenPlegable}>
                                {TEXTOS.cabeceraDia(nombreDia(d.dia, i), TEXTOS.nComidas(comidas.length), cifra(sumaKcal(comidas)))}
                            </summary>
                            {comidas.length === 0 ? <p className={`${styles.vacio} ${styles.dentro}`}>{TEXTOS.diaVacio}</p> : (
                                <ul className={styles.comidasPlan}>
                                    {comidas.map((c, j) => <ComidaDelPlan key={j} c={c} />)}
                                </ul>
                            )}
                        </details>
                    </li>
                );
            })}
        </ol>
    );
}

function Plan({ raiz, plan: p, onInvalido }) {
    const idDias = useId();
    const [abierto, setAbierto] = useState(false);
    const conteo = p.bloques && typeof p.bloques === 'object' && !Array.isArray(p.bloques) ? p.bloques : {};
    const partes = partesBloques(conteo);
    const detalle = objetos(p.bloques_detalle);
    const estado = p.estado_generacion ? ESTADO_PLAN[p.estado_generacion] || [texto(p.estado_generacion), 'neutro'] : null;
    const meta = [
        p.creado && TEXTOS.creado(fecha(p.creado)),
        esCifra(p.kcal) && TEXTOS.kcalDia(cifra(p.kcal)),
        esCifra(p.dias) && TEXTOS.nDias(Number(p.dias)),
        esCifra(p.revision) && TEXTOS.revision(cifra(p.revision)),
    ].filter(Boolean).join(' · ');
    const puedeAbrir = p.id !== null && p.id !== undefined && p.id !== '';
    return (
        <li className={styles.plan} data-plan={texto(p.id)}>
            <div className={styles.cabezaPlan}>
                <h3 className={styles.planNombre}>{texto(p.nombre) || TEXTOS.planSinNombre}</h3>
                {estado && <span className={styles.chip} data-tono={estado[1]}>{estado[0]}</span>}
            </div>
            {meta && <p className={styles.meta}>{meta}</p>}
            <p className={styles.bloques}>{partes.length > 0 ? TEXTOS.bloques(partes.join(' · ')) : TEXTOS.sinBloques}</p>
            {detalle.length > 0 && (
                <details className={styles.plegable}>
                    <summary className={styles.resumenPlegable}>{TEXTOS.verBloques(detalle.length)}</summary>
                    <ul className={styles.listaBloques}>
                        {detalle.map((b, i) => (
                            <li key={b.id ?? i} className={styles.bloqueFila} data-estado-bloque={texto(b.estado)}>
                                <span>{lineaBloque(b)}</span>
                                {b.motivo_fallo && <span className={styles.motivo}>{TEXTOS.motivoFallo(texto(b.motivo_fallo))}</span>}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            {puedeAbrir && (
                <>
                    <div>
                        <button type="button" className={comun.boton} aria-expanded={abierto} aria-controls={idDias} onClick={() => setAbierto((a) => !a)}>
                            {abierto ? TEXTOS.ocultarDias : TEXTOS.verDias}
                        </button>
                    </div>
                    {/* los días se piden al abrirlos (y se sueltan al cerrarlos) */}
                    <div id={idDias} className={styles.diasPlan} hidden={!abierto}>
                        {abierto && <DiasDelPlan raiz={raiz} planId={p.id} onInvalido={onInvalido} />}
                    </div>
                </>
            )}
        </li>
    );
}

function PanelPlanes({ raiz, onInvalido }) {
    const { datos, error, recargar } = usePedido(`${raiz}/planes`);
    if (error) return <Aviso error={error} onReintentar={recargar} />;
    if (!datos) return <Cargando />;
    const planes = objetos(datos.planes);
    if (planes.length === 0) return <p className={styles.vacio}>{TEXTOS.sinPlanes}</p>;
    return (
        <ul className={styles.planes}>
            {planes.map((p, i) => <Plan key={p.id ?? i} raiz={raiz} plan={p} onInvalido={onInvalido} />)}
        </ul>
    );
}

// ─── Conversaciones ───────────────────────────────────────────────────────────────────────────────────────────────────
/** Una foto del chat: se pide con la sesión, se pinta desde un blob y el blob se libera al desmontarse. */
function FotoAdjunta({ url, alt }) {
    const [foto, setFoto] = useState({ src: null, fallo: false });
    useEffect(() => {
        const ctrl = new AbortController();
        let creada = null;
        (async () => {
            try {
                const r = await fetchWithAuth(url, { signal: ctrl.signal });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const blob = await r.blob();
                if (ctrl.signal.aborted) return;
                if (blob.type && !blob.type.startsWith('image/')) throw new Error(blob.type);
                creada = URL.createObjectURL(blob);
                setFoto({ src: creada, fallo: false });
            } catch {
                if (!ctrl.signal.aborted) setFoto({ src: null, fallo: true });
            }
        })();
        return () => {
            ctrl.abort();
            if (creada) URL.revokeObjectURL(creada);
        };
    }, [url]);
    if (foto.fallo) return <p className={styles.fotoNota}>{TEXTOS.fotoFallo}</p>;
    if (!foto.src) return <p className={styles.fotoNota}>{TEXTOS.cargandoFoto}</p>;
    return <img className={styles.foto} src={foto.src} alt={alt} />;
}

function Mensaje({ raiz, m }) {
    const rol = texto(m.rol);
    const persona = rol === 'persona';
    let quien = rol;
    if (persona) quien = TEXTOS.persona;
    else if (rol === 'coach') quien = TEXTOS.coach;
    const fotos = objetos(m.fotos).filter((f) => f.id !== null && f.id !== undefined && f.id !== '');
    const fb = sentidoFeedback(m.feedback);
    const altDe = (i) => {
        if (!persona) return TEXTOS.imagen;
        return fotos.length > 1 ? TEXTOS.fotoDe(i + 1, fotos.length) : TEXTOS.foto;
    };
    return (
        <li className={styles.mensaje} data-rol={rol}>
            <div className={styles.burbuja}>
                <p className={styles.quien}>
                    <span className={styles.rol}>{quien}</span>
                    {m.at && <time className={styles.hora} dateTime={m.at}>{fechaHora(m.at)}</time>}
                </p>
                {texto(m.texto) && <p className={styles.texto} data-texto="">{texto(m.texto)}</p>}
                {fotos.length > 0 && (
                    <div className={styles.fotos}>
                        {fotos.map((f, i) => <FotoAdjunta key={texto(f.id)} url={`${raiz}/adjuntos/${encodeURIComponent(texto(f.id))}`} alt={altDe(i)} />)}
                    </div>
                )}
                {fb && (
                    <p className={styles.feedback} data-feedback={fb}>
                        {fb !== 'otro' && <span aria-hidden="true">{fb === 'up' ? '👍 ' : '👎 '}</span>}
                        {fb === 'otro' ? TEXTOS.feedbackOtro(texto(m.feedback)) : TEXTOS.feedback[fb]}
                    </p>
                )}
            </div>
        </li>
    );
}

function Hilo({ raiz, sesion, onCerrar, onInvalido }) {
    const idTitulo = useId();
    const tituloRef = useRef(null);
    const { datos, error, recargar } = usePedido(`${raiz}/conversaciones/${encodeURIComponent(texto(sesion.id))}`);
    useAvisoAlDetalle(error, onInvalido);
    // Al abrir el hilo, el foco va a su título (el botón que lo abrió ya no está en pantalla).
    useEffect(() => { tituloRef.current?.focus(); }, []);
    const mensajes = objetos(datos?.mensajes);
    let cuerpo;
    if (error) cuerpo = <Aviso error={error} onReintentar={recargar} noEncontrado={TEXTOS.hiloNoEncontrado} />;
    else if (!datos) cuerpo = <Cargando />;
    else if (mensajes.length === 0) cuerpo = <p className={styles.vacio}>{TEXTOS.sinMensajes}</p>;
    else {
        cuerpo = (
            <ol className={styles.mensajes} aria-label={TEXTOS.mensajes}>
                {mensajes.map((m, i) => <Mensaje key={m.id ?? i} raiz={raiz} m={m} />)}
            </ol>
        );
    }
    return (
        <section className={styles.hilo} aria-labelledby={idTitulo}>
            <button type="button" className={`${comun.boton} ${comun.volver}`} onClick={onCerrar}>
                <ArrowLeft size={16} strokeWidth={2.25} aria-hidden="true" />
                {TEXTOS.volverConversaciones}
            </button>
            <h3 id={idTitulo} ref={tituloRef} tabIndex={-1} className={styles.subtitulo}>{TEXTOS.conversacionDel(fechaHora(sesion.inicio))}</h3>
            {cuerpo}
        </section>
    );
}

function PanelConversaciones({ raiz, onInvalido }) {
    const { datos, error, recargar } = usePedido(`${raiz}/conversaciones`);
    const [abierta, setAbierta] = useState(null);           // la sesión cuyo hilo se ve
    const listaRef = useRef(null);
    const volverA = useRef(null);                          // al cerrar el hilo, el foco vuelve a SU conversación
    useEffect(() => {
        const id = volverA.current;
        if (id === null || abierta) return;
        volverA.current = null;
        const botones = listaRef.current ? [...listaRef.current.querySelectorAll('[data-sesion]')] : [];
        botones.find((b) => b.dataset.sesion === id)?.focus();
    });
    // El hilo se desmonta al cerrarlo: aborta lo que esté en vuelo y libera sus fotos. La lista no se vuelve a pedir.
    const cerrar = () => { volverA.current = texto(abierta?.id); setAbierta(null); };
    if (abierta) return <Hilo raiz={raiz} sesion={abierta} onCerrar={cerrar} onInvalido={onInvalido} />;
    if (error) return <Aviso error={error} onReintentar={recargar} />;
    if (!datos) return <Cargando />;
    const sesiones = objetos(datos.sesiones).filter((s) => s.id !== null && s.id !== undefined && s.id !== '');
    if (sesiones.length === 0) return <p className={styles.vacio}>{TEXTOS.sinSesiones}</p>;
    return (
        <ul ref={listaRef} className={styles.sesiones}>
            {sesiones.map((s) => {
                const meta = [
                    esCifra(s.mensajes) && TEXTOS.nMensajes(Number(s.mensajes)),
                    esCifra(s.fotos) && Number(s.fotos) > 0 && TEXTOS.nFotos(Number(s.fotos)),
                    esCifra(s.pulgares_abajo) && Number(s.pulgares_abajo) > 0 && TEXTOS.nNoUtiles(Number(s.pulgares_abajo)),
                    s.ultimo && TEXTOS.ultimo(fechaHora(s.ultimo)),
                ].filter(Boolean).join(' · ');
                return (
                    <li key={texto(s.id)} className={styles.sesion}>
                        <button type="button" className={styles.sesionBoton} data-sesion={texto(s.id)} onClick={() => setAbierta(s)}>
                            <span className={styles.sesionFecha}>{fechaHora(s.inicio)}</span>
                            <span className={styles.sesionPrimer}>{texto(s.primer_mensaje) || TEXTOS.sinTexto}</span>
                        </button>
                        {meta && <p className={styles.nota}>{meta}</p>}
                    </li>
                );
            })}
        </ul>
    );
}

// ─── Actividad ────────────────────────────────────────────────────────────────────────────────────────────────────────
function DiaEventos({ grupo }) {
    const id = useId();
    return (
        <section className={styles.dia} aria-labelledby={id}>
            <h3 id={id} className={styles.diaTitulo}>{diaLargo(grupo.at)}</h3>
            <ol className={styles.tarjetas}>
                {grupo.items.map((e, i) => (
                    <li key={`${texto(e.at)}-${i}`} className={styles.evento} data-evento={texto(e.tipo)}>
                        {e.at && <time className={styles.hora} dateTime={e.at}>{hora(e.at)}</time>}
                        <span className={styles.chip}>{NOMBRE_EVENTO[e.tipo] || texto(e.tipo)}</span>
                        <span className={styles.eventoTexto}>
                            <span className={styles.eventoTitulo}>{texto(e.titulo)}</span>
                            {texto(e.detalle) && <span className={styles.nota}>{texto(e.detalle)}</span>}
                        </span>
                    </li>
                ))}
            </ol>
        </section>
    );
}

function PanelActividad({ raiz, filtro, onFiltro }) {
    const idPeriodo = useId();
    const idAyuda = useId();
    const tipos = TIPOS_EVENTO.map(([id]) => id).filter((id) => filtro.tipos.includes(id));
    const url = `${raiz}/actividad?${new URLSearchParams({ dias: String(filtro.dias), tipos: tipos.join(',') })}`;
    const { cargando, datos, error, recargar } = usePedido(url);
    const alternar = (id) => onFiltro((f) => ({
        ...f, tipos: f.tipos.includes(id) ? f.tipos.filter((t) => t !== id) : [...f.tipos, id],
    }));
    const eventos = objetos(datos?.eventos);
    const diasDatos = esCifra(datos?.dias) ? Number(datos.dias) : filtro.dias;
    const cuantos = eventos.length >= TOPE_EVENTOS ? TEXTOS.tope(TEXTOS.nEventos(eventos.length)) : TEXTOS.nEventos(eventos.length);
    let cuerpo;
    if (error) cuerpo = <Aviso error={error} onReintentar={recargar} />;
    else if (!datos) cuerpo = <Cargando />;
    else {
        cuerpo = (
            <div className={styles.lista} aria-busy={cargando ? 'true' : undefined}>
                <div className={styles.resumenActividad}>
                    <p className={styles.gasto}>{TEXTOS.gasto(diasDatos, usd(datos.gasto_ia_usd))}</p>
                    <p className={styles.meta}>{cuantos}</p>
                </div>
                {eventos.length === 0
                    ? <p className={styles.vacio}>{TEXTOS.sinEventos}</p>
                    : porDia(eventos).map((g) => <DiaEventos key={g.clave} grupo={g} />)}
            </div>
        );
    }
    return (
        <div className={styles.contenido}>
            <div className={styles.herramientas}>
                <div className={styles.campoFiltro}>
                    <label htmlFor={idPeriodo} className={comun.etiqueta}>{TEXTOS.periodoActividad}</label>
                    <select
                        id={idPeriodo}
                        className={comun.input}
                        value={filtro.dias}
                        onChange={(e) => { const d = Number(e.target.value); onFiltro((f) => ({ ...f, dias: d })); }}
                    >
                        {PERIODOS_ACTIVIDAD.map((d) => <option key={d} value={d}>{TEXTOS.ultimos(d)}</option>)}
                    </select>
                </div>
                <fieldset className={styles.tipos} aria-describedby={idAyuda}>
                    <legend className={comun.etiqueta}>{TEXTOS.tiposEvento}</legend>
                    <div className={styles.casillas}>
                        {TIPOS_EVENTO.map(([id, nombre]) => (
                            <label key={id} className={styles.casilla}>
                                <input type="checkbox" checked={filtro.tipos.includes(id)} onChange={() => alternar(id)} />
                                {nombre}
                            </label>
                        ))}
                    </div>
                    <p id={idAyuda} className={styles.nota}>{TEXTOS.tiposAyuda}</p>
                    {tipos.length > 0 && (
                        <button type="button" className={styles.botonTexto} onClick={() => onFiltro((f) => ({ ...f, tipos: [] }))}>
                            {TEXTOS.quitarFiltro}
                        </button>
                    )}
                </fieldset>
            </div>
            {cuerpo}
        </div>
    );
}

// ─── El detalle ───────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * `userId` y `email` de la cuenta de prueba. Se monta dentro de la región «Detalle de …» de `AdminCuentas`, que se
 * lleva el foco al abrirse; aquí no se le roba. El periodo de Comidas y el filtro de Actividad se recuerdan al cambiar
 * de pestaña; el contenido no (cada apertura lo vuelve a pedir).
 */
export default function AdminPruebaDetalle({ userId, email }) {
    const idBase = useId();
    const [pestana, setPestana] = useState('formulario');
    const [diasComidas, setDiasComidas] = useState(30);
    const [filtroActividad, setFiltroActividad] = useState({ dias: 7, tipos: [] });
    // [ronda 1] El aviso de la cuenta (`{ status, detalle }`) que subió un HIJO de la pestaña (un hilo, los días de un
    // plan): mientras esté, ningún panel está montado y en su lugar va ese aviso.
    const [invalido, setInvalido] = useState(null);
    const botones = useRef([]);
    const raiz = `/api/admin/cuentas/${encodeURIComponent(userId)}/prueba`;
    const idPestana = (id) => `${idBase}-pestana-${id}`;
    const idPanel = (id) => `${idBase}-panel-${id}`;

    // Flechas, Inicio y Fin mueven el foco entre pestañas (con vuelta); no abren ninguna.
    const teclas = (e) => {
        // Con Alt, Ctrl, Cmd o Mayús no son de las pestañas: Alt+← es «Atrás» del navegador, Ctrl+Inicio/Fin desplazan la
        // página, Mayús+flecha selecciona. Ni se les hace `preventDefault` ni se mueve el foco.
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const i = PESTANAS.findIndex(([id]) => id === e.target?.dataset?.pestana);
        if (i < 0) return;
        const n = PESTANAS.length;
        let j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % n;
        else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = n - 1;
        if (j === null) return;
        e.preventDefault();
        botones.current[j]?.focus();
    };

    const panelDe = (id) => {
        if (id === 'formulario') return <PanelFormulario raiz={raiz} />;
        if (id === 'comidas') return <PanelComidas raiz={raiz} dias={diasComidas} onDias={setDiasComidas} />;
        if (id === 'planes') return <PanelPlanes raiz={raiz} onInvalido={setInvalido} />;
        if (id === 'conversaciones') return <PanelConversaciones raiz={raiz} onInvalido={setInvalido} />;
        return <PanelActividad raiz={raiz} filtro={filtroActividad} onFiltro={setFiltroActividad} />;
    };

    return (
        <div className={styles.detalle}>
            <header className={styles.cabecera}>
                <h2 className={styles.titulo}>{TEXTOS.titulo(email || userId)}</h2>
                <p className={styles.sub}>{TEXTOS.soloLectura}</p>
            </header>
            <div role="tablist" aria-label={TEXTOS.pestanas} className={styles.pestanas} onKeyDown={teclas}>
                {PESTANAS.map(([id, nombre], i) => (
                    <button
                        key={id}
                        ref={(el) => { botones.current[i] = el; }}
                        type="button"
                        role="tab"
                        id={idPestana(id)}
                        aria-selected={pestana === id}
                        aria-controls={idPanel(id)}
                        tabIndex={pestana === id ? 0 : -1}
                        data-pestana={id}
                        className={styles.pestana}
                        onClick={() => setPestana(id)}
                    >
                        {nombre}
                    </button>
                ))}
            </div>
            {PESTANAS.map(([id]) => (
                <div
                    key={id}
                    role="tabpanel"
                    id={idPanel(id)}
                    aria-labelledby={idPestana(id)}
                    hidden={pestana !== id}
                    tabIndex={0}
                    className={styles.panel}
                >
                    {pestana === id && (invalido
                        ? <Aviso error={invalido} onReintentar={() => setInvalido(null)} />
                        : panelDe(id))}
                </div>
            ))}
        </div>
    );
}
