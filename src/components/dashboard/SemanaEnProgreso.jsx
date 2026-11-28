// [SEMANA-EN-PROGRESO · 2026-11-15] El progreso de los días a la vista, sin abrir nada.
//
// Cada día es un ANILLO que se llena con sus calorías frente a la meta de ese día:
//   · verde con ✓  = día completado (dentro de la banda de la meta);
//   · ámbar        = se quedó corto;   · coral = se pasó;   · punteado = sin registros;   · candado = aún no llega.
// Tocar un día abre debajo su resumen (kcal, macros, comidas) y un botón que lleva al cajón del diario YA en ese día.
//
// [SEMANAS-NUMERADAS · 2026-11-15] «Semana 1, Semana 2… hasta el infinito», estilo videojuego: la Semana 1 empieza el
// primer día con registros; cada semana se ve entera, se ganan hasta 3 estrellas (3, 5 y 7 días en meta) y se puede
// volver a las anteriores con las flechas o deslizando. El día 1 se guarda aparte para que la cuenta no dependa del
// tope de 365 días del endpoint. El «hoy» ya no late hacia afuera (chocaba con el día de al lado): un arco gira
// DENTRO de su propio hueco.
//
// Hoy se pinta con lo que la tarjeta ya tiene en memoria (sube en vivo al registrar); los días pasados salen de
// `/api/diary/consumed-range` (el mismo endpoint del calendario) y se guardan para pintar al instante la próxima vez.
//
// [P1-PLAN-LOTE-1082 · 2026-11-18] «Compartir tu semana»: el botón junto a las flechas (y el del cierre del domingo)
// abre la hoja de compartir con ESTA semana tal como se ve aquí (anillos, días en meta, estrellas, racha, rango).
//
// [P1-PLAN-LOTE-1161 · 2026-11-22] Juego 2.0: la semana suma PUNTOS (registrar, día completo, calorías en la banda,
// proteína, agua) que la racha de días registrando multiplica; las estrellas salen de esos puntos y el rango (con
// división I-III) de los puntos totales. Los puntos de HOY se calculan en vivo con el espejo `utils/juegoPuntos.js`
// sobre la racha del servidor hasta ayer; los de los días pasados y semanas viejas son los del servidor. Con un
// servidor viejo (sin `puntos`) la tarjeta pinta como antes.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Flame, Loader2, Lock, Minus, Plus, Share2, Shield, Star, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { formatDate, formatNumber, useT, useTn } from '../../i18n';
import { getBiologicalDateStr, getCalendarDateStr } from '../../utils/diaBiologico';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import {
    DIAS_DE_LA_SEMANA, DIAS_EN_TIRA, DIAS_MAX_HISTORIA, ESTRELLAS_MAX, construirDias, estrellasDeLaSemana,
    domingoDe, faltanParaLaSiguienteEstrella, fechasDeLaSemana, inicioDelViaje, mediodiaDe, numeroDeSemana, rachaEnMeta,
    ultimosDias,
} from '../../utils/progresoDeLosDias';
import { useResumenDeProgreso } from '../../hooks/useResumenDeProgreso';
import { pedirSemanas } from '../../utils/progresoServidor';
import EscaleraDeRangos from './EscaleraDeRangos';
import PuntosDeHoy from './PuntosDeHoy';
import {
    BONO_SEMANA_PERFECTA, ESCUDOS_MAX, estrellasPorPuntos, faltanParaOtraEstrella, indiceMaestro, logrosDelDia,
    maestroProgreso, nivelIndice, nombreDelRango as nombreConDivision, puntosDeHoy, rangoDelJugador, rangoPorPuntos,
    tramoDeRacha,
} from '../../utils/juegoPuntos';
import CierreDeSemana from './CierreDeSemana';
import { getMacroGoalState } from '../../utils/macroGoalStatus';
import styles from './SemanaEnProgreso.module.css';

// La hoja (y el dibujo de la semana) solo se descargan al tocar «Compartir»: no pesan en el panel.
const ShareDaySheet = lazy(() => import('./ShareDaySheet'));

const RADIO = 17;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
const _claveCache = (userId) => `mealfit_semana_progreso_${userId}`;
const _claveInicio = (userId) => `mealfit_semana_inicio_${userId}`;

// [P1-MACRO-BARS-SEMAFORO · 2026-11-26] El TONO con el que se pinta un día (el `estado` del dato no cambia: lo usan el
// juego, compartir y los tests). Hoy por debajo sigue abierto → gris «en curso»; un día YA CERRADO por debajo de la
// meta → rojo, igual que pasarse. Verde solo si se cumplió. Los mismos tres colores que las barras de macros.
const tonoDelDia = (d) => {
    if (d.estado === 'bajo') return d.esHoy ? 'curso' : 'fallado';
    return d.estado;
};

const estiloAvance = (a) => ({ '--avance': `${Math.round(Math.max(0, Math.min(1, Number(a) || 0)) * 100)}%` });

const _leerCache = (userId) => {
    try {
        const crudo = safeLocalStorageGet(_claveCache(userId), null);
        const filas = crudo ? JSON.parse(crudo) : null;
        return Array.isArray(filas) ? filas : [];
    } catch { return []; }
};

