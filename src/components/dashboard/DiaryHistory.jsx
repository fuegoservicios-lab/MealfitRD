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
import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarDays, ChevronRight, ChevronLeft, Trash2, Loader2, Plus, FlaskConical, Share, Check, TrendingUp, Star, Map as MapIcon } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { confirmToast } from '../../utils/confirmToast';
import { formatDate, formatNumber, getLocale, useT, useTn } from '../../i18n';
import { useAssessment } from '../../context/AssessmentContext';
import { nombreDeFila } from '../../utils/nombreDeRegistro';
import MicrosList from './MicrosList';
import { resumirMicros, useMicrosSubtitulo } from './microsShared';
import LogMealModal from './LogMealModal';
// [P1-PLAN-LOTE-721 · 2026-09-28] La fila abre la ficha del plato (perezosa, como el escáner) y lleva la miniatura de la
// foto del escáner si este dispositivo la guardó.
import { useIdsConFoto, borrarFotoDeComidaEnSegundoPlano } from '../../hooks/useFotosDeComidas';
import MiniaturaDeComida from './MiniaturaDeComida';
import { getBiologicalDate, getBiologicalDateStr, getCalendarDateStr } from '../../utils/diaBiologico';
import { getCalorieGoalBand, getCalorieGoalState, isStrongDeficit, resolveMainGoal } from '../../utils/calorieGoalStatus';
import { ESTRELLAS_MAX, domingoDe, estrellasDeLaSemana, inicioDeLaSemana1, inicioDelViaje, numeroDeSemana } from '../../utils/progresoDeLosDias';
import { diaUnoDelServidor, invalidarCacheSemanas } from '../../utils/progresoServidor';
import VitrinaDeSemanas from './VitrinaDeSemanas';
import { useResumenDeProgreso } from '../../hooks/useResumenDeProgreso';
import { pedirSemanas } from '../../utils/progresoServidor';
import MapaDeNiveles from './MapaDeNiveles';   // [P1-PLAN-LOTE-1131] el mapa de niveles, vista principal
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import styles from './DiaryHistory.module.css';
import BotonInformeMedico from '../common/BotonInformeMedico';   // [P1-PLAN-LOTE-1034]
import { Button } from '../ui/Button';

// [P1-PLAN-LOTE-224 · 2026-09-24] El escáner, igual: perezoso y montado al abrirlo (ver TrackingProgress). Este cajón
// vive en el mismo trozo del panel, y el escáner reconstruido lo pasaba del techo de precache-guard.
const ScanMealModal = lazy(() => import('./ScanMealModal'));

// [P1-COMPARTIR-DIA-PASADO] La hoja se carga al abrirla, como en la tarjeta (el mismo trozo: canvas + textos). Recibe
// el día TAL CUAL llega del endpoint (`diario`) y lo adapta ella: importar aquí `compartirDia.js` lo metía entero en el
// trozo del panel, que el precache del apex descarga siempre (+1,5 kB gz, por encima del techo de precache-guard).
const ShareDaySheet = lazy(() => import('./ShareDaySheet'));
const FichaDeComida = lazy(() => import('./FichaDeComida'));

// [P1-PLAN-LOTE-165 · 2026-09-22] El día de la semana DENTRO de una frase: en minúscula en español, portugués, francés e
// italiano; en inglés va con mayúscula (salía «You logged it on monday 21»).
const _diaEnFrase = (dia) => (String(getLocale() || '').startsWith('en') ? String(dia || '') : String(dia || '').toLowerCase());

const CAL_ANILLO = 2 * Math.PI * 15;   // el anillo de cada día del mes
// Tope del endpoint (`/consumed-range` clampa a 90) y del retrodatado (`days_ago` ≤ 7 en el backend).
const DIAS_MAX = 90;
const CLAVE_VISTA = 'mealfit_registro_vista';   // [P1-PLAN-LOTE-1131] 'mapa' (por defecto) | 'calendario'
const DIAS_ATRAS_REGISTRO = 7;

// [P1-I18N-DASHBOARD · 2026-08-15] Las tablas de copy son FUNCIONES: evaluadas
// como constantes correrían al importar, antes de que el catálogo exista, y se
// quedarían en español para siempre. Las `key` NO se traducen — son el enum de
// `meal_type` del backend.
//
// El orden es el del DÍA, no el del enum del backend: así la pantalla se lee
// de la mañana a la noche aunque no haya ni una hora fiable.
const getFranjas = (t) => [
    // `color` pinta la regla (relleno); `ink` es la etiqueta (TEXTO): los -400 no llegan a 3:1 sobre blanco.
    { key: 'desayuno', label: t('Desayuno'), color: '#FBBF24', ink: 'var(--ink-pantry)' },
    { key: 'almuerzo', label: t('Almuerzo'), color: '#34D399', ink: 'var(--ink-veggies)' },
    { key: 'merienda', label: t('Merienda'), color: '#F472B6', ink: 'color-mix(in srgb, #F472B6, var(--text-main) 45%)' },
    { key: 'cena', label: t('Cena'), color: '#818CF8', ink: 'var(--primary)' },
];
// `snack` y `extra` (el default del componedor) no tienen fila propia: no son una franja del día sino algo
// suelto entre medias. Se agrupan al final —junto con cualquier valor que no sea una franja— y solo aparecen si
// existen. [P1-PLAN-LOTE-105] antes solo `snack`: lo registrado como «extra» no salía en ninguna fila.
const OTROS = 'otros';
const getOtros = (t) => ({ key: OTROS, label: t('Extras y snacks'), color: '#94A3B8', ink: 'var(--text-muted)' });

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

/** Genera las celdas de la cuadrícula mensual (7 columnas, empezando en domingo). */
const getMesCalendario = (calDate) => {
    const y = calDate.getFullYear();
    const m = calDate.getMonth();
    const primerDia = new Date(y, m, 1, 12, 0, 0, 0);
    const startPadding = primerDia.getDay(); // 0 = Domingo
    const diasEnMes = new Date(y, m + 1, 0, 12, 0, 0, 0).getDate();
    const diasEnMesAnt = new Date(y, m, 0, 12, 0, 0, 0).getDate();

    const celdas = [];
    for (let p = startPadding - 1; p >= 0; p -= 1) {
        const diaNum = diasEnMesAnt - p;
        const fecha = new Date(y, m - 1, diaNum, 12, 0, 0, 0);
        celdas.push({
            day: diaNum,
            iso: aISO(fecha),
            currentMonth: false,
        });
    }
    for (let d = 1; d <= diasEnMes; d += 1) {
        const fecha = new Date(y, m, d, 12, 0, 0, 0);
        celdas.push({
            day: d,
            iso: aISO(fecha),
            currentMonth: true,
        });
    }
    const rem = (7 - (celdas.length % 7)) % 7;
    for (let n = 1; n <= rem; n += 1) {
        const fecha = new Date(y, m + 1, n, 12, 0, 0, 0);
        celdas.push({
            day: n,
            iso: aISO(fecha),
            currentMonth: false,
        });
    }
    return celdas;
};

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

