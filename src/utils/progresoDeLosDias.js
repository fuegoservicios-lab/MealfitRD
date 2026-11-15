// [SEMANA-EN-PROGRESO · 2026-11-15] El progreso de los días, visto «desde afuera».
//
// El dueño: «que el usuario pueda ver el progreso de los días desde afuera, qué día ha completado». Hasta hoy esa
// respuesta vivía dentro del cajón «Calendario y comidas»: había que abrirlo para saber si ayer se cumplió la meta.
// Estas funciones puras arman la tira de días que ahora se ve en la propia pestaña Progreso; el componente
// (`SemanaEnProgreso.jsx`) solo pinta.
//
// La regla de «día completado» NO se inventa aquí: es la misma banda de `calorieGoalStatus.js` que pinta la barra de
// calorías de hoy y el calendario (80–105 % perdiendo grasa, 90–115 % ganando músculo, 90–110 % el resto), con la meta
// que regía ESE día (`target_calories` del endpoint), no la de hoy.
import { getCalorieGoalState } from './calorieGoalStatus';

export const DIAS_EN_TIRA = 14;
export const DIAS_DE_LA_SEMANA = 7;

const aISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** `YYYY-MM-DD` → fecha LOCAL a mediodía (ningún cambio de hora la mueve de día). */
export const mediodiaDe = (iso) => {
    const [a, m, d] = String(iso).split('-').map(Number);
    return new Date(a, (m || 1) - 1, d || 1, 12, 0, 0, 0);
};

/** Los `n` días que terminan en `hoyISO`, del más viejo al más nuevo. */
export function ultimosDias(hoyISO, n = DIAS_EN_TIRA) {
    const out = [];
    const base = mediodiaDe(hoyISO);
    for (let i = n - 1; i >= 0; i -= 1) {
        const f = new Date(base);
        f.setDate(f.getDate() - i);
        out.push(aISO(f));
    }
    return out;
}

/** 'vacio' (sin registros) · 'bajo' · 'meta' (día completado) · 'pasado'. */
export function estadoDelDia({ calories, mealsCount, target, mainGoal }) {
    if (!(Number(mealsCount) > 0) && !(Number(calories) > 0)) return 'vacio';
    const s = getCalorieGoalState(calories, target, mainGoal);
    if (s === 'green') return 'meta';
    return s === 'over' ? 'pasado' : 'bajo';
}

/**
 * @param {string}   hoyISO          el día biológico de hoy
 * @param {object[]} filas           `days` de `/api/diary/consumed-range` (solo trae los días CON registros)
 * @param {object}   hoy             lo que la tarjeta ya sabe de hoy, en vivo: gana a la fila del endpoint
 * @param {number}   targetCalories  la meta de hoy (y la de un día sin meta propia guardada)
 */
export function construirDias({ hoyISO, filas, hoy = null, targetCalories = 0, targetMacros = null, mainGoal = '', n = DIAS_EN_TIRA, fechas = null }) {
    const porFecha = new Map();
    (Array.isArray(filas) ? filas : []).forEach((r) => { if (r && r.date) porFecha.set(String(r.date), r); });
    return (fechas || ultimosDias(hoyISO, n)).map((iso) => {
        const esHoy = iso === hoyISO;
        // [SEMANAS-NUMERADAS] un día de la semana en curso que aún no llega: ni vacío ni fallado
        if (iso > hoyISO) return { iso, esHoy: false, calories: 0, mealsCount: 0, protein: 0, carbs: 0, fats: 0, target: 0, targetMacros: null, ratio: 0, estado: 'futuro' };
        const r = porFecha.get(iso) || {};
        const vivo = esHoy && hoy ? hoy : null;
        const calories = Math.round(Number(vivo ? vivo.calories : r.calories) || 0);
        const mealsCount = Number(vivo ? vivo.mealsCount : r.meals_count) || 0;
        const target = esHoy
            ? (Number(targetCalories) || 0)
            : ((Number(r.target_calories) > 0 ? Number(r.target_calories) : Number(targetCalories)) || 0);
        const goal = (esHoy ? mainGoal : (r.main_goal || mainGoal)) || '';
        return {
            iso,
            esHoy,
            calories,
            mealsCount,
            protein: Math.round(Number(vivo ? vivo.protein : r.protein) || 0),
            carbs: Math.round(Number(vivo ? vivo.carbs : r.carbs) || 0),
            fats: Math.round(Number(vivo ? vivo.fats : r.healthy_fats) || 0),
            target,
            targetMacros: (esHoy ? targetMacros : (r.target_macros || targetMacros)) || null,
            ratio: target > 0 ? calories / target : 0,
            estado: estadoDelDia({ calories, mealsCount, target, mainGoal: goal }),
        };
    });
}