const SemanaEnProgreso = ({
    userId, hoy = null, targetCalories = 0, targetMacros = null, targetMicros = null, mainGoal = '', onAbrirDia = null, onDiaSeleccionado = null, calendario = null,
    detalleCompacto = false, limpiarSeleccion = 0,
}) => {
    const t = useT();
    const tn = useTn();
    const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);
    const [filas, setFilas] = useState(() => _leerCache(userId));
    const [version, setVersion] = useState(0);
    const [elegido, setElegido] = useState(null);
    const [vista, setVista] = useState({ semana: null, sentido: 0 });   // semana null = la semana en curso
    const hoyISO = getBiologicalDateStr(new Date());
    const calendarioISO = getCalendarDateStr(new Date());
    // [P1-PLAN-LOTE-1059 · plan 1030] el juego según el SERVIDOR: su día 1 manda sobre lo deducido en este teléfono
    const servidor = useResumenDeProgreso(userId);
    const [semanasViejas, setSemanasViejas] = useState(null);
    const [escaleraAbierta, setEscaleraAbierta] = useState(false);
    const [aguaVivo, setAguaVivo] = useState(null);
    useEffect(() => {
        setAguaVivo(null);
    }, [servidor?.hoy_puntos?.logros?.agua, servidor?.hoy]);
    useEffect(() => {
        const alCambiarAgua = (e) => {
            const d = e?.detail;
            if (!d || typeof d.glasses !== 'number') return;
            const goal = Number(d.goal) > 0 ? Number(d.goal) : 8;
            setAguaVivo(Boolean(d.completed ?? d.glasses >= goal));
        };
        window.addEventListener('mealfit:water-changed', alCambiarAgua);
        return () => window.removeEventListener('mealfit:water-changed', alCambiarAgua);
    }, []);
    const [compartiendo, setCompartiendo] = useState(false);
    // [P1-PLAN-LOTE-1099] compartir UN día desde «Tu semana»: { iso } mientras se pide, { iso, dia } listo
    const [diaACompartir, setDiaACompartir] = useState(null);

    useEffect(() => {
        if (!userId) return undefined;
        let vivo = true;
        // La primera vez se pide todo el historial (de ahí salen el día 1 y las semanas viejas); los refrescos, solo
        // los últimos 14 días, que se funden con lo que ya hay.
        const pedir = version === 0 ? DIAS_MAX_HISTORIA : DIAS_EN_TIRA;
        (async () => {
            try {
                const res = await fetchWithAuth(`/api/diary/consumed-range/${userId}?days=${pedir}&tzOffset=${tzOffset}`);
                const data = await res.json();
                if (!vivo || !Array.isArray(data?.days)) return;
                setFilas((antes) => {
                    const recientes = new Set(ultimosDias(getBiologicalDateStr(new Date()), DIAS_EN_TIRA));
                    const nuevas = version === 0
                        ? data.days
                        : [...(antes || []).filter((r) => r && !recientes.has(String(r.date))), ...data.days];
                    safeLocalStorageSet(_claveCache(userId), JSON.stringify(nuevas));
                    return nuevas;
                });
            } catch { /* la tira es contexto: sin red se queda con lo guardado */ }
        })();
        return () => { vivo = false; };
    }, [userId, tzOffset, version]);

    // Lo que cambie el diario (registrar, borrar, el coach) o volver a la app al día siguiente refresca la tira.
    useEffect(() => {
        // Lo que borra la propia tarjeta de hoy no pide nada: su anillo ya se movió con los datos en vivo (`hoy`),
        // salvo que haya borrado/editado un día pasado.
        const refrescar = (e) => {
            if (e?.detail?.source !== 'tracking-progress' || e?.detail?.isPastDay) {
                setVersion((v) => v + 1);
            }
        };
        const alVolver = () => { if (!document.hidden) setVersion((v) => v + 1); };
        window.addEventListener('mealfit:refresh-inventory', refrescar);
        window.addEventListener('mealfit:diary-changed', refrescar);
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            window.removeEventListener('mealfit:refresh-inventory', refrescar);
            window.removeEventListener('mealfit:diary-changed', refrescar);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, []);

    // Se guarda el PRIMER DÍA con registros; las semanas se cuentan desde el domingo de esa semana (como el calendario).
    const diaUnoServidor = servidor?.dia_1 && servidor.dia_1 <= hoyISO ? servidor.dia_1 : null;
    const primerDia = useMemo(
        () => diaUnoServidor
            || inicioDelViaje(filas, hoyISO, userId ? safeLocalStorageGet(_claveInicio(userId), null) : null),
        [diaUnoServidor, filas, hoyISO, userId],
    );
    useEffect(() => { if (userId) safeLocalStorageSet(_claveInicio(userId), primerDia); }, [userId, primerDia]);
    const inicio = domingoDe(primerDia);

    const semanaActual = numeroDeSemana(inicio, hoyISO);
    const semana = Math.max(1, Math.min(vista.semana ?? semanaActual, semanaActual));
    const enCurso = semana === semanaActual;
    const dias = useMemo(
        () => construirDias({
            hoyISO, calendarioISO, filas, hoy, targetCalories, targetMacros, mainGoal, fechas: fechasDeLaSemana(inicio, semana),
        }),
        [hoyISO, calendarioISO, filas, hoy, targetCalories, targetMacros, mainGoal, inicio, semana],
    );
    const racha = useMemo(
        () => rachaEnMeta(construirDias({
            hoyISO, filas, hoy, targetCalories, targetMacros, mainGoal,
            n: Math.min(DIAS_MAX_HISTORIA, semanaActual * DIAS_DE_LA_SEMANA),
        })),
        [hoyISO, filas, hoy, targetCalories, targetMacros, mainGoal, semanaActual],
    );
    // Más atrás del tope de 365 días del endpoint no hay detalle por día: el resumen de la semana lo da el servidor.
    const fueraDeHistoria = Math.round((mediodiaDe(hoyISO) - mediodiaDe(dias[DIAS_DE_LA_SEMANA - 1].iso)) / 86400000)
        >= DIAS_MAX_HISTORIA;
    // [1161] las semanas pasadas traen sus PUNTOS del servidor: se piden al mirar una (caché de 30 s).
    useEffect(() => {
        if ((enCurso && !fueraDeHistoria) || semanasViejas || !userId) return undefined;
        let vivo = true;
        pedirSemanas(userId).then((l) => { if (vivo) setSemanasViejas(l); }).catch(() => {});
        return () => { vivo = false; };
    }, [enCurso, fueraDeHistoria, semanasViejas, userId]);
    const deServidor = (semanasViejas || []).find((x) => x.numero === semana) || null;
    const enMeta = fueraDeHistoria && deServidor ? deServidor.dias_en_meta : dias.filter((d) => d.estado === 'meta').length;

    // [1161] juego por puntos (solo con un servidor que ya los da)
    const juego = Boolean(servidor && servidor.puntos && servidor.hoy_puntos);
    const enCursoServidor = juego && Number(servidor.semana?.numero) === semanaActual;
    // El resumen guardado puede ser de AYER (la app abre con la caché antes de refrescar): entonces su «hoy» ya es un
    // día cerrado — su racha completa es la de «hasta ayer» y sus puntos de hoy no se restan. Sin embargo, en un día
    // biológico extendido, `hoyISO` ya coincide con una entrada en `servidor.semana.dias`: siempre descontamos esos
    // puntos antes de sumar `hoyVivo.puntos` para nunca duplicar puntos del mismo día.
    const diaHoyServidor = juego && enCursoServidor
        ? (servidor.semana?.dias || []).find((d) => d.iso === hoyISO) || null
        : null;
    const mismoDia = juego && servidor.hoy === hoyISO;
    const deAyer = juego && !mismoDia && String(servidor.hoy || '') < hoyISO
        && !(diaHoyServidor && diaHoyServidor.estado && diaHoyServidor.estado !== 'vacio');
    const rachaBase = juego ? Number(deAyer ? servidor.racha : servidor.racha_hasta_ayer) || 0 : 0;
    const ptsHoyServidor = mismoDia
        ? Number(servidor.hoy_puntos?.puntos) || 0
        : (diaHoyServidor && diaHoyServidor.puntos != null ? Number(diaHoyServidor.puntos) || 0 : 0);
    const hoyVivo = useMemo(() => {
        if (!juego) return null;
        const lg = logrosDelDia({
            calories: hoy?.calories,
            protein: hoy?.protein,
            carbs: hoy?.carbs,
            fats: hoy?.fats,
            mealsCount: hoy?.mealsCount,
            metaKcal: targetCalories,
            metaProteina: targetMacros?.protein,
            metaCarbos: targetMacros?.carbs,
            metaGrasas: targetMacros?.fats,
            micros: hoy?.micros,
            metaMicros: targetMicros || servidor.meta_micros || null,
            objetivo: mainGoal,
        });
        // el agua la sabe el servidor (su contador vive aparte); de otro día, solo si está encendida
        const aguaServidor = servidor.hoy_puntos?.logros?.agua ?? null;
        let aguaEstado = mismoDia ? aguaServidor : (aguaServidor === null ? null : false);
        if (aguaEstado !== null && aguaVivo !== null) aguaEstado = aguaVivo;
        lg.agua = aguaEstado;
        if (lg.agua && !lg.registro) lg.agua = false;
        lg.dia_perfecto = Boolean(
            lg.banda && lg.proteina && lg.completo
            && lg.carbos !== false && lg.grasas !== false && lg.micros !== false
            && !lg.sodio_pasado && !lg.potasio_pasado && !lg.fibra_baja
            && !lg.satfat_pasado && !lg.azucar_pasado
            && lg.agua !== false
        );
        return { ...puntosDeHoy({ logros: lg, rachaHastaAyer: rachaBase }), logros: lg };
    }, [juego, servidor, hoy, targetCalories, targetMacros, targetMicros, mainGoal, mismoDia, rachaBase, aguaVivo]);
    const puntosSemana = (() => {
        if (!juego) return null;
        if (enCurso && enCursoServidor) {
            return Math.max(0, (Number(servidor.semana.puntos) || 0) - ptsHoyServidor + (hoyVivo?.puntos || 0));
        }
        return deServidor && Number.isFinite(Number(deServidor.puntos)) ? Number(deServidor.puntos) : null;
    })();
    const porPuntos = puntosSemana !== null;
    const estrellas = porPuntos ? estrellasPorPuntos(puntosSemana) : estrellasDeLaSemana(enMeta);
    const faltan = porPuntos ? faltanParaOtraEstrella(puntosSemana) : faltanParaLaSiguienteEstrella(enMeta);
    const puntosDelDia = new Map(enCursoServidor && enCurso
        ? (servidor.semana.dias || []).map((d) => [d.iso, d.iso === hoyISO ? hoyVivo?.puntos : d.puntos])
        : []);
    // [P1-PLAN-LOTE-1163] la semana en curso EN VIVO (para el bono de +30 al llegar a 3★ sin esperar al servidor).
    const ptsSemanaVivo = enCursoServidor
        ? Math.max(0, (Number(servidor.semana.puntos) || 0) - ptsHoyServidor + (hoyVivo?.puntos || 0))
        : 0;
    const perfectaServidor = enCursoServidor && estrellasPorPuntos(Number(servidor.semana.puntos) || 0) === 3;
    const perfectaVivo = enCursoServidor && estrellasPorPuntos(ptsSemanaVivo) === 3;
    const bonoVivo = enCursoServidor
        ? (perfectaVivo ? BONO_SEMANA_PERFECTA : 0) - (perfectaServidor ? Number(servidor.semana.bono ?? BONO_SEMANA_PERFECTA) || 0 : 0)
        : 0;
    const perfectasVivo = juego
        ? Math.max(0, (Number(servidor.total?.semanas_perfectas) || 0) + (perfectaVivo ? 1 : 0) - (perfectaServidor ? 1 : 0))
        : 0;
    const totalVivo = juego ? (Number(servidor.puntos.total) || 0) - ptsHoyServidor + (hoyVivo?.puntos || 0) + bonoVivo : 0;
    const rangoServidorIdx = servidor?.rango?.clave === 'maestro'
        ? indiceMaestro()
        : servidor?.rango?.division
            ? nivelIndice(servidor.rango.clave, servidor.rango.division)
            : 0;
    const rangoVivoBase = juego ? rangoPorPuntos(totalVivo) : null;
    const [pisoGuardado, setPisoGuardado] = useState({ userId, idx: 0 });
    const maxVivo = Math.max(
        pisoGuardado.userId === userId ? pisoGuardado.idx : 0,
        rangoServidorIdx,
        rangoVivoBase ? rangoVivoBase.indice : 0,
    );
    if (pisoGuardado.userId !== userId || pisoGuardado.idx !== maxVivo) {
        setPisoGuardado({ userId, idx: maxVivo });
    }
    const rachaVivo = juego ? rachaBase + (hoyVivo?.logros?.registro ? 1 : 0) : 0;
    const mejorRachaVivo = juego ? Math.max(Number(servidor.mejor_racha) || 0, rachaVivo) : 0;
    const rangoVivo = juego ? rangoDelJugador(totalVivo, perfectasVivo, mejorRachaVivo, maxVivo) : null;
    const escudosUsados = useMemo(() => {
        const lista = Array.isArray(servidor?.escudos_usados) ? servidor.escudos_usados : [];
        const sem = Array.isArray(servidor?.semana?.dias)
            ? servidor.semana.dias.filter((d) => d.escudo).map((d) => d.iso)
            : [];
        return new Set([...lista, ...sem]);
    }, [servidor]);
    const estadoHoy = dias.find((d) => d.esHoy)?.estado || 'vacio';
    const diaDeLaSemana = dias.findIndex((d) => d.esHoy) + 1;
    const sel = elegido ? dias.find((d) => d.iso === elegido) : null;
    const diasConRegistro = dias.filter((d) => d.estado !== 'vacio' && d.estado !== 'futuro');
    const registradosSemana = fueraDeHistoria && deServidor
        ? Number(deServidor.dias_registrados) || 0
        : diasConRegistro.length;
    const kcalMediaSemana = (() => {
        if (fueraDeHistoria && Number(deServidor?.kcal_media) > 0) return Math.round(Number(deServidor.kcal_media));
        if (diasConRegistro.length) {
            return Math.round(diasConRegistro.reduce((acc, d) => acc + (d.calories || 0), 0) / diasConRegistro.length);
        }
        return Number(deServidor?.kcal_media) > 0 ? Math.round(Number(deServidor.kcal_media)) : 0;
    })();
    const protMediaSemana = !fueraDeHistoria && diasConRegistro.length
        ? Math.round(diasConRegistro.reduce((acc, d) => acc + (d.protein || 0), 0) / diasConRegistro.length)
        : null;

    const irA = (n) => {
        const destino = Math.max(1, Math.min(n, semanaActual));
        if (destino === semana) return;
        setElegido(null);
        setVista({ semana: destino === semanaActual ? null : destino, sentido: destino > semana ? 1 : -1 });
    };

    const textoEstado = (d) => {
        if (d.estado === 'meta') return t('Meta cumplida');
        if (d.estado === 'futuro') return t('Aún no llega');
        if (d.estado === 'vacio') return t('Sin registros');
        const kcal = formatNumber(Math.abs(d.target - d.calories));
        if (d.estado === 'pasado') return t('{kcal} kcal de más', { kcal });
        return d.esHoy ? t('Te faltan {kcal} kcal', { kcal }) : t('{kcal} kcal por debajo', { kcal });
    };
    const fechaLarga = (d) => (d.esCalendarioHoy
        ? t('Hoy')
        : formatDate(mediodiaDe(d.iso), { weekday: 'long', day: 'numeric', month: 'long' }));
    const onDiaSeleccionadoRef = useRef(onDiaSeleccionado);
    onDiaSeleccionadoRef.current = onDiaSeleccionado;
    const selIso = sel?.iso || null;
    const selEsHoy = Boolean(sel?.esHoy);
    const selEtiqueta = sel ? fechaLarga(sel) : '';
    // [P1-DIA-EN-EL-CONTADOR · 2026-11-27] el contador grande pinta el día tocado con LAS MISMAS cifras que su anillo
    const selCal = Number(sel?.calories) || 0;
    const selPro = Number(sel?.protein) || 0;
    const selCarb = Number(sel?.carbs) || 0;
    const selFat = Number(sel?.fats) || 0;
    const selMeta = Number(sel?.target) || 0;
    const selMetaPro = Number(sel?.targetMacros?.protein) || 0;
    const selMetaCarb = Number(sel?.targetMacros?.carbs) || 0;
    const selMetaFat = Number(sel?.targetMacros?.fats) || 0;
    const selComidas = Number(sel?.mealsCount) || 0;
    const selEstado = sel?.estado || null;
    useEffect(() => {
        if (!onDiaSeleccionadoRef.current) return;
        onDiaSeleccionadoRef.current(
            selIso ? {
                iso: selIso, esHoy: selEsHoy, etiqueta: selEtiqueta, estado: selEstado, mealsCount: selComidas,
                calories: selCal, protein: selPro, carbs: selCarb, fats: selFat,
                target: selMeta, targetMacros: { protein: selMetaPro, carbs: selMetaCarb, fats: selMetaFat },
            } : null,
        );
    }, [selIso, selEsHoy, selEtiqueta, hoyISO, selEstado, selComidas, selCal, selPro, selCarb, selFat, selMeta,
        selMetaPro, selMetaCarb, selMetaFat]);
    // «Volver a hoy» desde el contador: el padre sube el contador y la semana suelta el día elegido
    const limpiarPrevio = useRef(limpiarSeleccion);
    useEffect(() => {
        if (limpiarPrevio.current === limpiarSeleccion) return;
        limpiarPrevio.current = limpiarSeleccion;
        setElegido(null);
    }, [limpiarSeleccion]);
    const fechaCorta = (iso) => formatDate(mediodiaDe(iso), { day: 'numeric', month: 'short' });

    const macros = sel ? [
        { clave: 'protein', nombre: t('Proteína'), valor: sel.protein, meta: Number(sel.targetMacros?.protein) || 0 },
        { clave: 'carbs', nombre: t('Carbos'), valor: sel.carbs, meta: Number(sel.targetMacros?.carbs) || 0 },
        { clave: 'fats', nombre: t('Grasas'), valor: sel.fats, meta: Number(sel.targetMacros?.fats) || 0 },
    ] : [];

    // [P1-MACRO-BARS-SEMAFORO] cada macro del día tocado con la misma regla que la tarjeta de hoy; un día cerrado que
    // no llegó al 90 % de la meta queda en rojo (hoy, en gris: todavía puede llegar)
    const tonoDelMacro = (m) => {
        const e = getMacroGoalState(m.valor, m.meta);
        if (e === 'progress') return sel && !sel.esHoy && m.meta > 0 ? 'fallado' : 'curso';
        return e === 'done' ? 'meta' : 'pasado';
    };

    const titulo = t('Semana {n}', { n: semana });
    const rango = servidor?.rango || null;
    const nombreDelRango = (clave) => ({
        bronce: t('Bronce'), plata: t('Plata'), oro: t('Oro'), platino: t('Platino'), diamante: t('Diamante'),
    })[clave] || '';
    const textoRacha = tn(racha, '{n} día seguido', '{n} días seguidos', { n: racha });
    const escaleraProps = juego
        ? {
            puntos: totalVivo,
            racha: rachaVivo,
            escudos: Number(servidor.escudos) || 0,
            aguaEncendida: hoyVivo?.logros?.agua !== null,
            mejorRacha: mejorRachaVivo,
            recordDia: Number(servidor.puntos?.record_dia) || 0,
            rango: rangoVivo,
            maestro: maestroProgreso(totalVivo, perfectasVivo, mejorRachaVivo),
            diasJugados: diaUnoServidor
                ? Math.max(1, Math.round((mediodiaDe(hoyISO) - mediodiaDe(diaUnoServidor)) / 86400000) + 1)
                : 0,
        }
        : {};
    // [1082] Se comparte una semana con algo anotado y con su detalle por día (más atrás de 365 días solo hay el total).
    const sePuedeCompartir = !fueraDeHistoria && dias.some((d) => d.estado !== 'vacio' && d.estado !== 'futuro');
    const semanaParaCompartir = compartiendo ? {
        numero: semana,
        enCurso,
        periodo: `${fechaCorta(dias[0].iso)} – ${fechaCorta(dias[DIAS_DE_LA_SEMANA - 1].iso)}`,
        dias: dias.map((d) => ({ iso: d.iso, estado: d.estado, abierto: !!d.esHoy, ratio: d.ratio, letra: formatDate(mediodiaDe(d.iso), { weekday: 'narrow' }) })),
        enMeta,
        estrellas,
        // la racha es la de HOY: solo cuenta en la semana en curso
        racha: enCurso ? (juego ? rachaVivo : racha) : 0,
        rango: rangoVivo?.clave || rango?.clave || null,
        division: rangoVivo?.division || null,
        puntos: porPuntos ? puntosSemana : null,
    } : null;
    // [P1-PLAN-LOTE-1099] El día tal cual lo devuelve el Diario (comidas y totales) y su fecha a mediodía.
    const compartirDia = async (iso) => {
        if (!userId || diaACompartir) return;
        setDiaACompartir({ iso });
        try {
            const res = await fetchWithAuth(`/api/diary/consumed/${userId}?date=${iso}&tzOffset=${tzOffset}`);
            if (!res.ok) throw new Error('dia');
            const data = await res.json();
            const meals = Array.isArray(data?.meals) ? data.meals : [];
            if (!meals.length) throw new Error('vacio');
            setDiaACompartir({ iso, dia: { iso, meals, totals: data?.totals || {} } });
        } catch {
            setDiaACompartir(null);
            toast.error(t('No pudimos preparar ese día. Inténtalo otra vez.'));
        }
    };
    // Desde el cierre del domingo: se va a esa semana y se abre la hoja con ella.
    const compartirSemana = (n) => {
        if (Number.isFinite(Number(n)) && Number(n) !== semana) irA(Number(n));
        setCompartiendo(true);
    };
    return (
        <section
            className={`${styles.semana} ${estrellas === ESTRELLAS_MAX ? styles.semanaPerfecta : ''}`}
            aria-label={titulo}
        >
            <div className={styles.cabecera}>
                <div className={styles.nivel}>
                    {/* el número ya lo dice el título: la insignia lleva el trofeo (dorada con las 3 estrellas) */}
                    {/* [P1-PLAN-LOTE-1068] Con rango, la insignia abre la escalera de rangos (petición del dueño). */}
                    {rango ? (
                        <button
                            type="button"
                            className={`${styles.insignia} ${styles.insigniaBoton} ${styles[`rango_${rangoVivo?.clave || rango.clave}`] || ''}`}
                            onClick={() => setEscaleraAbierta(true)}
                            aria-label={t('Ver los rangos y cómo subir')}
                            aria-haspopup="dialog"
                        >
                            <Trophy key={semana} size={22} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                    ) : (
                        <span className={styles.insignia} aria-hidden="true"><Trophy key={semana} size={22} strokeWidth={2.25} /></span>
                    )}
                    <div className={styles.nivelTexto}>
                        <h3 className={styles.titulo}>{titulo}</h3>
                        <p className={styles.sub}>
                            {enCurso
                                ? t('Día {n} de {total}', { n: diaDeLaSemana, total: DIAS_DE_LA_SEMANA })
                                : `${fechaCorta(dias[0].iso)} – ${fechaCorta(dias[DIAS_DE_LA_SEMANA - 1].iso)}`}
                        </p>
                        {rangoVivo && (
                            <button type="button" className={styles.rango} onClick={() => setEscaleraAbierta(true)} aria-haspopup="dialog">
                                <span className={styles.rangoNombre}>
                                    {nombreConDivision(rangoVivo.clave, rangoVivo.division, t)}
                                    <ChevronRight size={14} strokeWidth={2.5} aria-hidden="true" />
                                </span>
                                {rangoVivo.siguiente && (
                                    <>
                                        <span className={styles.rangoBarra} aria-hidden="true">
                                            <i className={styles.rangoBarraLleno} style={estiloAvance(rangoVivo.avance)} />
                                        </span>
                                        <span className={styles.rangoFalta}>
                                            {t('{n} pts para {rango}', {
                                                n: formatNumber(rangoVivo.puntos_para_la_siguiente),
                                                rango: nombreConDivision(rangoVivo.siguiente.clave, rangoVivo.siguiente.division, t),
                                            })}
                                        </span>
                                    </>
                                )}
                            </button>
                        )}
                        {rango && !rangoVivo && (
                            <button type="button" className={styles.rango} onClick={() => setEscaleraAbierta(true)} aria-haspopup="dialog">
                                <span className={styles.rangoNombre}>
                                    {t('Rango {rango}', { rango: nombreDelRango(rango.clave) })}
                                    <ChevronRight size={14} strokeWidth={2.5} aria-hidden="true" />
                                </span>
                                {rango.siguiente && rango.estrellas_para_el_siguiente > 0 && (
                                    <span className={styles.rangoFalta}>
                                        {tn(rango.estrellas_para_el_siguiente,
                                            // [P1-PLAN-LOTE-1068] corto: junto al botón del calendario la frase larga partía «Oro» a otra línea
                                            'Falta {n} ★ para {rango}',
                                            'Faltan {n} ★ para {rango}',
                                            { n: rango.estrellas_para_el_siguiente, rango: nombreDelRango(rango.siguiente) })}
                                    </span>
                                )}
                            </button>
                        )}
                    </div>
                </div>
                {calendario}
            </div>

            {/* [P1-PLAN-LOTE-1161] el marcador de hoy: puntos en vivo, llama de racha y logros */}
            {juego && enCurso && hoyVivo && (
                <PuntosDeHoy
                    puntos={hoyVivo.puntos}
                    mult={hoyVivo.mult}
                    multActivo={hoyVivo.multActivo}
                    logros={hoyVivo.logros}
                    racha={rachaVivo}
                    tramo={tramoDeRacha(rachaVivo)}
                    escudos={Number(servidor.escudos) || 0}
                    escudosMax={Number(servidor.escudos_max) || ESCUDOS_MAX}
                    onAbrir={() => setEscaleraAbierta(true)}
                    hoy={hoy}
                    targetProtein={Number(targetMacros?.protein) || 0}
                    targetCarbs={Number(targetMacros?.carbs) || 0}
                    targetFats={Number(targetMacros?.fats) || 0}
                    estadoHoy={estadoHoy}
                    recordDia={Number(servidor.puntos?.record_dia) || 0}
                />
            )}
            {!enCurso && (
                <div
                    className={`${styles.cerradaResumen} ${estrellas === ESTRELLAS_MAX ? styles.cerradaPerfecta : ''}`}
                    aria-label={t('Resumen de la semana')}
                >
                    <div className={styles.cerradaCima}>
                        <div className={styles.cerradaPrincipal}>
                            <span className={styles.cerradaEtiqueta}>{t('Resumen de la semana')}</span>
                            <span className={styles.cerradaCifra}>
                                {porPuntos ? (
                                    <>
                                        <strong>{formatNumber(puntosSemana)}</strong>
                                        <span className={styles.cerradaUnidad}>{t('pts')}</span>
                                    </>
                                ) : (
                                    <>
                                        <strong>{enMeta}</strong>
                                        <span className={styles.cerradaUnidad}>/ {DIAS_DE_LA_SEMANA}</span>
                                    </>
                                )}
                            </span>
                        </div>
                        <div className={styles.cerradaInsignia}>
                            <span className={styles.cerradaEstrellas} aria-hidden="true">
                                {Array.from({ length: ESTRELLAS_MAX }, (_, i) => (
                                    <Star
                                        key={i}
                                        size={15}
                                        strokeWidth={2.25}
                                        className={i < estrellas ? styles.estrellaGanada : styles.estrella}
                                    />
                                ))}
                            </span>
                            <span className={styles.cerradaEstado}>{t('Semana cerrada')}</span>
                        </div>
                    </div>
                    <dl className={styles.cerradaGrid}>
                        <div className={styles.cerradaStat}>
                            <dt>{t('Días en meta')}</dt>
                            <dd className={enMeta > 0 ? styles.cerradaStatBien : ''}>{enMeta}/{DIAS_DE_LA_SEMANA}</dd>
                        </div>
                        <div className={styles.cerradaStat}>
                            <dt>{t('Registrados')}</dt>
                            <dd>{registradosSemana}/{DIAS_DE_LA_SEMANA}</dd>
                        </div>
                        <div className={styles.cerradaStat}>
                            <dt>{t('Media diaria')}</dt>
                            <dd>{kcalMediaSemana > 0 ? t('{n} kcal', { n: formatNumber(kcalMediaSemana) }) : '—'}</dd>
                        </div>
                        <div className={styles.cerradaStat}>
                            <dt>{t('Proteína media')}</dt>
                            <dd>{protMediaSemana !== null ? `${formatNumber(protMediaSemana)} g` : '—'}</dd>
                        </div>
                    </dl>
                    {!fueraDeHistoria && (
                        <p className={styles.cerradaPista}>{t('Toca un día para ver su detalle.')}</p>
                    )}
                </div>
            )}
            {/* [P1-PLAN-LOTE-1059 · plan 1035] cierre de semana e hitos: una vez, y se marcan vistos en el servidor */}
            <CierreDeSemana userId={userId} eventos={servidor?.eventos} onCompartir={compartirSemana} />
            {diaACompartir?.dia && (
                <Suspense fallback={null}>
                    <ShareDaySheet
                        onClose={() => setDiaACompartir(null)}
                        diario={diaACompartir.dia}
                        fecha={mediodiaDe(diaACompartir.iso)}
                        metas={{
                            calories: targetCalories || 0,
                            protein: Number(targetMacros?.protein) || 0,
                            carbs: Number(targetMacros?.carbs) || 0,
                            fats: Number(targetMacros?.fats) || 0,
                        }}
                    />
                </Suspense>
            )}
            {semanaParaCompartir && (
                <Suspense fallback={null}>
                    <ShareDaySheet onClose={() => setCompartiendo(false)} semana={semanaParaCompartir} />
                </Suspense>
            )}
            {rango && (
                <EscaleraDeRangos
                    abierta={escaleraAbierta}
                    onCerrar={() => setEscaleraAbierta(false)}
                    estrellas={Number(servidor?.total?.estrellas) || 0}
                    semanasCerradas={Math.max(0, (Number(servidor?.total?.semanas) || 1) - 1)}
                    {...escaleraProps}
                />
            )}

            <div className={styles.resumen}>
                <span
                    className={styles.estrellas}
                    role="img"
                    aria-label={t('{n} de {total} estrellas', { n: estrellas, total: ESTRELLAS_MAX })}
                >
                    {Array.from({ length: ESTRELLAS_MAX }, (_, i) => (
                        <Star
                            key={`${semana}-${i}-${i < estrellas}`}
                            size={18}
                            strokeWidth={2.25}
                            className={i < estrellas ? styles.estrellaGanada : styles.estrella}
                            style={{ '--i': i }}
                            aria-hidden="true"
                        />
                    ))}
                </span>
                <p className={styles.cuenta}>
                    {porPuntos
                        ? <><strong className={styles.cuentaPts}>{formatNumber(puntosSemana)}</strong> {t('pts esta semana')}</>
                        : t('{n} de {total} días en meta', { n: enMeta, total: DIAS_DE_LA_SEMANA })}
                </p>
                {!juego && racha >= 2 && (
                    <span className={styles.racha} role="img" aria-label={textoRacha} title={textoRacha}>
                        <Flame size={14} strokeWidth={2.5} aria-hidden="true" />
                        {racha}
                    </span>
                )}
                <span className={styles.flechas}>
                    {sePuedeCompartir && (
                        <button
                            type="button"
                            className={`${styles.flecha} ${styles.compartir}`}
                            onClick={() => setCompartiendo(true)}
                            aria-label={t('Compartir tu semana')}
                            aria-haspopup="dialog"
                            title={t('Compartir tu semana')}
                        >
                            <Share2 size={16} strokeWidth={2.5} aria-hidden="true" />
                        </button>
                    )}
                    <button
                        type="button"
                        className={styles.flecha}
                        disabled={semana <= 1}
                        onClick={() => irA(semana - 1)}
                        aria-label={t('Semana anterior')}
                    >
                        <ChevronLeft size={18} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className={styles.flecha}
                        disabled={enCurso}
                        onClick={() => irA(semana + 1)}
                        aria-label={t('Semana siguiente')}
                    >
                        <ChevronRight size={18} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                </span>
            </div>

            <motion.div
                key={semana}
                className={styles.cinta}
                role="group"
                aria-label={titulo}
                initial={vista.sentido ? { x: vista.sentido * 36, opacity: 0 } : false}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                drag="x"
                dragDirectionLock
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragEnd={(_e, info) => {
                    if (info.offset.x > 56) irA(semana - 1);
                    else if (info.offset.x < -56) irA(semana + 1);
                }}
            >
                {dias.map((d, i) => {
                    const activo = sel?.iso === d.iso;
                    const futuro = d.estado === 'futuro';
                    const salvado = d.estado === 'vacio' && escudosUsados.has(d.iso);
                    const lleno = Math.max(0, Math.min(1, d.ratio));
                    const clases = [styles.dia, styles[`dia_${tonoDelDia(d)}`]];
                    if (d.esHoy) clases.push(styles.diaHoy);
                    if (activo) clases.push(styles.diaActivo);
                    if (salvado) clases.push(styles.diaEscudo);
                    const sig = dias[i + 1];
                    let enlace = null;
                    if (sig) {
                        enlace = styles.enlace;
                        if (d.estado === 'meta' && sig.estado === 'meta') enlace += ` ${styles.enlaceMeta}`;
                        else if (sig.estado === 'futuro') enlace += ` ${styles.enlaceFuturo}`;
                    }
                    return (
                        <motion.button
                            key={d.iso}
                            type="button"
                            className={clases.join(' ')}
                            whileTap={futuro ? undefined : { scale: 0.97 }}
                            disabled={futuro}
                            aria-pressed={activo}
                            aria-label={`${fechaLarga(d)}: ${textoEstado(d)}${salvado ? ` · ${t('Escudo protegió tu racha')}` : ''}${puntosDelDia.get(d.iso) > 0 ? ` · ${t('{n} pts', { n: formatNumber(puntosDelDia.get(d.iso)) })}` : ''}`}
                            onClick={() => setElegido(activo ? null : d.iso)}
                            style={{ '--i': i }}
                        >
                            <span className={styles.letra}>
                                {d.esHoy && d.esCalendarioHoy ? t('Hoy') : formatDate(mediodiaDe(d.iso), { weekday: 'narrow' })}
                            </span>
                            <span className={styles.nodo}>
                                {enlace && <i className={enlace} aria-hidden="true" />}
                                <span className={styles.anillo}>
                                    <svg viewBox="0 0 44 44" aria-hidden="true">
                                        <circle className={styles.pista} cx="22" cy="22" r={RADIO} />
                                        {d.estado !== 'vacio' && !futuro && (
                                            <circle
                                                className={styles.arco}
                                                cx="22"
                                                cy="22"
                                                r={RADIO}
                                                style={{ '--largo': CIRCUNFERENCIA, '--resto': CIRCUNFERENCIA * (1 - lleno) }}
                                            />
                                        )}
                                    </svg>
                                    <span className={styles.centro}>
                                        {d.estado === 'meta' && <Check size={16} strokeWidth={3.25} aria-hidden="true" />}
                                        {futuro && <Lock size={12} strokeWidth={2.5} aria-hidden="true" />}
                                        {d.estado !== 'meta' && !futuro && Number(d.iso.slice(8))}
                                    </span>
                                    {d.estado === 'pasado' && (
                                        <span className={styles.exceso}><Plus size={9} strokeWidth={4} aria-hidden="true" /></span>
                                    )}
                                    {tonoDelDia(d) === 'fallado' && (
                                        <span className={styles.exceso}><Minus size={9} strokeWidth={4} aria-hidden="true" /></span>
                                    )}
                                </span>
                            </span>
                            {puntosDelDia.get(d.iso) > 0 && (
                                <span className={styles.ptsDia} aria-hidden="true">+{formatNumber(puntosDelDia.get(d.iso))}</span>
                            )}
                            {salvado && (
                                <span className={styles.escudoDia} aria-hidden="true"><Shield size={12} strokeWidth={2.5} /></span>
                            )}
                        </motion.button>
                    );
                })}
            </motion.div>

            {estrellas === ESTRELLAS_MAX && (
                <p className={`${styles.aviso} ${styles.avisoPerfecta}`}>
                    <Star size={13} strokeWidth={2.5} aria-hidden="true" />
                    {t('Semana perfecta')}
                </p>
            )}
            {enCurso && faltan > 0 && (
                <p className={styles.aviso}>
                    <Star size={13} strokeWidth={2.5} aria-hidden="true" />
                    {porPuntos
                        ? (estrellas === 0
                            ? t('Faltan {n} pts para tu primera estrella', { n: formatNumber(faltan) })
                            : estrellas === 1
                                ? t('Faltan {n} pts para tu 2.ª estrella', { n: formatNumber(faltan) })
                                : t('Faltan {n} pts para tu 3.ª estrella', { n: formatNumber(faltan) }))
                        : tn(faltan, 'Falta {n} día en meta para otra estrella', 'Faltan {n} días en meta para otra estrella', { n: faltan })}
                </p>
            )}

            <AnimatePresence initial={false}>
                {sel && (
                    <motion.div
                        key="detalle"
                        className={styles.detalle}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {detalleCompacto ? (
                        <div className={`${styles.detalleDentro} ${styles.detalleCompacto}`}>
                            <div className={styles.compactoTexto}>
                                <span className={styles.fecha}>{fechaLarga(sel)}</span>
                                <span className={`${styles.chip} ${styles[`chip_${tonoDelDia(sel)}`] || ''}`}>
                                    {sel.estado === 'meta' && <Check size={13} strokeWidth={3} aria-hidden="true" />}
                                    {textoEstado(sel)}
                                </span>
                                {sel.estado === 'vacio' && (
                                    <span className={styles.compactoNota}>
                                        {escudosUsados.has(sel.iso) ? t('Un escudo protegió tu racha este día.') : t('Ese día no anotaste comidas.')}
                                    </span>
                                )}
                            </div>
                            <div className={styles.compactoAcciones}>
                                {sel.estado !== 'vacio' && sel.estado !== 'futuro' && (
                                    <button type="button" className={styles.compactoIcono}
                                        onClick={() => compartirDia(sel.iso)} disabled={!!diaACompartir && !diaACompartir.dia}
                                        aria-label={sel.iso === hoyISO ? t('Compartir mi día') : t('Compartir este día')}
                                        title={sel.iso === hoyISO ? t('Compartir mi día') : t('Compartir este día')}>
                                        {diaACompartir && !diaACompartir.dia
                                            ? <Loader2 size={16} className="spin-animation" aria-hidden="true" />
                                            : <Share2 size={16} strokeWidth={2.5} aria-hidden="true" />}
                                    </button>
                                )}
                                {onAbrirDia && (
                                    <button type="button" className={styles.compactoVer} onClick={() => onAbrirDia(sel.iso)}>
                                        {t('Ver este día')}
                                        <ChevronRight size={15} strokeWidth={2.5} aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        </div>
                        ) : (
                        <div className={styles.detalleDentro}>
                            <div className={styles.detalleCima}>
                                <span className={styles.fecha}>{fechaLarga(sel)}</span>
                                <span className={`${styles.chip} ${styles[`chip_${tonoDelDia(sel)}`] || ''}`}>
                                    {sel.estado === 'meta' && <Check size={13} strokeWidth={3} aria-hidden="true" />}
                                    {textoEstado(sel)}
                                </span>
                            </div>
                            {sel.estado === 'vacio' ? (
                                escudosUsados.has(sel.iso) ? (
                                    <p className={styles.vacioEscudo}>
                                        <Shield size={14} strokeWidth={2.5} aria-hidden="true" />
                                        {t('Un escudo protegió tu racha este día.')}
                                    </p>
                                ) : (
                                    <p className={styles.vacio}>{t('Ese día no anotaste comidas.')}</p>
                                )
                            ) : (
                                <>
                                    <p className={styles.kcal}>
                                        <strong>{formatNumber(sel.calories)}</strong>
                                        {sel.target > 0 && <span> / {formatNumber(sel.target)}</span>}
                                        <span> kcal</span>
                                        <span className={styles.comidas}>
                                            {tn(sel.mealsCount, '{n} comida', '{n} comidas', { n: sel.mealsCount })}
                                        </span>
                                    </p>
                                    <div className={`${styles.barra} ${styles[`barra_${tonoDelDia(sel)}`] || ''}`}>
                                        <span style={{ width: `${Math.min(100, Math.round(sel.ratio * 100))}%` }} />
                                    </div>
                                    <ul className={styles.macros}>
                                        {macros.map((m) => (
                                            <li key={m.clave} className={styles[`macro_${tonoDelMacro(m)}`] || ''}>
                                                <span className={styles.macroNombre}>{m.nombre}</span>
                                                <span className={styles.macroValor}>
                                                    {formatNumber(m.valor)}{m.meta > 0 ? ` / ${formatNumber(m.meta)}` : ''} g
                                                </span>
                                                <span className={styles.macroBarra}>
                                                    <i style={{ width: `${m.meta > 0 ? Math.min(100, Math.round((m.valor / m.meta) * 100)) : 0}%` }} />
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                            {/* [P1-PLAN-LOTE-1099] el dueño: «¿cómo puedo compartir el día anterior?» — desde aquí, sin abrir el Diario */}
                            {sel.estado !== 'vacio' && sel.estado !== 'futuro' && (
                                <button type="button" className={`${styles.verDia} ${styles.compartirDia}`}
                                    onClick={() => compartirDia(sel.iso)} disabled={!!diaACompartir && !diaACompartir.dia}>
                                    {diaACompartir && !diaACompartir.dia
                                        ? <Loader2 size={16} className="spin-animation" aria-hidden="true" />
                                        : <Share2 size={16} strokeWidth={2.5} aria-hidden="true" />}
                                    {sel.iso === hoyISO ? t('Compartir mi día') : t('Compartir este día')}
                                </button>
                            )}
                            {onAbrirDia && (
                                <button type="button" className={styles.verDia} onClick={() => onAbrirDia(sel.iso)}>
                                    {t('Ver este día')}
                                    <ChevronRight size={16} strokeWidth={2.5} aria-hidden="true" />
                                </button>
                            )}
                        </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
};

SemanaEnProgreso.propTypes = {
    userId: PropTypes.string,
    hoy: PropTypes.shape({
        calories: PropTypes.number, protein: PropTypes.number, carbs: PropTypes.number, fats: PropTypes.number,
        micros: PropTypes.object, mealsCount: PropTypes.number,
    }),
    targetCalories: PropTypes.number,
    targetMacros: PropTypes.object,
    targetMicros: PropTypes.object,
    mainGoal: PropTypes.string,
    onAbrirDia: PropTypes.func,
    onDiaSeleccionado: PropTypes.func,
    detalleCompacto: PropTypes.bool,
    limpiarSeleccion: PropTypes.number,
    calendario: PropTypes.node,
};

export default SemanaEnProgreso;
