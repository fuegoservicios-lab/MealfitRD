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
export function construirDias({ hoyISO, filas, hoy = null, targetCalories = 0, targetMacros = null, mainGoal = '', n = DIAS_EN_TIRA }) {
    const porFecha = new Map();
    (Array.isArray(filas) ? filas : []).forEach((r) => { if (r && r.date) porFecha.set(String(r.date), r); });
    return ultimosDias(hoyISO, n).map((iso) => {
        const esHoy = iso === hoyISO;
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
