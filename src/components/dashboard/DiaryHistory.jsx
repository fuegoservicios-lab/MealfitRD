// [P1-DIARY-HISTORY · 2026-07-31 · rediseño P2-DIARY-SLOTS · completado P1-PLAN-LOTE-105] El diario, día por día.
//
// POR QUÉ EXISTE
// El coach registra hacia atrás (`days_ago`): "cené dos panes" dicho por la
// mañana va al diario de AYER. La única superficie que mostraba el diario era
// la card "Progreso en Tiempo Real", que es SOLO hoy. El owner registró bien su
// cena de anoche, miró el panel en cero y reportó "no se registró" — la fila
// estaba, fechada el día anterior. Un registro correcto que no se puede ver es
// indistinguible de uno que falló.
//
// POR QUÉ SE REDISEÑÓ A LOS 20 MINUTOS
// La v1 dibujaba una LÍNEA HORARIA. Estaba mal por los datos, no por el gusto:
// `tools.log_consumed_meal` sella `consumed_at = now() - N días`, así que una
// cena registrada a las 10:51 de la mañana salía como "10:51 · CENA". Medido en
// la fila real: `consumed=30 jul 14:51:04` / `created=31 jul 14:51:04` — el
// mismo minuto, 24 h de diferencia. La hora era el instante del REGISTRO.
//   ⇒ La señal de la v1 descansaba sobre un dato inventado.
//
// Lo que SÍ es real es la FRANJA: la nombró el usuario. Y en cuanto el día se
// dibuja por sus franjas, el enorme vacío bajo una sola comida deja de ser un
// problema de espaciado y pasa a ser la respuesta a "¿qué me falta?".
//
// UNA SOLA GRAMÁTICA: punteado = sin dato. Lo usa el riel de un día sin
// registro en la tira y lo usa una franja vacía. Las dos mitades del cajón
// dicen lo mismo de la misma forma.
//
// [P1-PLAN-LOTE-105 · 2026-09-18] LO QUE LE FALTABA PARA SER EL DIARIO ENTERO (auditoría a petición del dueño):
//  · los MICROS del día (solo enseñaba macros): la misma lista que la tarjeta de hoy, con sus metas;
//  · las comidas «extra» eran INVISIBLES: el componedor registra `meal_type='extra'` por defecto y el cajón solo
//    dibujaba las cuatro franjas + `snack` — la comida contaba en el total y no salía en ninguna fila;
//  · BORRAR desde cualquier día (solo hoy tenía papelera, en la tarjeta) — una cena mal anotada ayer no se podía
//    quitar desde la app;
//  · REGISTRAR en el día que miras (hasta 7 atrás, el tope del backend), con el mismo componedor;
//  · ver MÁS de 14 días (hasta 90, el tope del endpoint) y la media de la semana;
//  · se refresca solo cuando algo cambia mientras está abierto (registrar/borrar en la tarjeta o en el chat).
//
// [P1-COMPARTIR-DIA-PASADO · 2026-09-24] Compartir CUALQUIER día, no solo hoy (el dueño: «¿y si yo quisiera compartir
// días pasados?»): el botón de la tarjeta de hoy vive también aquí, junto al total del día, y abre la MISMA hoja con el
// día que se mira y su fecha.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarDays, ChevronRight, Trash2, Loader2, Plus, FlaskConical, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { confirmToast } from '../../utils/confirmToast';
import { formatDate, formatNumber, getLocale, useT, useTn } from '../../i18n';
import { useAssessment } from '../../context/AssessmentContext';
import { nombreDeRegistro } from '../../utils/nombreDeRegistro';
import MicrosList from './MicrosList';
import { useMicrosSubtitulo } from './microsShared';
import LogMealModal from './LogMealModal';
import styles from './DiaryHistory.module.css';

// [P1-PLAN-LOTE-223 · 2026-09-24] El escáner, igual: perezoso y montado al abrirlo (ver TrackingProgress). Este cajón
// vive en el mismo trozo del panel, y el escáner reconstruido lo pasaba del techo de precache-guard.
const ScanMealModal = lazy(() => import('./ScanMealModal'));

// [P1-COMPARTIR-DIA-PASADO] La hoja se carga al abrirla, como en la tarjeta (el mismo trozo: canvas + textos). Recibe
// el día TAL CUAL llega del endpoint (`diario`) y lo adapta ella: importar aquí `compartirDia.js` lo metía entero en el
// trozo del panel, que el precache del apex descarga siempre (+1,5 kB gz, por encima del techo de precache-guard).
const ShareDaySheet = lazy(() => import('./ShareDaySheet'));