const _recalcularDia = (iso, meals, targets) => {
    const { micros, coverage } = resumirMicros(meals);
    const sum = (k) => Math.round(meals.reduce((acc, m) => acc + (Number(m?.[k]) || 0), 0));
    return {
        iso,
        meals,
        targets,
        totals: {
            calories: sum('calories'),
            protein: sum('protein'),
            carbs: sum('carbs'),
            healthy_fats: Math.round(meals.reduce((acc, m) => acc + (Number(m?.healthy_fats ?? m?.fats) || 0), 0)),
            micros,
            micros_coverage: coverage,
        },
    };
};

const RANGO_CACHE_TTL_MS = 30_000;
const _claveRango = (userId) => `mealfit_diario_rango_${userId}`;
const _leerRangoGuardado = (userId) => {
    if (!userId) return [];
    for (const k of [_claveRango(userId), `mealfit_semana_progreso_${userId}`]) {
        try {
            const crudo = safeLocalStorageGet(k, null);
            const filas = crudo ? JSON.parse(crudo) : null;
            if (Array.isArray(filas) && filas.length > 0) return filas;
        } catch { /* seguir al siguiente */ }
    }
    return [];
};

const DiaryHistory = ({ userId, open, onClose, targetCalories = 2000, targetMacros = {}, targetMicros = null, mainGoal = null, diaInicial = null }) => {
    const t = useT();
    const tn = useTn();
    const subtituloMicros = useMicrosSubtitulo();
    // [P1-PLAN-LOTE-225] Para pintar el nombre de lo comido del plan en el idioma del usuario (`nombreDeRegistro`).
    const { planData, formData } = useAssessment() || {};
    const resolvedMainGoal = resolveMainGoal({ mainGoal, formData, planData });
    // [P1-PLAN-LOTE-162 · 2026-09-22] «Hoy» se recalcula al ABRIR. El cajón vive montado dentro de la tarjeta aunque
    // esté cerrado, así que con `[]` el «hoy» era el del día en que se montó: con la app abierta desde anoche, la tira
    // seguía en ayer y lo que se registraba desde aquí caía en un día desplazado. Al abrir, además, se vuelve a HOY.
    const hoyISO = useMemo(() => getBiologicalDateStr(new Date()), [open]); // eslint-disable-line react-hooks/exhaustive-deps
    const calendarioHoyISO = useMemo(() => getCalendarDateStr(new Date()), [open]); // eslint-disable-line react-hooks/exhaustive-deps
    const [selected, setSelected] = useState(hoyISO);
    // [SEMANA-EN-PROGRESO] «Tu semana» abre el cajón YA en el día tocado (`diaInicial`); sin él, en hoy como siempre.
    useEffect(() => { if (open) setSelected(diaInicial || getBiologicalDateStr(new Date())); }, [open, diaInicial]);
    // [CALENDARIO-SOLO-MES · 2026-11-15] El dueño: la pestaña «Semana» era «incómoda e innecesaria» (la semana ya se ve
    // afuera, en la tarjeta de Progreso). El cajón abre directo en el MES.
    const [filtro, setFiltro] = useState(null);   // null | 'green' | 'under' | 'over': resalta esos días del mes
    const [calDate, setCalDate] = useState(() => {
        const d = getBiologicalDate(new Date());
        return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
    });
    useEffect(() => {
        if (open) {
            // abre en el mes del día con el que se abre (el tocado afuera, o hoy)
            const base = diaInicial ? desdeISO(diaInicial) : getBiologicalDate(new Date());
            setCalDate(new Date(base.getFullYear(), base.getMonth(), 1, 12, 0, 0, 0));
            setFiltro(null);
        }
    }, [open, diaInicial]);
    const [maxDias, setMaxDias] = useState(DIAS_MAX);
    // [P1-PLAN-LOTE-1131 · 2026-11-20] Dos vistas: el MAPA de niveles (principal, cada día es un nivel) y el calendario
    // del mes. La elección se recuerda en este dispositivo.
    const [vista, setVistaEstado] = useState(() => (safeLocalStorageGet(CLAVE_VISTA, 'mapa') === 'calendario' ? 'calendario' : 'mapa'));
    const setVista = useCallback((v) => { setVistaEstado(v); safeLocalStorageSet(CLAVE_VISTA, v); }, []);

    const cambiarMes = useCallback((delta) => {
        setCalDate((actual) => {
            const siguiente = new Date(actual.getFullYear(), actual.getMonth() + delta, 1, 12, 0, 0, 0);
            const hoy = getBiologicalDate(new Date());
            if (siguiente.getFullYear() > hoy.getFullYear() ||
                (siguiente.getFullYear() === hoy.getFullYear() && siguiente.getMonth() > hoy.getMonth())) {
                return actual;
            }
            const diasAtrasMes = Math.ceil((hoy - siguiente) / 86400000) + 35;
            if (diasAtrasMes > maxDias) {
                setMaxDias(Math.min(365, Math.max(90, diasAtrasMes)));
            }
            return siguiente;
        });
    }, [maxDias]);

    const irASemana = useCallback((iso) => {
        const d = desdeISO(iso);
        const hoy = getBiologicalDate(new Date());
        const diasAtrasMes = Math.ceil((hoy - new Date(d.getFullYear(), d.getMonth(), 1, 12)) / 86400000) + 35;
        if (diasAtrasMes > maxDias) setMaxDias(Math.min(365, Math.max(90, diasAtrasMes)));
        setCalDate(new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0));
        setFiltro(null);
    }, [maxDias]);

    const esMesActual = useMemo(() => {
        const hoy = getBiologicalDate(new Date());
        return calDate.getFullYear() === hoy.getFullYear() && calDate.getMonth() === hoy.getMonth();
    }, [calDate]);

    const diasSemanaLetras = useMemo(() => {
        return [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const d = new Date(2026, 9, 25 + i, 12, 0, 0, 0);
            return diaLetra(d);
        });
    }, []);

    const calDias = useMemo(() => getMesCalendario(calDate), [calDate]);
    const [resumenEstado, setResumenEstado] = useState(() => ({
        uid: userId,
        items: _leerRangoGuardado(userId),
    }));
    const respaldoResumen = useMemo(
        () => (resumenEstado.uid === userId ? null : _leerRangoGuardado(userId)),
        [resumenEstado.uid, userId],
    );
    const resumen = resumenEstado.uid === userId ? resumenEstado.items : respaldoResumen;
    const [dia, setDia] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    // [P1-PLAN-LOTE-105] sube cuando algo cambió (borrar aquí, registrar en el componedor, la tarjeta o el chat)
    const [version, setVersion] = useState(0);
    // [P1-PLAN-LOTE-1161] el mapa de niveles con el juego por puntos: estrellas por semana y racha del SERVIDOR
    const resumenJuego = useResumenDeProgreso(open ? userId : null);
    const [semanasJuego, setSemanasJuego] = useState(null);
    useEffect(() => {
        if (!open || !userId || !resumenJuego?.puntos) return undefined;
        let vivo = true;
        pedirSemanas(userId).then((l) => { if (vivo && Array.isArray(l)) setSemanasJuego(l); }).catch(() => {});
        return () => { vivo = false; };
    }, [open, userId, resumenJuego?.puntos, version]);
    const juegoDelMapa = useMemo(() => {
        if (!resumenJuego?.puntos || !semanasJuego) return null;
        const conPuntos = semanasJuego.filter((s) => Number.isFinite(Number(s?.puntos)));
        if (!conPuntos.length) return null;
        return {
            estrellas: new Map(conPuntos.map((s) => [Number(s.numero), Number(s.estrellas) || 0])),
            puntos: new Map(conPuntos.map((s) => [Number(s.numero), Number(s.puntos) || 0])),
            racha: Number(resumenJuego.racha) || 0,
            escudosUsados: new Set(Array.isArray(resumenJuego.escudos_usados) ? resumenJuego.escudos_usados : []),
            totalPuntos: Number.isFinite(Number(resumenJuego.puntos?.total)) ? Number(resumenJuego.puntos.total) : null,
            rango: resumenJuego.rango || null,
        };
    }, [resumenJuego, semanasJuego]);
    const [borrandoId, setBorrandoId] = useState(null);
    const borrandoRef = useRef(new Set());
    const eliminadasRef = useRef(new Set());
    const [registrando, setRegistrando] = useState(false);
    // [P1-PLAN-LOTE-124] El dueño: «registrar comida mediante ver días anteriores no aparece la manera de agregar
    // mediante la cámara o foto». El componedor se montaba aquí sin `onScan`, y sin él no pinta las pestañas
    // «Buscar o escribir / Escanear con foto». Ahora cede el paso al escáner, que nace YA en el día que se mira.
    const [escaneando, setEscaneando] = useState(false);
    // [P1-COMPARTIR-DIA-PASADO] `{ dia, fecha }` del día que se comparte, fijado al tocar el botón; null = cerrada
    const [aCompartir, setACompartir] = useState(null);
    // [P1-PLAN-LOTE-1100] compartir el MES que se mira en el calendario
    const [mesACompartir, setMesACompartir] = useState(null);
    // [P1-PLAN-LOTE-1132] compartir el CAMINO del mapa de niveles (lo que el mapa ya tiene pintado)
    const [caminoACompartir, setCaminoACompartir] = useState(null);
    // [P1-PLAN-LOTE-1135] el mapa en grande: su Escape lo cierra a él, no al cajón
    const [mapaGrande, setMapaGrande] = useState(false);
    // el detalle del día elegido (calorías, comidas): tocar un nivel lo trae a la vista si quedó debajo
    const detalleRef = useRef(null);
    // [P1-PLAN-LOTE-1134] «hay dos [scroll] y quitaste uno… era el otro que tenía al lado» (el dueño, en PC): con el
    // cajón abierto la PÁGINA de fondo seguía desplazable y su barra salía pegada a la del cajón. Se bloquea mientras
    // está abierto (en <html>, que es quien desplaza el dashboard) y se devuelve tal cual al cerrar.
    useEffect(() => {
        if (!open || typeof document === 'undefined') return undefined;
        const raiz = document.documentElement;
        const antes = raiz.style.overflow;
        raiz.style.overflow = 'hidden';
        return () => { raiz.style.overflow = antes; };
    }, [open]);
    // [P1-PLAN-LOTE-721] la comida cuya ficha está abierta, o null
    const [fichaMeal, setFichaMeal] = useState(null);
    const idsConFoto = useIdsConFoto(userId);
    const cierreRef = useRef(null);
    const bodyScrollRef = useRef(null);
    const touchStartRef = useRef({ x: 0, y: 0, time: 0 });

    const handleCalTouchStart = useCallback((e) => {
        if (e.touches && e.touches[0]) {
            touchStartRef.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
                time: Date.now(),
            };
        }
    }, []);

    const handleCalTouchEnd = useCallback((e) => {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
        const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
        const dt = Date.now() - touchStartRef.current.time;
        if (dt < 450 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.6) {
            if (dx > 0) {
                cambiarMes(-1);
            } else if (dx < 0 && !esMesActual) {
                cambiarMes(1);
            }
        }
    }, [cambiarMes, esMesActual]);

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

    // [CALENDARIO-SOLO-MES] el mes de un vistazo: cuántos días en meta / bajo / sobre, y la media de los registrados
    const estadoDe = useCallback((iso) => {
        const r = porFecha.get(iso);
        if (!r || !((r.meals_count || 0) > 0)) return null;
        const meta = (r.target_calories > 0 ? r.target_calories : null) ?? targetCalories;
        const e = getCalorieGoalState(r.calories || 0, meta, r.main_goal || resolvedMainGoal);
        return e === 'green' || e === 'over' ? e : 'under';
    }, [porFecha, targetCalories, resolvedMainGoal]);
    const mes = useMemo(() => {
        const out = { green: 0, under: 0, over: 0, n: 0, kcal: 0 };
        calDias.forEach((c) => {
            if (!c.currentMonth || c.iso > hoyISO) return;
            const e = estadoDe(c.iso);
            if (!e) return;
            out[e] += 1;
            out.n += 1;
            out.kcal += Number(porFecha.get(c.iso)?.calories) || 0;
        });
        return { ...out, media: out.n ? Math.round(out.kcal / out.n) : 0 };
    }, [calDias, hoyISO, estadoDe, porFecha]);

    // [SEMANAS-ALINEADAS · 2026-11-15] cada fila del mes ES una semana numerada (domingo a sábado): «S9» y sus estrellas.
    // El primer día lo guarda la tarjeta de Progreso; sin él, sale de lo que haya cargado.
    const semanasDelMes = useMemo(() => {
        // [P1-PLAN-LOTE-1059] el día 1 del SERVIDOR manda (mismo «S9» en cualquier teléfono); sin él, lo deducido aquí
        const delServidor = userId ? diaUnoDelServidor(userId) : null;
        const guardado = userId ? safeLocalStorageGet(`mealfit_semana_inicio_${userId}`, null) : null;
        const inicio = delServidor && delServidor <= hoyISO ? domingoDe(delServidor) : inicioDeLaSemana1(resumen, hoyISO, guardado);
        const out = [];
        for (let i = 0; i < calDias.length; i += 7) {
            const fila = calDias.slice(i, i + 7);
            const domingo = fila[0]?.iso;
            if (!domingo || domingo < inicio || domingo > hoyISO) { out.push(null); continue; }
            const enMeta = fila.filter((c) => c.iso <= hoyISO && estadoDe(c.iso) === 'green').length;
            out.push({
                numero: numeroDeSemana(inicio, domingo),
                estrellas: estrellasDeLaSemana(enMeta),
                enCurso: hoyISO >= domingo && hoyISO <= fila[6].iso,
            });
        }
        return out;
    }, [calDias, resumen, hoyISO, userId, estadoDe]);

    // [P1-PLAN-LOTE-1131] el día 1 del camino: el del SERVIDOR manda (el mismo en cualquier teléfono); sin él, el registro
    // más antiguo cargado. El mapa necesita el historial desde ahí: se pide hasta el tope del endpoint (365).
    const inicioViaje = useMemo(() => {
        const delServidor = userId ? diaUnoDelServidor(userId) : null;
        return delServidor && delServidor <= hoyISO ? delServidor : inicioDelViaje(resumen, hoyISO, null);
    }, [userId, resumen, hoyISO]);
    useEffect(() => {
        if (!open || vista !== 'mapa') return;
        const necesarios = Math.min(365, diasAtras(inicioViaje, hoyISO) + 1);
        if (necesarios > maxDias) setMaxDias(necesarios);
    }, [open, vista, inicioViaje, hoyISO, maxDias]);

    const diaTargets = dia?.iso === selected ? dia?.targets : null;
    const selectedRow = porFecha.get(selected);
    const selectedTargetCal = (diaTargets?.calories > 0 ? diaTargets.calories : null)
        ?? (selectedRow?.target_calories > 0 ? selectedRow.target_calories : null)
        ?? targetCalories;
    const selectedTargetMacros = diaTargets?.macros || selectedRow?.target_macros || targetMacros;
    const selectedMainGoal = diaTargets?.main_goal || selectedRow?.main_goal || resolvedMainGoal;

    const ultimoRangoRef = useRef({ key: '', ts: 0 });
    useEffect(() => {
        if (!open || !userId) return undefined;
        const key = `${userId}:${tzOffset}:${maxDias}:${version}`;
        if (ultimoRangoRef.current.key === key && Date.now() - ultimoRangoRef.current.ts < RANGO_CACHE_TTL_MS) {
            return undefined;
        }
        let vivo = true;
        (async () => {
            try {
                const res = await fetchWithAuth(
                    `/api/diary/consumed-range/${userId}?days=${maxDias}&tzOffset=${tzOffset}`
                );
                const data = await res.json();
                if (vivo && res.ok !== false && Array.isArray(data?.days)) {
                    ultimoRangoRef.current = { key, ts: Date.now() };
                    setResumenEstado({ uid: userId, items: data.days });
                    safeLocalStorageSet(_claveRango(userId), JSON.stringify(data.days));
                }
            } catch {
                // La tira degrada a "sin datos": es contexto, no el contenido.
            }
        })();
        return () => { vivo = false; };
    }, [open, userId, tzOffset, maxDias, version]);

    // [P1-PLAN-LOTE-1085 · 2026-11-18] El dueño: «hay un poco de delay al cambiar los días y el compartir tarda en salir».
    // Cada toque pedía el día al servidor (que además tardaba 0,4-3,4 s calculando micros: arreglado allí con
    // `micros_memo.py`) y «Compartir» esperaba a esa respuesta. Ahora los días ya vistos se guardan aquí (por `version`:
    // cualquier cambio del diario los olvida todos) y, al llegar uno, se piden en segundo plano el anterior y el
    // siguiente: pasar de un día a otro y compartir es inmediato.
    const diasVistosRef = useRef({ version: -1, dias: new Map(), pidiendo: new Set() });
    // Cerrado no escucha los cambios del diario (`refrescar` vive con el cajón abierto): al cerrar se olvida todo.
    useEffect(() => {
        if (!open) diasVistosRef.current = { version: -1, dias: new Map(), pidiendo: new Set() };
    }, [open]);
    const pedirDia = useCallback(async (iso) => {
        const res = await fetchWithAuth(`/api/diary/consumed/${userId}?date=${iso}&tzOffset=${tzOffset}`);
        if (!res.ok) throw new Error('respuesta no OK');
        const data = await res.json();
        // [P1-COMPARTIR-DIA-PASADO] `iso`: la fecha viaja CON sus datos. Mientras carga otro día, `dia` sigue
        // siendo el anterior, y compartir no puede juntar las cifras de uno con la fecha del otro.
        const filtradas = Array.isArray(data?.meals)
            ? data.meals.filter((m) => !eliminadasRef.current.has(m?.id))
            : [];
        return filtradas.length !== (data?.meals || []).length
            ? _recalcularDia(iso, filtradas, data?.targets || null)
            : { iso, meals: filtradas, totals: data?.totals || {}, targets: data?.targets || null };
    }, [userId, tzOffset]);

    useEffect(() => {
        if (!open || !userId) return undefined;
        const memo = diasVistosRef.current;
        if (memo.version !== version) { memo.version = version; memo.dias = new Map(); memo.pidiendo = new Set(); }
        let vivo = true;
        // Los vecinos (sin pasar de hoy), en segundo plano y una sola vez cada uno.
        const precargar = () => {
            [-1, 1].forEach((paso) => {
                const iso = aISO(new Date(mediodiaDe(selected).getTime() + paso * 86400000));
                if (iso > hoyISO || memo.dias.has(iso) || memo.pidiendo.has(iso)) return;
                memo.pidiendo.add(iso);
                pedirDia(iso)
                    .then((d) => { if (diasVistosRef.current === memo && memo.version === version) memo.dias.set(iso, d); })
                    .catch(() => {})
                    .finally(() => memo.pidiendo.delete(iso));
            });
        };
        const visto = memo.dias.get(selected);
        if (visto) {
            setDia(visto);
            setError('');
            setCargando(false);
            precargar();
            return () => { vivo = false; };
        }
        setCargando(true);
        setError('');
        (async () => {
            try {
                const d = await pedirDia(selected);
                if (memo.version === version) memo.dias.set(selected, d);
                if (vivo) { setDia(d); precargar(); }
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
    }, [open, userId, selected, t, version, pedirDia, hoyISO]);

    // [P1-PLAN-LOTE-105] Mientras está abierto, lo que cambie el diario desde fuera (registrar desde el
    // componedor —que dispara `mealfit:refresh-inventory`—, borrar en la tarjeta, el coach) se refleja aquí sin
    // cerrar y volver a abrir. El borrado propio sube `version` a mano y lleva `source` para no reaccionar dos veces.
    const _quitarComidaDeDia = useCallback((prev, mealId) => {
        if (!prev || !Array.isArray(prev.meals)) return prev;
        const meals = prev.meals.filter((m) => m.id !== mealId);
        if (meals.length === prev.meals.length) return prev;
        return _recalcularDia(prev.iso, meals, prev.targets ?? null);
    }, []);

    useEffect(() => {
        const refrescar = (e) => {
            if (e?.detail?.source === 'diary-history') return;
            const deletedId = e?.detail?.deletedMeal?.id;
            if (deletedId) {
                eliminadasRef.current.add(deletedId);
                setDia((prev) => _quitarComidaDeDia(prev, deletedId));
            }
            invalidarCacheSemanas(userId);
            setVersion((v) => v + 1);
        };
        window.addEventListener('mealfit:refresh-inventory', refrescar);
        window.addEventListener('mealfit:diary-changed', refrescar);
        return () => {
            window.removeEventListener('mealfit:refresh-inventory', refrescar);
            window.removeEventListener('mealfit:diary-changed', refrescar);
        };
    }, [userId, _quitarComidaDeDia]);

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
            // [P1-PLAN-LOTE-721] y con la ficha de un plato abierta, lo mismo
            if (aCompartir || mesACompartir || caminoACompartir || fichaMeal || mapaGrande) return;
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
        if (!registrando && !escaneando && !aCompartir && !mesACompartir && !caminoACompartir && !fichaMeal && !mapaGrande) cierreRef.current?.focus({ preventScroll: true });
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, onClose, moverDia, registrando, escaneando, aCompartir, mesACompartir, caminoACompartir, fichaMeal, mapaGrande]);

    // [P1-PLAN-LOTE-105] Borrar desde cualquier día: el mismo DELETE (filtrado por user_id) que la papelera de la
    // tarjeta de hoy. Tras borrar se vuelve a pedir el día y la tira, y se avisa a la tarjeta (si era hoy, sus
    // barras cambian) y a quien más escuche.
    // [P1-PLAN-LOTE-721] true si se borró (la ficha se cierra entonces); borra también la foto del dispositivo.
    const borrarComida = useCallback(async (meal) => {
        if (!meal?.id || borrandoId || borrandoRef.current.has(meal.id)) return false;
        borrandoRef.current.add(meal.id);
        const ok = await confirmToast(
            t('¿Eliminar "{nombre}" del diario? Esta acción no se puede deshacer.', { nombre: meal.meal_name }),
            { confirmLabel: t('Eliminar'), cancelLabel: t('Cancelar'), danger: true }
        );
        if (!ok) {
            borrandoRef.current.delete(meal.id);
            return false;
        }
        setBorrandoId(meal.id);
        try {
            const res = await fetchWithAuth(`/api/diary/consumed/${meal.id}`, { method: 'DELETE' });
            const yaEliminada = res.status === 404;
            const data = await res.json().catch(() => ({}));
            if (!yaEliminada && (!res.ok || !data?.success)) throw new Error(data?.detail || data?.message || 'delete failed');
            eliminadasRef.current.add(meal.id);
            setDia((prev) => _quitarComidaDeDia(prev, meal.id));
            setFichaMeal((cur) => (cur?.id === meal.id ? null : cur));
            invalidarCacheSemanas(userId);
            setVersion((v) => v + 1);
            try {
                window.dispatchEvent(new CustomEvent('mealfit:diary-changed', { detail: { source: 'diary-history', date: selected, userId, deletedMeal: { id: meal.id, name: meal.meal_name } } }));
            } catch { /* best-effort */ }
            borrarFotoDeComidaEnSegundoPlano(userId, meal.id);
            if (!yaEliminada) toast.success(t('"{nombre}" eliminada del diario.', { nombre: meal.meal_name }));
            return true;
        } catch (err) {
            borrandoRef.current.delete(meal.id);
            console.error('Error eliminando comida del diario:', err);
            toast.error(t('No se pudo eliminar la comida. Intenta de nuevo.'));
            return false;
        } finally {
            setBorrandoId(null);
        }
    }, [_quitarComidaDeDia, borrandoId, selected, t, userId]);

    const cerrarComponedor = useCallback(() => setRegistrando(false), []);
    const pasarAlEscaner = useCallback((d) => { setRegistrando(false); setEscaneando(d || true); }, []);
    // [P1-PLAN-LOTE-1152] registrada la foto, si el componedor tenía un plato a medias se vuelve a él
    const cerrarEscaner = useCallback(() => {
        setEscaneando(false);
        if (escaneando?.borrador?.lines?.length) setRegistrando(escaneando);
    }, [escaneando]);
    // [P1-PLAN-LOTE-1151] la X del escáner vuelve al componedor, con la comida y el día que tenía
    const volverAlComponedor = useCallback(() => {
        setEscaneando(false);
        setRegistrando(escaneando && typeof escaneando === 'object' ? escaneando : true);
    }, [escaneando]);
    // memoizado: `onClose` va en las deps de `useModalAccessibility` y uno nuevo por render le robaría el foco
    const cerrarCompartir = useCallback(() => setACompartir(null), []);
    const cerrarCompartirMes = useCallback(() => setMesACompartir(null), []);
    const cerrarCompartirCamino = useCallback(() => setCaminoACompartir(null), []);
    // [P1-PLAN-LOTE-1132] Tocar un nivel elige el día; si su detalle quedó debajo (o tocas OTRA VEZ el mismo día), el
    // cajón baja lo justo para que se vea entero.
    const elegirDesdeMapa = useCallback((iso) => {
        const repetido = iso === selected;
        setSelected(iso);
        requestAnimationFrame(() => {
            const el = detalleRef.current;
            const cuerpo = bodyScrollRef.current;
            if (!el || !cuerpo || typeof el.scrollIntoView !== 'function') return;
            const fuera = el.getBoundingClientRect().top > cuerpo.getBoundingClientRect().bottom - 96;
            if (!repetido && !fuera) return;
            const quieto = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
            el.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'nearest' });
        });
    }, [selected]);
    // [P1-PLAN-LOTE-1100] el mes tal como lo pinta el calendario: verde = en meta, ámbar = bajo, naranja = sobre
    const abrirCompartirMes = () => {
        const ESTADO = { green: 'meta', under: 'bajo', over: 'pasado' };
        const delMes = calDias.filter((c) => c.currentMonth);
        if (!delMes.length) return;
        const dias = delMes.map((c) => ({
            iso: c.iso,
            estado: c.iso > hoyISO ? 'futuro' : (ESTADO[estadoDe(c.iso)] || 'vacio'),
        }));
        setMesACompartir({
            nombre: `${getMeses(t)[calDate.getMonth()]} ${calDate.getFullYear()}`,
            inicio: new Date(calDate.getFullYear(), calDate.getMonth(), 1, 12).getDay(),
            dias,
            enCurso: esMesActual,
        });
    };
    const cerrarFicha = useCallback(() => setFichaMeal(null), []);

    const fecha = desdeISO(selected);
    const esHoy = selected === hoyISO;
    const atras = diasAtras(selected, hoyISO);
    const esHoyCalendario = selected === calendarioHoyISO;
    const esAyerCalendario = diasAtras(selected, calendarioHoyISO) === 1;
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

    const FILTROS = [
        { clave: 'green', texto: t('En meta'), punto: styles.goalLegendGreen },
        { clave: 'under', texto: t('Bajo la meta'), punto: styles.goalLegendAmber },
        { clave: 'over', texto: t('Sobre la meta'), punto: styles.goalLegendOrange },
    ];
    const renderResumenDelMes = () => (
        <div className={styles.monthSummary}>
            <div className={styles.goalLegend} role="group" aria-label={t('Resaltar días')}>
                {FILTROS.map((f) => (
                    <button
                        key={f.clave}
                        type="button"
                        className={`${styles.goalLegendItem} ${styles.goalChip} ${filtro === f.clave ? styles.goalChipActive : ''}`}
                        aria-pressed={filtro === f.clave}
                        disabled={mes[f.clave] === 0}
                        onClick={() => setFiltro((actual) => (actual === f.clave ? null : f.clave))}
                    >
                        <span className={`${styles.goalLegendDot} ${f.punto}`} />
                        {f.texto}
                        <b className={styles.goalChipCount}>{mes[f.clave]}</b>
                    </button>
                ))}
            </div>
            {mes.n > 0 && (
                <div className={styles.weekLine}>
                    {tn(mes.n,
                        'Este mes: media de {kcal} kcal en {n} día con registro',
                        'Este mes: media de {kcal} kcal en {n} días con registro',
                        { kcal: formatNumber(mes.media), n: mes.n })}
                </div>
            )}
            {/* [P1-PLAN-LOTE-1100] el mes como historia: un anillo por día, los días en meta y la mejor racha */}
            {mes.n > 0 && (
                <Button variant="secondary" block className={styles.compartirMes} onClick={abrirCompartirMes}>
                    <Share size={16} strokeWidth={2.25} aria-hidden="true" />
                    {esMesActual ? t('Compartir este mes') : t('Compartir {mes}', { mes: getMeses(t)[calDate.getMonth()] })}
                </Button>
            )}
            {/* [P1-PLAN-LOTE-1059 · plan 1030] las semanas cerradas; tocar una lleva el mes a esa semana */}
            <VitrinaDeSemanas userId={userId} version={version} onElegir={irASemana} />
            {/* [P1-PLAN-LOTE-1034] el resumen para el médico, desde el calendario */}
            <BotonInformeMedico />{/* [P1-PLAN-LOTE-1072] abre una hoja encima del cajón: el cajón no se cierra */}
        </div>
    );

    const renderComida = (meal) => {
        const h = horaFiable(meal);
        const creado = aFecha(meal?.created_at);
        const borrando = borrandoId === meal.id;
        return (
            <div key={meal.id || meal.meal_name} className={styles.meal}>
                {/* [P1-PLAN-LOTE-721] la fila abre la ficha del plato (sin id no: no hay qué pedir) */}
                <button type="button" className={styles.mealBody} onClick={() => !borrando && setFichaMeal(meal)} disabled={!meal.id || borrando}>
                    {meal.id && idsConFoto.has(meal.id) && (
                        <MiniaturaDeComida userId={userId} mealId={meal.id} className={styles.mealThumb} />
                    )}
                    <span className={styles.mealText}>
                    {/* [P1-PLAN-LOTE-225] el nombre en el idioma del usuario (el dato no cambia) */}
                    <span className={styles.mealName}>{nombreDeFila(meal, planData, t) || t('Sin nombre')}</span>
                    <span className={styles.mealMacros}>
                        <span className={styles.mealKcal}>{num(meal.calories)} kcal</span>
                        {/* [P1-PLAN-LOTE-165] «P · C · G» fijas eran incorrectas en inglés (grasa = F) y en francés
                            (glucides/lipides = G/L): la abreviatura es de cada idioma. */}
                        {' · '}{t('P {p} · C {c} · G {g}', { p: num(meal.protein), c: num(meal.carbs), g: num(meal.healthy_fats) })}
                    </span>
                    {/* La hora solo si es de fiar. Si se anotó otro día, se dice ESO
                        — que es verdad y además útil — en vez de una hora inventada. */}
                    {!h && creado && (
                        <span className={styles.loggedOn}>
                            {t('Lo anotaste el {diaSemana} {dia}', {
                                // [P1-PLAN-LOTE-165] en minúscula en es/pt/fr/it; en inglés el día va con mayúscula
                                diaSemana: _diaEnFrase(getDiasLargo(t)[creado.getDay()]),
                                dia: creado.getDate(),
                            })}
                        </span>
                    )}
                    </span>
                </button>
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
                {/* [P1-PLAN-LOTE-388] compartir sube a la fila de «DIARIO», junto a la X y con su piel (junto a las cifras
                    pesaba tanto como el total del día); el título baja con todo el ancho, así «Miércoles 23 de
                    septiembre» sigue cabiendo en una línea */}
                <header className={styles.head}>
                    <div className={styles.headTop}>
                        <div className={styles.eyebrow}>{t('Registro por día')}</div>
                        <div className={styles.headActions}>
                            {conComidas && (
                                <button
                                    type="button"
                                    className={`${styles.closeBtn} ${styles.shareHead}`}
                                    onClick={abrirCompartir}
                                    disabled={cargando}
                                    aria-label={etiquetaCompartir}
                                    title={etiquetaCompartir}
                                >
                                    <Share size={20} strokeWidth={2.25} aria-hidden="true" />
                                </button>
                            )}
                            <button
                                ref={cierreRef} type="button" className={`${styles.closeBtn} ui-close`}
                                onClick={onClose} aria-label={t('Cerrar')}
                            >
                                <X size={20} strokeWidth={2.25} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                    <div className={styles.headTitleRow}>
                        {/* [P1-PLAN-LOTE-1132] «Hoy»/«Ayer» como pastilla junto al título (era una línea entera aparte) */}
                        <div className={styles.dateLine}>
                            <h2 className={styles.dateTitle}>
                                {t('{diaSemana} {dia} de {mes}', {
                                    diaSemana: getDiasLargo(t)[fecha.getDay()],
                                    dia: fecha.getDate(),
                                    mes: getMeses(t)[fecha.getMonth()],
                                })}
                            </h2>
                            {(esHoyCalendario || esAyerCalendario) && (
                                <span className={styles.dateRelative}>{esHoyCalendario ? t('Hoy') : t('Ayer')}</span>
                            )}
                        </div>
                    </div>
                </header>

                <div ref={bodyScrollRef} className={styles.drawerBody}>

                    <>
                        {/* [P1-PLAN-LOTE-1131] Mapa | Calendario */}
                        <div className={styles.vistasZona}>
                        <div className={styles.vistas} role="tablist" aria-label={t('Registro por día')}>
                            <button type="button" role="tab" aria-selected={vista === 'mapa'}
                                className={`${styles.vistaBtn} ${vista === 'mapa' ? styles.vistaBtnActiva : ''}`}
                                onClick={() => setVista('mapa')}>
                                <MapIcon size={16} strokeWidth={2.25} aria-hidden="true" />
                                {t('Mapa')}
                            </button>
                            <button type="button" role="tab" aria-selected={vista === 'calendario'}
                                className={`${styles.vistaBtn} ${vista === 'calendario' ? styles.vistaBtnActiva : ''}`}
                                onClick={() => setVista('calendario')}>
                                <CalendarDays size={16} strokeWidth={2.25} aria-hidden="true" />
                                {t('Calendario')}
                            </button>
                        </div>
                        </div>
                        {vista === 'mapa' ? (
                            <div className={styles.mapaZona}>
                                <MapaDeNiveles
                                    inicioISO={inicioViaje}
                                    hoyISO={hoyISO}
                                    selected={selected}
                                    estadoDe={estadoDe}
                                    porFecha={porFecha}
                                    onElegir={elegirDesdeMapa}
                                    onCompartir={setCaminoACompartir}
                                    onGrande={setMapaGrande}
                                    juego={juegoDelMapa}
                                />
                            </div>
                        ) : (
                        <div
                            className={styles.calendarContainer}
                            onTouchStart={handleCalTouchStart}
                            onTouchEnd={handleCalTouchEnd}
                        >
                            <div className={styles.calHeader}>
                                <button
                                    type="button"
                                    className={styles.calNavBtn}
                                    onClick={() => cambiarMes(-1)}
                                    aria-label={t('Mes anterior')}
                                    title={t('Mes anterior')}
                                >
                                    <ChevronLeft size={18} strokeWidth={2.25} aria-hidden="true" />
                                </button>
                                <div className={styles.calTitle}>
                                    {getMeses(t)[calDate.getMonth()].toUpperCase()} {calDate.getFullYear()}
                                </div>
                                <div className={styles.calRightActions}>
                                    <button
                                        type="button"
                                        className={styles.calNavBtn}
                                        onClick={() => cambiarMes(1)}
                                        disabled={esMesActual}
                                        aria-label={t('Mes siguiente')}
                                        title={t('Mes siguiente')}
                                    >
                                        <ChevronRight size={18} strokeWidth={2.25} aria-hidden="true" />
                                    </button>
                                    {!esMesActual && (
                                        <button
                                            type="button"
                                            className={styles.calTodayBtn}
                                            onClick={() => {
                                                const hoy = new Date();
                                                setSelected(hoyISO);
                                                setCalDate(new Date(hoy.getFullYear(), hoy.getMonth(), 1, 12, 0, 0, 0));
                                            }}
                                            aria-label={t('Ir a hoy ({dia})', { dia: new Date().getDate() })}
                                            title={t('Ir a hoy ({dia})', { dia: new Date().getDate() })}
                                        >
                                            {t('Hoy')}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={styles.calWeekHeader}>
                                <span aria-hidden="true" />
                                {diasSemanaLetras.map((letra, idx) => (
                                    <span
                                        key={idx}
                                        className={`${styles.calWeekLetter} ${idx === 0 ? styles.calSunday : ''}`}
                                    >
                                        {letra}
                                    </span>
                                ))}
                            </div>

                            <div key={`${calDate.getFullYear()}-${calDate.getMonth()}`} className={styles.calGrid} role="grid" aria-label={t('Calendario mensual')}>
                                {calDias.map((c, i) => {
                                    const iso = c.iso;
                                    const r = porFecha.get(iso);
                                    const kcal = r?.calories || 0;
                                    const conDatos = (r?.meals_count || 0) > 0;
                                    const diaTargetCal = (r?.target_calories > 0 ? r.target_calories : null) ?? targetCalories;
                                    const diaMainGoal = r?.main_goal || resolvedMainGoal;
                                    const estado = getCalorieGoalState(kcal, diaTargetCal, diaMainGoal);
                                    const clave = !conDatos ? null : (estado === 'green' || estado === 'over' ? estado : 'under');
                                    const lleno = Math.max(0.06, Math.min(1, diaTargetCal > 0 ? kcal / diaTargetCal : 0));
                                    const apagada = !!filtro && clave !== filtro;
                                    const activo = iso === selected;
                                    const esHoyDia = iso === calendarioHoyISO;
                                    const esFuturo = iso > calendarioHoyISO;

                                    const sem = i % 7 === 0 ? semanasDelMes[i / 7] : undefined;
                                    return (
                                        <Fragment key={iso || i}>
                                        {i % 7 === 0 && (
                                            <span
                                                className={`${styles.calWeekTag} ${sem?.enCurso ? styles.calWeekTagNow : ''}`}
                                                role={sem ? 'img' : undefined}
                                                aria-hidden={sem ? undefined : 'true'}
                                                aria-label={sem ? `${t('Semana {n}', { n: sem.numero })}: ${t('{n} de {total} estrellas', { n: sem.estrellas, total: ESTRELLAS_MAX })}` : undefined}
                                            >
                                                {sem && (
                                                    <>
                                                        <b aria-hidden="true">S{sem.numero}</b>
                                                        <span className={styles.calWeekStars} aria-hidden="true">
                                                            {Array.from({ length: ESTRELLAS_MAX }, (_, k) => (
                                                                <Star key={k} size={8} strokeWidth={2.5} className={k < sem.estrellas ? styles.calWeekStarOn : styles.calWeekStarOff} />
                                                            ))}
                                                        </span>
                                                    </>
                                                )}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            role="gridcell"
                                            aria-selected={activo}
                                            disabled={esFuturo}
                                            className={`
                                                ${styles.calCell}
                                                ${!c.currentMonth ? styles.calCellOtherMonth : ''}
                                                ${activo ? styles.calCellActive : ''}
                                                ${esHoyDia ? styles.calCellToday : ''}
                                                ${esFuturo ? styles.calCellFuture : ''}
                                                ${apagada ? styles.calCellDimmed : ''}
                                            `}
                                            onClick={() => {
                                                if (esFuturo) return;
                                                setSelected(iso);
                                                if (!c.currentMonth) {
                                                    const d = desdeISO(iso);
                                                    setCalDate(new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0));
                                                }
                                            }}
                                            title={conDatos
                                                ? t('{kcal} kcal · {n} comida(s)', { kcal, n: r.meals_count })
                                                : t('Sin registro')}
                                        >
                                            {conDatos && (
                                                <svg className={styles.calRing} viewBox="0 0 36 36" aria-hidden="true">
                                                    <circle className={styles.calRingTrack} cx="18" cy="18" r="15" />
                                                    <circle
                                                        className={`${styles.calCellDot} ${estado === 'green' ? styles.calCellDotGreen : estado === 'over' ? styles.calCellDotOrange : styles.calCellDotYellow}`}
                                                        cx="18" cy="18" r="15"
                                                        style={{ '--largo': CAL_ANILLO, '--resto': CAL_ANILLO * (1 - lleno) }}
                                                    />
                                                </svg>
                                            )}
                                            <span className={styles.calCellNum}>
                                                {estado === 'green' && conDatos
                                                    ? <Check size={15} strokeWidth={3.25} aria-label={String(c.day)} />
                                                    : c.day}
                                            </span>
                                        </button>
                                        </Fragment>
                                    );
                                })}
                            </div>
                            {renderResumenDelMes()}
                        </div>
                        )}
                    </>

                {(() => {
                    const kcalDia = num(totales.calories);
                    const quotaEstado = getCalorieGoalState(kcalDia, selectedTargetCal, selectedMainGoal);
                    const excesoKcal = Math.max(0, kcalDia - num(selectedTargetCal));
                    const band = getCalorieGoalBand(selectedMainGoal);
                    const minPctVerde = Math.round(band.lo * 100);
                    const maxPctVerde = Math.round(band.hi * 100);
                    const minVerde = Math.round(num(selectedTargetCal) * band.lo);
                    const maxVerde = Math.round(num(selectedTargetCal) * band.hi);
                    const deficitFuerte = !esHoy && conComidas && isStrongDeficit(kcalDia, selectedTargetCal, selectedMainGoal);
                    return (
                        <div ref={detalleRef} className={styles.quota}>
                            <div className={styles.quotaTop}>
                                <div className={styles.quotaNumbers}>
                                    <span className={styles.quotaNum}>{kcalDia}</span>
                                    <span className={styles.quotaOf}>{t('de {kcal} kcal', { kcal: selectedTargetCal })}</span>
                                </div>
                                {quotaEstado === 'green' && (
                                    <span className={styles.quotaCompleteBadge}>
                                        <Check size={12} strokeWidth={2.75} aria-hidden="true" />
                                        {t('Meta del día alcanzada')}
                                    </span>
                                )}
                                {quotaEstado === 'over' && excesoKcal > 0 && (
                                    <span className={styles.quotaOverBadge}>
                                        <TrendingUp size={12} strokeWidth={2.5} aria-hidden="true" />
                                        {t('{n} {unit} sobre la meta', { n: formatNumber(excesoKcal), unit: 'kcal' })}
                                    </span>
                                )}
                            </div>
                            <div className={styles.quotaBar}>
                                <motion.div
                                    className={`${styles.quotaFill} ${quotaEstado === 'green' ? styles.quotaFillComplete : quotaEstado === 'over' ? styles.quotaFillOver : ''}`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct(totales.calories, selectedTargetCal)}%` }}
                                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                />
                            </div>
                            {quotaEstado === 'over' && maxVerde > 0 && (
                                <div className={styles.quotaHint}>
                                    {t('Zona en meta: {min}–{max} kcal ({minPct}–{maxPct} % de tu meta)', {
                                        min: formatNumber(minVerde),
                                        max: formatNumber(maxVerde),
                                        minPct: minPctVerde,
                                        maxPct: maxPctVerde,
                                    })}
                                </div>
                            )}
                            {deficitFuerte && (
                                <div className={styles.quotaHint}>
                                    {t('Muy por debajo de tu meta: un déficit tan grande cuesta energía y músculo.')}
                                </div>
                            )}
                        </div>
                    );
                })()}

                <div className={styles.macroRow}>
                    {getMacros(t).map((m) => {
                        const meta = num(selectedTargetMacros?.[m.goal]) || 0;
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
                        const totalFranjaKcal = lleno ? items.reduce((sum, m) => sum + (num(m.calories) || 0), 0) : 0;
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
                                <div className={styles.slotContent}>
                                    <div className={styles.slotHead}>
                                        <span className={styles.slotLabel} style={lleno ? { color: f.ink } : undefined}>
                                            {f.label}
                                        </span>
                                        <div className={styles.slotHeadRight}>
                                            {lleno && totalFranjaKcal > 0 && (
                                                <span className={styles.slotKcalBadge}>{totalFranjaKcal} kcal</span>
                                            )}
                                            {lleno && items.length === 1 && horaFiable(items[0]) && (
                                                <span className={styles.slotNote}>{hhmm(horaFiable(items[0]))}</span>
                                            )}
                                        </div>
                                    </div>
                                    {lleno
                                        ? items.map((meal) => renderComida(meal))
                                        : <div className={styles.slotEmptyText}>{t('Sin registro')}</div>}
                                </div>
                            </motion.div>
                        );
                    })}

                    {!cargando && !error && (porFranja.get(OTROS) || []).length > 0 && (() => {
                        const otrosItems = porFranja.get(OTROS) || [];
                        const otrosKcal = otrosItems.reduce((sum, m) => sum + (num(m.calories) || 0), 0);
                        return (
                            <div className={styles.slot} style={{ color: getOtros(t).color }}>
                                <span className={styles.slotRule} />
                                <div className={styles.slotContent}>
                                    <div className={styles.slotHead}>
                                        <span className={styles.slotLabel} style={{ color: getOtros(t).ink }}>
                                            {getOtros(t).label}
                                        </span>
                                        {otrosKcal > 0 && (
                                            <div className={styles.slotHeadRight}>
                                                <span className={styles.slotKcalBadge}>{otrosKcal} kcal</span>
                                            </div>
                                        )}
                                    </div>
                                    {otrosItems.map((meal) => renderComida(meal))}
                                </div>
                            </div>
                        );
                    })()}

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
                    {/* [P1-PLAN-LOTE-1132] en el mapa, el informe para el médico va al PIE: entre el mapa y el día empujaba
                        el detalle del día fuera de la pantalla */}
                    {vista === 'mapa' && (
                        <div className={styles.informePie}><BotonInformeMedico /></div>
                    )}
                </div>
                </div>
            </motion.aside>

            {registrando && (
                <LogMealModal onClose={cerrarComponedor} onScan={pasarAlEscaner} initialMealType={registrando?.mealType || null} initialDaysAgo={registrando?.daysAgo ?? atras} initialBorrador={registrando?.borrador || null} userId={userId} />
            )}
            {escaneando && (
                <Suspense fallback={null}>
                    <ScanMealModal isOpen onClose={cerrarEscaner} onBack={volverAlComponedor} userId={userId || 'guest'} initialDaysAgo={escaneando?.daysAgo ?? atras} initialMealType={escaneando?.mealType || null} />
                </Suspense>
            )}
            {fichaMeal && (
                <Suspense fallback={null}>
                    <FichaDeComida
                        key={fichaMeal.id}
                        meal={fichaMeal}
                        userId={userId}
                        metas={{
                            calories: selectedTargetCal,
                            protein: num(selectedTargetMacros?.protein),
                            carbs: num(selectedTargetMacros?.carbs),
                            fats: num(selectedTargetMacros?.fats),
                        }}
                        microMetas={targetMicros}
                        onClose={cerrarFicha}
                        onEliminar={borrarComida}
                    />
                </Suspense>
            )}
            {mesACompartir && (
                <Suspense fallback={null}>
                    <ShareDaySheet onClose={cerrarCompartirMes} mes={mesACompartir} />
                </Suspense>
            )}
            {caminoACompartir && (
                <Suspense fallback={null}>
                    <ShareDaySheet onClose={cerrarCompartirCamino} mapa={caminoACompartir} />
                </Suspense>
            )}
            {aCompartir && (
                <Suspense fallback={null}>
                    <ShareDaySheet
                        onClose={cerrarCompartir}
                        diario={aCompartir.dia}
                        fecha={aCompartir.fecha}
                        metas={{
                            calories: selectedTargetCal,
                            protein: num(selectedTargetMacros?.protein),
                            carbs: num(selectedTargetMacros?.carbs),
                            fats: num(selectedTargetMacros?.fats),
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
    mainGoal: PropTypes.string,
    diaInicial: PropTypes.string,
};

/** Botón que abre el cajón. Vive junto al componente para que añadirlo a una
 *  card sea una línea y no haya dos sitios que mantener sincronizados. */
export const DiaryHistoryTrigger = ({ onClick, label, compacto = false }) => {
    const t = useT();
    // [SEMANA-EN-PROGRESO] `compacto`: la píldora «Calendario» de la cabecera de «Tu semana» (la tira ya enseña los días).
    const texto = label || (compacto ? t('Calendario') : t('Calendario y comidas'));
    return (
        <button type="button" className={compacto ? `${styles.trigger} ${styles.triggerCompacto}` : styles.trigger} onClick={onClick} aria-label={texto}>
            <span className={styles.triggerIcon}>
                <CalendarDays size={18} strokeWidth={2.25} aria-hidden="true" />
            </span>
            <span className={styles.triggerLabel}>{texto}</span>
            <ChevronRight size={16} className={styles.triggerChevron} aria-hidden="true" />
        </button>
    );
};

DiaryHistoryTrigger.propTypes = { onClick: PropTypes.func, label: PropTypes.string, compacto: PropTypes.bool };

export default DiaryHistory;