/**
 * Días SEGUIDOS en meta. Hoy todavía está en curso: si aún no llega a la meta no rompe la racha (se cuenta hasta
 * ayer); si ya llegó, suma.
 */
export function rachaEnMeta(dias) {
    const lista = Array.isArray(dias) ? dias : [];
    let i = lista.length - 1;
    if (i >= 0 && lista[i].esHoy && lista[i].estado !== 'meta') i -= 1;
    let racha = 0;
    for (; i >= 0 && lista[i].estado === 'meta'; i -= 1) racha += 1;
    return racha;
}

/** Cuántos de los últimos 7 días (hoy incluido) quedaron en meta. */
export function diasEnMetaDeLaSemana(dias) {
    return (Array.isArray(dias) ? dias : []).slice(-DIAS_DE_LA_SEMANA).filter((d) => d.estado === 'meta').length;
}

// ───────────────────────────────────────────────────────────── [SEMANAS-NUMERADAS · 2026-11-15]
// El dueño: «un sistema de semanas: semana 1, semana 2 y así hasta el infinito, estilo videojuego». La Semana 1 empieza
// el PRIMER día con registros del usuario; cada 7 días es una semana nueva. Cada semana se gana hasta 3 estrellas.

export const DIAS_MAX_HISTORIA = 365;   // el tope del endpoint
export const ESTRELLAS_MAX = 3;

const diasEntre = (aISO_, bISO) => Math.round((mediodiaDe(bISO) - mediodiaDe(aISO_)) / 86400000);

/** El día 1 del viaje: el más antiguo entre lo guardado y las filas; sin nada, hoy. Nunca posterior a hoy. */
export function inicioDelViaje(filas, hoyISO, guardado = null) {
    let min = hoyISO;
    const mirar = (iso) => { if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) && iso < min) min = iso; };
    mirar(guardado);
    (Array.isArray(filas) ? filas : []).forEach((r) => mirar(r && r.date));
    return min;
}

/** En qué semana (1…∞) cae `iso` contando desde `inicioISO`. */
export function numeroDeSemana(inicioISO, iso) {
    return Math.max(1, Math.floor(diasEntre(inicioISO, iso) / DIAS_DE_LA_SEMANA) + 1);
}

/** Los 7 días (ISO) de la semana `numero`. */
export function fechasDeLaSemana(inicioISO, numero) {
    const base = mediodiaDe(inicioISO);
    return Array.from({ length: DIAS_DE_LA_SEMANA }, (_, i) => {
        const f = new Date(base);
        f.setDate(f.getDate() + (numero - 1) * DIAS_DE_LA_SEMANA + i);
        return aISO(f);
    });
}

/** 0–3 estrellas: 3 días en meta = ★, 5 = ★★, los 7 = ★★★ (semana perfecta). */
export function estrellasDeLaSemana(enMeta) {
    if (enMeta >= DIAS_DE_LA_SEMANA) return 3;
    if (enMeta >= 5) return 2;
    return enMeta >= 3 ? 1 : 0;
}

/** Cuántos días en meta faltan para la siguiente estrella (0 = ya tiene las 3). */
export function faltanParaLaSiguienteEstrella(enMeta) {
    const escalon = [3, 5, DIAS_DE_LA_SEMANA].find((x) => enMeta < x);
    return escalon ? escalon - enMeta : 0;
}