// [P1-PLAN-LOTE-165 · 2026-09-22] El día de la semana DENTRO de una frase: en minúscula en español, portugués, francés e
// italiano; en inglés va con mayúscula (salía «You logged it on monday 21»).
const _diaEnFrase = (dia) => (String(getLocale() || '').startsWith('en') ? String(dia || '') : String(dia || '').toLowerCase());

const DIAS_TIRA = 14;
// Tope del endpoint (`/consumed-range` clampa a 90) y del retrodatado (`days_ago` ≤ 7 en el backend).
const DIAS_MAX = 90;
const DIAS_ATRAS_REGISTRO = 7;

// [P1-I18N-DASHBOARD · 2026-08-15] Las tablas de copy son FUNCIONES: evaluadas
// como constantes correrían al importar, antes de que el catálogo exista, y se
// quedarían en español para siempre. Las `key` NO se traducen — son el enum de
// `meal_type` del backend.
//
// El orden es el del DÍA, no el del enum del backend: así la pantalla se lee
// de la mañana a la noche aunque no haya ni una hora fiable.
const getFranjas = (t) => [
    { key: 'desayuno', label: t('Desayuno'), color: '#FBBF24' },
    { key: 'almuerzo', label: t('Almuerzo'), color: '#34D399' },
    { key: 'merienda', label: t('Merienda'), color: '#F472B6' },
    { key: 'cena', label: t('Cena'), color: '#818CF8' },
];
// `snack` y `extra` (el default del componedor) no tienen fila propia: no son una franja del día sino algo
// suelto entre medias. Se agrupan al final —junto con cualquier valor que no sea una franja— y solo aparecen si
// existen. [P1-PLAN-LOTE-105] antes solo `snack`: lo registrado como «extra» no salía en ninguna fila.
const OTROS = 'otros';
const getOtros = (t) => ({ key: OTROS, label: t('Extras y snacks'), color: '#94A3B8' });

const getMacros = (t) => [
    { key: 'protein', label: t('Proteína'), color: '#60A5FA', goal: 'protein' },
    { key: 'carbs', label: t('Carbos'), color: '#34D399', goal: 'carbs' },
    { key: 'healthy_fats', label: t('Grasas'), color: '#F472B6', goal: 'fats' },
];

// [P2-I18N-DIARIO-FORMATEADORES-A-MANO · 2026-08-22] La inicial del día, por locale.
//
// Era `['D', 'L', 'M', 'M', 'J', 'V', 'S']` a nivel de módulo: iniciales ESPAÑOLAS, sin
// pasar por el motor y sin que ninguna defensa las viera — un barrido por llamadas a `t()`
// no encuentra un formateador escrito a mano, que es como sobrevivió a tres pasadas.
//
// No se traduce con siete claves: `Intl` ya sabe la forma NARROW de cada idioma, y ahí
// acierta donde una tabla a mano falla — en inglés la tira es S M T W T F S, no D L M M J V S,
// y en portugués D S T Q Q S S. Siete claves × 4 idiomas serían 28 oportunidades de teclear
// mal una letra que nadie revisaría jamás.
const diaLetra = (d) => formatDate(d, { weekday: 'narrow' });
// Cuerpo con llaves a propósito: el validador (`scripts/i18n-check.mjs`) mide el
// ámbito contando llaves, así que una flecha que devuelve un array pelado deja
// sus `t()` a profundidad 0 y los reporta —con razón formal— como ámbito de
// módulo. Con bloque, la lectura del validador coincide con la realidad.
const getMeses = (t) => {
    return [t('enero'), t('febrero'), t('marzo'), t('abril'), t('mayo'), t('junio'), t('julio'),
        t('agosto'), t('septiembre'), t('octubre'), t('noviembre'), t('diciembre')];
};
const getDiasLargo = (t) => {
    return [t('Domingo'), t('Lunes'), t('Martes'), t('Miércoles'), t('Jueves'), t('Viernes'), t('Sábado')];
};

/** `YYYY-MM-DD` en hora LOCAL. `toISOString()` daría UTC y en RD (UTC-4)
 *  cualquier cosa después de las 20:00 saltaría al día siguiente. */
const aISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Parseo explícito a fecha LOCAL. `new Date('2026-07-30')` la interpreta como
 *  medianoche UTC, que en RD es el día 29 a las 20:00. */
const desdeISO = (iso) => {
    const [a, m, d] = String(iso).split('-').map(Number);
    return new Date(a, (m || 1) - 1, d || 1);
};

/** [P1-COMPARTIR-DIA-PASADO] El día `iso` a mediodía LOCAL: lo que se comparte es un DÍA, y a mediodía ningún cambio
 *  de hora lo mueve de fecha (el mismo porqué que la tira). */
const mediodiaDe = (iso) => {
    const d = desdeISO(iso);
    d.setHours(12, 0, 0, 0);
    return d;
};

/** Cuántos días atrás queda `iso` respecto a hoy (local). */
const diasAtras = (iso, hoyISO) => Math.round((desdeISO(hoyISO) - desdeISO(iso)) / 86400000);

const aFecha = (raw) => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
};

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
};

const pct = (v, meta) => (meta > 0 ? Math.min(100, Math.round((num(v) / meta) * 100)) : 0);

/**
 * ¿Se puede confiar en la hora de esta comida?
 *
 * `log_consumed_meal` retrodata con `consumed_at = now() - N días`, así que en
 * un registro de otro día la hora es la del REGISTRO y no la de la comida.
 * Se detecta comparando los DÍAS de ambas marcas: si difieren, fue retrodatado.
 * No hace falta epsilon — la pregunta es "¿lo anotaste otro día?", no "¿cuánto
 * se parecen los relojes?".
 */
const horaFiable = (meal) => {
    const consumido = aFecha(meal?.consumed_at);
    const creado = aFecha(meal?.created_at);
    if (!consumido) return null;
    if (creado && aISO(creado) !== aISO(consumido)) return null;
    return consumido;
};

// [P2-I18N-DIARIO-FORMATEADORES-A-MANO · 2026-08-22] La hora, por locale. Era 24 h fijo
// («15:05») para los cinco idiomas: en en-US se lee «3:05 PM», y esa diferencia no es
// cosmética — «03:05» y «15:05» son horas distintas para quien espera AM/PM.
const hhmm = (d) => formatDate(d, { timeStyle: 'short' });

