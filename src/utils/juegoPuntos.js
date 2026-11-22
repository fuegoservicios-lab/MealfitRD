// [P1-PLAN-LOTE-1161 · 2026-11-22] Juego 2.0 — espejo PURO de `backend/juego_puntos.py`.
//
// El servidor es la fuente de la verdad (racha, escudos, puntos de días pasados, rango). La app solo necesita calcular
// en vivo los puntos de HOY (cada comida los cambia antes de que llegue el resumen) y pintar la escalera. Paridad con
// `backend/tests/fixtures/juego_puntos_casos.json` (lote1161.juego_puntos.test.js).
import { estadoDelDia } from './progresoDeLosDias';

export const PUNTOS = { registro: 10, completo: 5, banda: 15, proteina: 10, agua: 5 };
export const COMIDAS_DIA_COMPLETO = 3;
export const PROTEINA_FRACCION = 0.9;
/** [desde días, multiplicador, clave], de mayor a menor. */
export const TRAMOS_RACHA = [[30, 2.0, 'leyenda'], [14, 1.75, 'imparable'], [7, 1.5, 'en_llamas'], [3, 1.2, 'encendida'], [0, 1.0, null]];
export const ESCUDO_CADA = 7;
export const ESCUDOS_MAX = 2;
export const ESTRELLAS_SEMANA = [80, 160, 260];
export const RANGOS_PUNTOS = [['bronce', 0], ['plata', 600], ['oro', 1800], ['platino', 4500], ['diamante', 9000]];
export const DIVISIONES = 3;
export const DIAMANTE_PASO = 3000;
export const ROMANO = { 1: 'I', 2: 'II', 3: 'III' };

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
/** Mitades hacia arriba, igual que `juego_puntos.redondear`. */
export const redondear = (x) => Math.floor(num(x) + 0.5);

export function logrosDelDia({ calories, protein, mealsCount, metaKcal, metaProteina, objetivo, vasos = null, metaVasos = null }) {
    const kcal = num(calories);
    const comidas = Math.trunc(num(mealsCount));
    const registro = comidas > 0 || kcal > 0;
    const mp = num(metaProteina);
    const mv = num(metaVasos);
    return {
        registro,
        completo: registro && comidas >= COMIDAS_DIA_COMPLETO,
        banda: registro && num(metaKcal) > 0
            && estadoDelDia({ calories: kcal, mealsCount: comidas, target: num(metaKcal), mainGoal: objetivo || '' }) === 'meta',
        proteina: registro && mp > 0 && num(protein) >= mp * PROTEINA_FRACCION,
        agua: mv > 0 ? registro && num(vasos) >= mv : null,
    };
}

export function puntosBase(logros) {
    if (!logros?.registro) return 0;
    return Object.keys(PUNTOS).reduce((s, k) => s + (logros[k] === true ? PUNTOS[k] : 0), 0);
}

export function tramoDeRacha(racha) {
    const r = Math.max(0, Math.trunc(num(racha)));
    for (let i = 0; i < TRAMOS_RACHA.length; i += 1) {
        const [desde, mult, clave] = TRAMOS_RACHA[i];
        if (r >= desde) {
            const sig = i > 0 ? TRAMOS_RACHA[i - 1] : null;
            return { mult, clave, siguienteEn: sig ? sig[0] : null, siguienteMult: sig ? sig[1] : null };
        }
    }
    return { mult: 1, clave: null, siguienteEn: 3, siguienteMult: 1.2 };
}

/** Puntos de HOY en vivo: la racha que traería hoy = la del servidor hasta ayer + 1. */
export function puntosDeHoy({ logros, rachaHastaAyer = 0 }) {
    const base = puntosBase(logros);
    const mult = tramoDeRacha(num(rachaHastaAyer) + 1).mult;
    return { puntos: redondear(base * mult), base, mult, rachaConHoy: num(rachaHastaAyer) + (logros?.registro ? 1 : 0) };
}

/** Recorrido completo (para la paridad y la app sin red). Mismo algoritmo que `juego_puntos.recorrer`. */
export function recorrer(dias, hoyIso) {
    let racha = 0; let mejor = 0; let escudos = 0; let total = 0;
    const usados = []; const ganados = []; const porDia = {};
    for (const d of dias || []) {
        const iso = String(d.iso);
        let pts = 0; let mult = 1;
        if (d.registrado) {
            racha += 1;
            mult = tramoDeRacha(racha).mult;
            pts = redondear(num(d.base) * mult);
            if (racha % ESCUDO_CADA === 0 && escudos < ESCUDOS_MAX) { escudos += 1; ganados.push(iso); }
        } else if (iso === hoyIso) {
            // en curso: ni rompe ni gasta
        } else if (racha > 0 && escudos > 0) {
            escudos -= 1; usados.push(iso);
        } else {
            racha = 0;
        }
        mejor = Math.max(mejor, racha);
        total += pts;
        porDia[iso] = { puntos: pts, mult, racha };
    }
    return { porDia, racha, mejor_racha: mejor, escudos, escudos_usados: usados, escudos_ganados: ganados, total };
}

export const estrellasPorPuntos = (pts) => ESTRELLAS_SEMANA.filter((u) => num(pts) >= u).length;
export function faltanParaOtraEstrella(pts) {
    for (const u of ESTRELLAS_SEMANA) if (num(pts) < u) return u - num(pts);
    return 0;
}

/** Todos los peldaños `{clave, division, desde}` en orden (5 rangos × 3 divisiones). */
export function escaleraDePuntos() {
    const out = [];
    RANGOS_PUNTOS.forEach(([clave, desde], i) => {
        const sig = RANGOS_PUNTOS[i + 1];
        for (let dv = 0; dv < DIVISIONES; dv += 1) {
            const d = sig ? desde + redondear(((sig[1] - desde) * dv) / DIVISIONES) : desde + DIAMANTE_PASO * dv;
            out.push({ clave, division: dv + 1, desde: d });
        }
    });
    return out;
}

export function rangoPorPuntos(total) {
    const t = Math.max(0, Math.trunc(num(total)));
    const pel = escaleraDePuntos();
    let i = 0;
    pel.forEach((p, k) => { if (t >= p.desde) i = k; });
    const actual = pel[i];
    const sig = pel[i + 1] || null;
    return {
        clave: actual.clave, division: actual.division, desde: actual.desde, hasta: sig ? sig.desde : null,
        siguiente: sig ? { clave: sig.clave, division: sig.division } : null,
        puntos_para_la_siguiente: sig ? sig.desde - t : null,
        avance: sig ? Math.min(1, (t - actual.desde) / (sig.desde - actual.desde)) : 1,
        indice: i,
    };
}

/** Nombre de cada tramo de la racha (con la `t` del componente). */
export const nombreDelTramo = (clave, t) => ({
    encendida: t('Encendida'), en_llamas: t('En llamas'), imparable: t('Imparable'), leyenda: t('Leyenda'),
})[clave] || '';

/** Nombre del rango con su división: «Plata II». */
export function nombreDelRango(clave, division, t) {
    const base = ({ bronce: t('Bronce'), plata: t('Plata'), oro: t('Oro'), platino: t('Platino'), diamante: t('Diamante') })[clave] || '';
    return division && ROMANO[division] ? `${base} ${ROMANO[division]}` : base;
}