const DiaryHistory = ({ userId, open, onClose, targetCalories = 2000, targetMacros = {}, targetMicros = null }) => {
    const t = useT();
    const tn = useTn();
    const subtituloMicros = useMicrosSubtitulo();
    // [P1-PLAN-LOTE-224] Para pintar el nombre de lo comido del plan en el idioma del usuario (`nombreDeRegistro`).
    const { planData } = useAssessment() || {};
    // [P1-PLAN-LOTE-162 · 2026-09-22] «Hoy» se recalcula al ABRIR. El cajón vive montado dentro de la tarjeta aunque
    // esté cerrado, así que con `[]` el «hoy» era el del día en que se montó: con la app abierta desde anoche, la tira
    // seguía en ayer y lo que se registraba desde aquí caía en un día desplazado. Al abrir, además, se vuelve a HOY.
    const hoyISO = useMemo(() => aISO(new Date()), [open]); // eslint-disable-line react-hooks/exhaustive-deps
    const [selected, setSelected] = useState(hoyISO);
    useEffect(() => { if (open) setSelected(aISO(new Date())); }, [open]);
    const [maxDias, setMaxDias] = useState(DIAS_TIRA);
    const [resumen, setResumen] = useState([]);
    const [dia, setDia] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    // [P1-PLAN-LOTE-105] sube cuando algo cambió (borrar aquí, registrar en el componedor, la tarjeta o el chat)
    const [version, setVersion] = useState(0);
    const [borrandoId, setBorrandoId] = useState(null);
    const [registrando, setRegistrando] = useState(false);
    // [P1-PLAN-LOTE-124] El dueño: «registrar comida mediante ver días anteriores no aparece la manera de agregar
    // mediante la cámara o foto». El componedor se montaba aquí sin `onScan`, y sin él no pinta las pestañas
    // «Buscar o escribir / Escanear con foto». Ahora cede el paso al escáner, que nace YA en el día que se mira.
    const [escaneando, setEscaneando] = useState(false);
    // [P1-COMPARTIR-DIA-PASADO] `{ dia, fecha }` del día que se comparte, fijado al tocar el botón; null = cerrada
    const [aCompartir, setACompartir] = useState(null);
    const cierreRef = useRef(null);
    const stripRef = useRef(null);
    const activoRef = useRef(null);

    const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

    // [P1-PLAN-LOTE-162] La tira cuenta hacia atrás DESDE `hoyISO` (mediodía local: ningún cambio de hora la mueve de día).
    const dias = useMemo(() => {
        const out = [];
        const [y, m, d] = hoyISO.split('-').map(Number);
        for (let i = maxDias - 1; i >= 0; i -= 1) {
            const fecha = new Date(y, m - 1, d, 12, 0, 0, 0);
            fecha.setDate(fecha.getDate() - i);
            out.push(aISO(fecha));
        }
        return out;
    }, [maxDias, hoyISO]);

    const porFecha = useMemo(() => {
        const m = new Map();
        resumen.forEach((r) => m.set(r.date, r));
        return m;
    }, [resumen]);

    useEffect(() => {
        if (!open || !userId) return undefined;
        let vivo = true;
        (async () => {
            try {
                const res = await fetchWithAuth(
                    `/api/diary/consumed-range/${userId}?days=${maxDias}&tzOffset=${tzOffset}`
                );
                const data = await res.json();
                if (vivo && Array.isArray(data?.days)) setResumen(data.days);
            } catch {
                // La tira degrada a "sin datos": es contexto, no el contenido.
            }
        })();
        return () => { vivo = false; };
    }, [open, userId, tzOffset, maxDias, version]);

    useEffect(() => {
        if (!open || !userId) return undefined;
        let vivo = true;
        setCargando(true);
        setError('');
        (async () => {
            try {
                const res = await fetchWithAuth(
                    `/api/diary/consumed/${userId}?date=${selected}&tzOffset=${tzOffset}`
                );
                if (!res.ok) throw new Error('respuesta no OK');
                const data = await res.json();
                // [P1-COMPARTIR-DIA-PASADO] `iso`: la fecha viaja CON sus datos. Mientras carga otro día, `dia` sigue
                // siendo el anterior, y compartir no puede juntar las cifras de uno con la fecha del otro.
                if (vivo) setDia({ iso: selected, meals: data?.meals || [], totals: data?.totals || {} });
            } catch {
                if (vivo) {
                    setDia(null);
                    setError(t('No pudimos cargar ese día. Revisa tu conexión e intenta de nuevo.'));
                }
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
    }, [open, userId, selected, tzOffset, t, version]);

    // [P1-PLAN-LOTE-105] Mientras está abierto, lo que cambie el diario desde fuera (registrar desde el
    // componedor —que dispara `mealfit:refresh-inventory`—, borrar en la tarjeta, el coach) se refleja aquí sin
    // cerrar y volver a abrir. El borrado propio sube `version` a mano y lleva `source` para no reaccionar dos veces.
    useEffect(() => {
        if (!open) return undefined;
        const refrescar = (e) => { if (e?.detail?.source !== 'diary-history') setVersion((v) => v + 1); };
        window.addEventListener('mealfit:refresh-inventory', refrescar);
        window.addEventListener('mealfit:diary-changed', refrescar);
        return () => {
            window.removeEventListener('mealfit:refresh-inventory', refrescar);
            window.removeEventListener('mealfit:diary-changed', refrescar);
        };
    }, [open]);

    // [P1-DIARY-STRIP-SCROLL] Los 14 días no caben y la barra está oculta: sin
    // esto la tira abría por los días MÁS VIEJOS y hoy/ayer quedaban fuera de
    // pantalla. Se ancla al día ACTIVO para que también siga a las flechas.
    useEffect(() => {
        if (!open) return;
        const nodo = activoRef.current;
        const cinta = stripRef.current;
        if (!nodo || !cinta || typeof cinta.scrollTo !== 'function') return;
        const izq = nodo.offsetLeft - (cinta.clientWidth - nodo.offsetWidth) / 2;
        cinta.scrollTo({
            left: Math.max(0, izq),
            behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                ? 'auto' : 'smooth',
        });
    }, [open, selected, dias]);

    const moverDia = useCallback((delta) => {
        setSelected((actual) => {
            const i = dias.indexOf(actual);
            const j = Math.min(dias.length - 1, Math.max(0, (i < 0 ? dias.length - 1 : i) + delta));
            return dias[j];
        });
    }, [dias]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            // con el componedor abierto encima, las teclas son suyas (Escape lo cierra a él, no al cajón)
            if (registrando || escaneando) return;
            // [P1-COMPARTIR-DIA-PASADO] con la hoja de compartir, igual: Escape (y el «atrás» de Android, que lo
            // simula) la cierra a ella, y las flechas no cambian el día que hay debajo
            if (aCompartir) return;
            if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); moverDia(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); moverDia(1); }
        };
        // [P1-PLAN-LOTE-105] En CAPTURA a propósito. Con un Escape real, el hook del componedor (listener en
        // `document`) lo cierra y React vuelve a pintar en el microtask que corre ENTRE listeners del mismo
        // evento: este efecto se re-registraba con `registrando=false` y el mismo Escape llegaba a `window` y
        // cerraba también el cajón (medido en el arnés; con un evento sintético no pasa porque no hay
        // checkpoint de microtasks a mitad del dispatch). En captura este handler corre ANTES que nadie, con el
        // estado de antes de la tecla.
        window.addEventListener('keydown', onKey, true);
        if (!registrando && !escaneando && !aCompartir) cierreRef.current?.focus({ preventScroll: true });
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, onClose, moverDia, registrando, escaneando, aCompartir]);

    // [P1-PLAN-LOTE-105] Borrar desde cualquier día: el mismo DELETE (filtrado por user_id) que la papelera de la
    // tarjeta de hoy. Tras borrar se vuelve a pedir el día y la tira, y se avisa a la tarjeta (si era hoy, sus
    // barras cambian) y a quien más escuche.
    const borrarComida = useCallback(async (meal) => {
        if (!meal?.id || borrandoId) return;
        const ok = await confirmToast(
            t('¿Eliminar "{nombre}" del diario? Esta acción no se puede deshacer.', { nombre: meal.meal_name }),
            { confirmLabel: t('Eliminar'), cancelLabel: t('Cancelar'), danger: true }
        );
        if (!ok) return;
        setBorrandoId(meal.id);
        try {
            const res = await fetchWithAuth(`/api/diary/consumed/${meal.id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.success) throw new Error(data?.detail || data?.message || 'delete failed');
            setVersion((v) => v + 1);
            try {
                window.dispatchEvent(new CustomEvent('mealfit:diary-changed', { detail: { source: 'diary-history', date: selected } }));
            } catch { /* best-effort */ }
            toast.success(t('"{nombre}" eliminada del diario.', { nombre: meal.meal_name }));
        } catch (err) {
            console.error('Error eliminando comida del diario:', err);
            toast.error(t('No se pudo eliminar la comida. Intenta de nuevo.'));
        } finally {
            setBorrandoId(null);
        }
    }, [borrandoId, selected, t]);

    const cerrarComponedor = useCallback(() => setRegistrando(false), []);
    const pasarAlEscaner = useCallback(() => { setRegistrando(false); setEscaneando(true); }, []);
    const cerrarEscaner = useCallback(() => setEscaneando(false), []);
    // memoizado: `onClose` va en las deps de `useModalAccessibility` y uno nuevo por render le robaría el foco
    const cerrarCompartir = useCallback(() => setACompartir(null), []);

    const fecha = desdeISO(selected);
    const esHoy = selected === hoyISO;
    const atras = diasAtras(selected, hoyISO);
    const esAyer = atras === 1;
    const puedeRegistrar = atras >= 0 && atras <= DIAS_ATRAS_REGISTRO;
    const totales = dia?.totals || {};
    const coberturaMicros = dia ? (totales.micros_coverage || { con_datos: 0, total: (dia.meals || []).length }) : null;

    // Las comidas agrupadas por franja, en el orden del día; lo que no es franja va a «otros».
    const porFranja = useMemo(() => {
        const m = new Map();
        const franjas = new Set(getFranjas(t).map((f) => f.key));
        (dia?.meals || []).forEach((meal) => {
            const raw = String(meal.meal_type || '').toLowerCase();
            const k = franjas.has(raw) ? raw : OTROS;
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(meal);
        });
        return m;
    }, [dia, t]);

    // [P1-PLAN-LOTE-105] La semana en una línea: media de kcal en los días CON registro de los últimos 7.
    const semana = useMemo(() => {
        const ultimos = dias.slice(-7);
        const con = ultimos.map((iso) => porFecha.get(iso)).filter((r) => (r?.meals_count || 0) > 0);
        if (!con.length) return null;
        const media = Math.round(con.reduce((s, r) => s + (Number(r.calories) || 0), 0) / con.length);
        return { media, n: con.length };
    }, [dias, porFecha]);

    const sinNada = !cargando && !error && (dia?.meals || []).length === 0;
    // [P1-COMPARTIR-DIA-PASADO] Como en la tarjeta, se comparte un día CON comidas. Mientras carga otro, el botón se
    // queda (no parpadea al pasar entre días con registro) pero apagado: `dia` todavía es el anterior.
    const conComidas = (dia?.meals || []).length > 0;

    if (!open) return null;

    const etiquetaCompartir = esHoy ? t('Compartir mi día') : t('Compartir este día');
    const abrirCompartir = () => {
        if (!conComidas || cargando) return;
        setACompartir({ dia, fecha: mediodiaDe(dia.iso || selected) });
    };

    const renderComida = (meal) => {
        const h = horaFiable(meal);
        const creado = aFecha(meal?.created_at);
        const borrando = borrandoId === meal.id;
        return (
            <div key={meal.id || meal.meal_name} className={styles.meal}>
                <div className={styles.mealBody}>
                    {/* [P1-PLAN-LOTE-224] el nombre en el idioma del usuario (el dato no cambia) */}
                    <div className={styles.mealName}>{nombreDeRegistro(meal.meal_name, planData, t) || t('Sin nombre')}</div>
                    <div className={styles.mealMacros}>
                        <span className={styles.mealKcal}>{num(meal.calories)} kcal</span>
                        {/* [P1-PLAN-LOTE-165] «P · C · G» fijas eran incorrectas en inglés (grasa = F) y en francés
                            (glucides/lipides = G/L): la abreviatura es de cada idioma. */}
                        {' · '}{t('P {p} · C {c} · G {g}', { p: num(meal.protein), c: num(meal.carbs), g: num(meal.healthy_fats) })}
                    </div>
                    {/* La hora solo si es de fiar. Si se anotó otro día, se dice ESO
                        — que es verdad y además útil — en vez de una hora inventada. */}
                    {!h && creado && (
                        <div className={styles.loggedOn}>
                            {t('Lo anotaste el {diaSemana} {dia}', {
                                // [P1-PLAN-LOTE-165] en minúscula en es/pt/fr/it; en inglés el día va con mayúscula
                                diaSemana: _diaEnFrase(getDiasLargo(t)[creado.getDay()]),
                                dia: creado.getDate(),
                            })}
                        </div>
                    )}
                </div>
                {meal.id && (
                    <button
                        type="button"
                        className={styles.mealDel}
                        aria-label={t('Eliminar {nombre} del diario', { nombre: meal.meal_name })}
                        onClick={() => borrarComida(meal)}
                        disabled={borrando}
                    >
                        {borrando
                            ? <Loader2 size={15} className="spin-animation" aria-hidden="true" />
                            : <Trash2 size={15} strokeWidth={2.25} aria-hidden="true" />}
                    </button>
                )}
            </div>
        );
    };

    const cuerpo = (
        <>
            <motion.div
                className={styles.overlay}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={onClose} aria-hidden="true"
            />
            <motion.aside
                className={styles.drawer}
                role="dialog" aria-modal="true" aria-label={t('Diario de días anteriores')}
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            >
                <header className={styles.head}>
                    <div>
                        <div className={styles.eyebrow}>{t('Diario')}</div>
                        <h2 className={styles.dateTitle}>
                            {t('{diaSemana} {dia} de {mes}', {
                                diaSemana: getDiasLargo(t)[fecha.getDay()],
                                dia: fecha.getDate(),
                                mes: getMeses(t)[fecha.getMonth()],
                            })}
                        </h2>
                        {(esHoy || esAyer) && (
                            <div className={styles.dateRelative}>{esHoy ? t('Hoy') : t('Ayer')}</div>
                        )}
                    </div>
                    <button
                        ref={cierreRef} type="button" className={`${styles.closeBtn} ui-close`}
                        onClick={onClose} aria-label={t('Cerrar')}
                    >
                        <X size={20} strokeWidth={2.25} aria-hidden="true" />
                    </button>
                </header>

                <div ref={stripRef} className={styles.strip} role="tablist" aria-label={t('Elegir día')}>
                    {/* [P1-PLAN-LOTE-105] la tira crece hacia atrás de dos en dos semanas, hasta el tope del endpoint */}
                    {maxDias < DIAS_MAX && (
                        <button
                            type="button"
                            className={styles.moreDays}
                            onClick={() => setMaxDias((n) => Math.min(DIAS_MAX, n + DIAS_TIRA))}
                            title={t('Ver 2 semanas más')}
                            aria-label={t('Ver 2 semanas más')}
                        >
                            +14
                        </button>
                    )}
                    {dias.map((iso) => {
                        const d = desdeISO(iso);
                        const r = porFecha.get(iso);
                        const kcal = r?.calories || 0;
                        const conDatos = (r?.meals_count || 0) > 0;
                        const alto = pct(kcal, targetCalories);
                        const activo = iso === selected;
                        return (
                            <button
                                key={iso}
                                ref={activo ? activoRef : null}
                                type="button" role="tab" aria-selected={activo}
                                className={`${styles.dayBtn} ${activo ? styles.dayBtnActive : ''}`}
                                onClick={() => setSelected(iso)}
                                title={conDatos
                                    ? t('{kcal} kcal · {n} comida(s)', { kcal, n: r.meals_count })
                                    : t('Sin registro')}
                            >
                                <span className={styles.dayLetter}>{diaLetra(d)}</span>
                                <span className={`${styles.rail} ${conDatos ? '' : styles.railEmpty}`}>
                                    {conDatos && (
                                        <motion.span
                                            className={styles.railFill}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${Math.max(alto, 8)}%` }}
                                            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                                        />
                                    )}
                                </span>
                                <span className={styles.dayNum}>{d.getDate()}</span>
                                <span className={iso === hoyISO ? styles.todayDot : styles.todayDotHidden} />
                            </button>
                        );
                    })}
                </div>

                {semana && (
                    <div className={styles.weekLine}>
                        {tn(semana.n,
                            'Últimos 7 días: media de {kcal} kcal en {n} día con registro',
                            'Últimos 7 días: media de {kcal} kcal en {n} días con registro',
                            { kcal: formatNumber(semana.media), n: semana.n })}
                    </div>
                )}

                <div className={styles.quota}>
                    <div className={styles.quotaTop}>
                        <span className={styles.quotaNum}>{num(totales.calories)}</span>
                        <span className={styles.quotaOf}>{t('de {kcal} kcal', { kcal: targetCalories })}</span>
                        {/* [P1-COMPARTIR-DIA-PASADO] junto a las cifras que se comparten, no en la cabecera: con la X al
                            lado, «Miércoles 23 de septiembre» ya no cabe en una línea en un teléfono */}
                        {conComidas && (
                            <button
                                type="button"
                                className={styles.shareBtn}
                                onClick={abrirCompartir}
                                disabled={cargando}
                                aria-label={etiquetaCompartir}
                                title={etiquetaCompartir}
                            >
                                <Share2 size={18} strokeWidth={2.5} aria-hidden="true" />
                            </button>
                        )}
                    </div>
                    <div className={styles.quotaBar}>
                        <motion.div
                            className={styles.quotaFill}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct(totales.calories, targetCalories)}%` }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        />
                    </div>
                </div>

                <div className={styles.macroRow}>
                    {getMacros(t).map((m) => {
                        const meta = num(targetMacros?.[m.goal]) || 0;
                        return (
                            <div key={m.key} className={styles.macroCell}>
                                <div className={styles.macroTop}>
                                    <span className={styles.macroName}>{m.label}</span>
                                    <span className={styles.macroVal}>
                                        {num(totales[m.key])}{meta ? `/${meta}` : ''} g
                                    </span>
                                </div>
                                <div className={styles.macroBar}>
                                    <motion.div
                                        className={styles.macroFill}
                                        style={{ background: m.color }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${pct(totales[m.key], meta)}%` }}
                                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.slots}>
                    {cargando && (<><div className={styles.skeleton} /><div className={styles.skeleton} /></>)}

                    {!cargando && !error && getFranjas(t).map((f, i) => {
                        const items = porFranja.get(f.key) || [];
                        const lleno = items.length > 0;
                        return (
                            <motion.div
                                key={f.key}
                                className={`${styles.slot} ${lleno ? '' : styles.slotEmpty}`}
                                style={{ color: f.color }}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.22, delay: i * 0.04 }}
                            >
                                <span className={styles.slotRule} />
                                <div>
                                    <div className={styles.slotHead}>
                                        <span className={styles.slotLabel} style={lleno ? { color: f.color } : undefined}>
                                            {f.label}
                                        </span>
                                        {lleno && items.length === 1 && horaFiable(items[0]) && (
                                            <span className={styles.slotNote}>{hhmm(horaFiable(items[0]))}</span>
                                        )}
                                    </div>
                                    {lleno
                                        ? items.map((meal) => renderComida(meal))
                                        : <div className={styles.slotEmptyText}>{t('Sin registro')}</div>}
                                </div>
                            </motion.div>
                        );
                    })}

                    {!cargando && !error && (porFranja.get(OTROS) || []).length > 0 && (
                        <div className={styles.slot} style={{ color: getOtros(t).color }}>
                            <span className={styles.slotRule} />
                            <div>
                                <div className={styles.slotHead}>
                                    <span className={styles.slotLabel} style={{ color: getOtros(t).color }}>
                                        {getOtros(t).label}
                                    </span>
                                </div>
                                {porFranja.get(OTROS).map((meal) => renderComida(meal))}
                            </div>
                        </div>
                    )}

                    {sinNada && (
                        <p className={styles.dayEmpty}>
                            {esHoy
                                ? t('El día está en blanco. Cuéntale al coach lo que comas y lo va anotando aquí.')
                                : t('Ese día quedó sin registrar. Puedes contárselo al coach aunque haya pasado — él lo anota en la fecha que corresponda.')}
                        </p>
                    )}

                    {/* [P1-PLAN-LOTE-105] registrar EN el día que miras (hasta 7 atrás, el tope del backend) */}
                    {!cargando && !error && (
                        puedeRegistrar ? (
                            <button type="button" className={styles.addBtn} onClick={() => setRegistrando(true)}>
                                <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
                                {esHoy ? t('Registrar comida') : t('Registrar en este día')}
                            </button>
                        ) : (
                            <p className={styles.addHint}>{t('Solo se puede registrar hasta 7 días atrás.')}</p>
                        )
                    )}

                    {/* [P1-PLAN-LOTE-105] los micros del día: la misma lista que la tarjeta de hoy, compacta */}
                    {!cargando && !error && dia && (
                        <section className={styles.micros} aria-labelledby="diario-micros-titulo">
                            <div className={styles.microsHead}>
                                <FlaskConical size={14} strokeWidth={2.4} aria-hidden="true" />
                                <span id="diario-micros-titulo" className={styles.microsTitle}>{t('Micros')}</span>
                                <span className={styles.microsSub}>{subtituloMicros(coberturaMicros)}</span>
                            </div>
                            <MicrosList micros={totales.micros || null} coverage={coberturaMicros} metas={targetMicros} compact showNotes={false} />
                        </section>
                    )}
                </div>
            </motion.aside>

            {registrando && (
                <LogMealModal onClose={cerrarComponedor} onScan={pasarAlEscaner} initialDaysAgo={atras} userId={userId} />
            )}
            {escaneando && (
                <Suspense fallback={null}>
                    <ScanMealModal isOpen onClose={cerrarEscaner} userId={userId || 'guest'} initialDaysAgo={atras} />
                </Suspense>
            )}
            {aCompartir && (
                <Suspense fallback={null}>
                    <ShareDaySheet
                        onClose={cerrarCompartir}
                        diario={aCompartir.dia}
                        fecha={aCompartir.fecha}
                        metas={{
                            calories: targetCalories,
                            protein: num(targetMacros?.protein),
                            carbs: num(targetMacros?.carbs),
                            fats: num(targetMacros?.fats),
                        }}
                        microMetas={targetMicros}
                    />
                </Suspense>
            )}
        </>
    );

    return createPortal(<AnimatePresence>{cuerpo}</AnimatePresence>, document.body);
};

DiaryHistory.propTypes = {
    userId: PropTypes.string,
    open: PropTypes.bool,
    onClose: PropTypes.func,
    targetCalories: PropTypes.number,
    targetMacros: PropTypes.object,
    targetMicros: PropTypes.object,
};

/** Botón que abre el cajón. Vive junto al componente para que añadirlo a una
 *  card sea una línea y no haya dos sitios que mantener sincronizados. */
export const DiaryHistoryTrigger = ({ onClick }) => {
    const t = useT();
    return (
        <button type="button" className={styles.trigger} onClick={onClick}>
            <CalendarDays size={14} />
            {t('Ver días anteriores')}
            <ChevronRight size={14} className={styles.triggerChevron} />
        </button>
    );
};

DiaryHistoryTrigger.propTypes = { onClick: PropTypes.func };

export default DiaryHistory;
