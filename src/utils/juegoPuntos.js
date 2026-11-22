// [P1-PLAN-LOTE-1161 · 2026-11-22] Juego 2.0 — espejo PURO de `backend/juego_puntos.py`.
//
// El servidor es la fuente de la verdad (racha, escudos, puntos de días pasados, rango). La app solo necesita calcular
// en vivo los puntos de HOY (cada comida los cambia antes de que llegue el resumen) y pintar la escalera. Paridad con
// `backend/tests/fixtures/juego_puntos_casos.json` (lote1161.juego_puntos.test.js).
import { estadoDelDia } from './progresoDeLosDias';

// [P1-PLAN-LOTE-1164] puntos por CALIDAD: registrar solo mantiene la racha (0); calorías en la banda 20, cerca (±20 %) 8,
// pasado de largo 3, muy por debajo 0; día perfecto (banda + proteína + día completo + agua si la cuentas) +10.
export const PUNTOS = { registro: 0, completo: 5, banda: 20, proteina: 10, agua: 5 };
export const PUNTOS_PROTEINA_PARCIAL = 5;
export const PUNTOS_CALORIAS_CERCA = 8;
export const PUNTOS_CALORIAS_PASADO = 3;
export const PUNTOS_DIA_PERFECTO = 10;
export const CALORIAS_CERCA_FRACCION = 0.2;
export const COMIDAS_DIA_COMPLETO = 3;
export const COMIDAS_AYUNO_COMPLETO = 2;
export const CALORIAS_AYUNO_FRACCION = 0.7;
export const PROTEINA_PARCIAL_FRACCION = 0.7;
export const PROTEINA_FRACCION = 0.9;
/** [desde días, multiplicador, clave], de mayor a menor. */
export const TRAMOS_RACHA = [[30, 1.6, 'leyenda'], [14, 1.45, 'imparable'], [7, 1.3, 'en_llamas'], [3, 1.15, 'encendida'], [0, 1.0, null]];
export const ESCUDO_CADA = 7;
export const ESCUDOS_MAX = 2;
export const ESTRELLAS_SEMANA = [60, 130, 220];
export const RANGOS_PUNTOS = [['bronce', 0], ['plata', 700], ['oro', 2200], ['platino', 4700], ['diamante', 8500]];
/** [1164] entrada de IV, III, II y I de cada rango: cada división cuesta más que la anterior. */
export const UMBRALES_DIVISIONES = [
    ['bronce', [0, 100, 250, 450]], ['plata', [700, 1000, 1350, 1750]], ['oro', [2200, 2750, 3350, 4000]],
    ['platino', [4700, 5500, 6400, 7400]], ['diamante', [8500, 9800, 11200, 12700]],
];
// [P1-PLAN-LOTE-1163] 4 divisiones que se VEN de IV (la entrada) a I (la cima del rango), como en los videojuegos;
// `division` sigue ascendiendo por dentro (1 = la entrada). Semana perfecta +30. Encima de Diamante, MAESTRO.
export const DIVISIONES = 4;
export const HITOS_RACHA_LARGOS = [3, 7, 14, 30, 50, 75, 100, 150, 200, 365];
export const ROMANOS = ['I', 'II', 'III', 'IV'];
export const BONO_SEMANA_PERFECTA = 30;
export const MAESTRO = 'maestro';
export const MAESTRO_PUNTOS = 14500;
export const MAESTRO_SEMANAS_PERFECTAS = 8;
export const MAESTRO_RACHA = 100;

/** La división que ve el jugador: 1 → «IV» … 4 → «I». */
export function divisionRomana(division) {
    const d = Math.trunc(Number(division));
    return d >= 1 && d <= DIVISIONES ? ROMANOS[DIVISIONES - d] : null;
}
const siguienteDe = (sig) => (sig ? { clave: sig.clave, division: sig.division, romano: divisionRomana(sig.division) } : null);

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
/** Mitades hacia arriba, igual que `juego_puntos.redondear`. */
export const redondear = (x) => Math.floor(num(x) + 0.5);

export function logrosDelDia({ calories, protein, mealsCount, metaKcal, metaProteina, objetivo, vasos = null, metaVasos = null }) {
    const kcal = num(calories);
    const comidas = Math.trunc(num(mealsCount));
    const mk = num(metaKcal);
    const registro = comidas > 0 || kcal > 0;
    const mp = num(metaProteina);
    const mv = num(metaVasos);
    const completo = registro && (
        comidas >= COMIDAS_DIA_COMPLETO
        || (comidas >= COMIDAS_AYUNO_COMPLETO && mk > 0 && kcal >= mk * CALORIAS_AYUNO_FRACCION)
    );
    const proteina = registro && mp > 0 && num(protein) >= mp * PROTEINA_FRACCION;
    const proteinaParcial = registro && !proteina && mp > 0 && num(protein) >= mp * PROTEINA_PARCIAL_FRACCION;
    const banda = registro && mk > 0
        && estadoDelDia({ calories: kcal, mealsCount: comidas, target: mk, mainGoal: objetivo || '' }) === 'meta';
    const ratio = mk > 0 ? kcal / mk : 0;
    const cerca = registro && mk > 0 && !banda && Math.abs(ratio - 1) <= CALORIAS_CERCA_FRACCION;
    const pasado = registro && mk > 0 && !banda && !cerca && ratio > 1;
    const agua = mv > 0 ? registro && num(vasos) >= mv : null;
    return {
        registro,
        completo,
        banda,
        calorias_cerca: cerca,
        calorias_pasado: pasado,
        proteina,
        proteina_parcial: proteinaParcial,
        agua,
        dia_perfecto: Boolean(banda && proteina && completo && agua !== false),
    };
}

export function puntosBase(logros) {
    if (!logros?.registro) return 0;
    let total = Object.keys(PUNTOS).reduce((s, k) => s + (logros[k] === true ? PUNTOS[k] : 0), 0);
    if (logros.proteina !== true && logros.proteina_parcial === true) total += PUNTOS_PROTEINA_PARCIAL;
    if (logros.banda !== true) {
        if (logros.calorias_cerca === true) total += PUNTOS_CALORIAS_CERCA;
        else if (logros.calorias_pasado === true) total += PUNTOS_CALORIAS_PASADO;
    }
    if (logros.dia_perfecto === true) total += PUNTOS_DIA_PERFECTO;
    return total;
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
    return { mult: 1, clave: null, siguienteEn: 3, siguienteMult: 1.15 };
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

/** Todos los peldaños `{clave, division, desde}` en orden (5 rangos × 4 divisiones). */
export function escaleraDePuntos() {
    return UMBRALES_DIVISIONES.flatMap(([clave, umbrales]) => umbrales.map((desde, dv) => ({ clave, division: dv + 1, desde })));
}

export function rangoPorPuntos(total) {
    const t = Math.max(0, Math.trunc(num(total)));
    const pel = escaleraDePuntos();
    let i = 0;
    pel.forEach((p, k) => { if (t >= p.desde) i = k; });
    const actual = pel[i];
    const sig = pel[i + 1] || null;
    return {
        clave: actual.clave, division: actual.division, romano: divisionRomana(actual.division), desde: actual.desde,
        hasta: sig ? sig.desde : null,
        siguiente: siguienteDe(sig),
        puntos_para_la_siguiente: sig ? sig.desde - t : null,
        avance: sig ? Math.min(1, (t - actual.desde) / (sig.desde - actual.desde)) : 1,
        indice: i,
    };
}

/** Nombre de cada tramo de la racha (con la `t` del componente). */
export const nombreDelTramo = (clave, t) => ({
    encendida: t('Encendida'), en_llamas: t('En llamas'), imparable: t('Imparable'), leyenda: t('Leyenda'),
})[clave] || '';

/** Nombre del rango con su división: «Plata II» (división INTERNA ascendente; se ve IV → I). */
export function nombreDelRango(clave, division, t) {
    const base = ({
        bronce: t('Bronce'), plata: t('Plata'), oro: t('Oro'), platino: t('Platino'), diamante: t('Diamante'), maestro: t('Maestro'),
    })[clave] || '';
    const romano = clave === MAESTRO ? null : divisionRomana(division);
    return romano ? `${base} ${romano}` : base;
}

export const indiceMaestro = () => RANGOS_PUNTOS.length * DIVISIONES;

export function nivelIndice(clave, division) {
    if (clave === MAESTRO) return indiceMaestro();
    const pel = escaleraDePuntos();
    const idx = pel.findIndex((p) => p.clave === clave && p.division === division);
    return idx >= 0 ? idx : 0;
}

export function rangoConPiso(total, pisoIndice = 0) {
    const t = Math.max(0, Math.trunc(num(total)));
    const r = rangoPorPuntos(t);
    const piso = Math.trunc(num(pisoIndice));
    if (r.indice >= piso) return r;
    const pel = escaleraDePuntos();
    const i = Math.min(Math.max(0, piso), pel.length - 1);
    const actual = pel[i];
    const sig = pel[i + 1] || null;
    return {
        clave: actual.clave, division: actual.division, romano: divisionRomana(actual.division), desde: actual.desde,
        hasta: sig ? sig.desde : null,
        siguiente: siguienteDe(sig),
        puntos_para_la_siguiente: sig ? Math.max(0, sig.desde - t) : null,
        avance: sig ? 0 : 1,
        indice: i,
    };
}

/** Los tres requisitos de Maestro con lo que lleva el jugador (igual que `juego_puntos.maestro_progreso`). */
export function maestroProgreso(total, semanasPerfectas, mejorRacha) {
    const requisitos = [
        { clave: 'puntos', actual: Math.max(0, Math.trunc(num(total))), meta: MAESTRO_PUNTOS },
        { clave: 'semanas_perfectas', actual: Math.max(0, Math.trunc(num(semanasPerfectas))), meta: MAESTRO_SEMANAS_PERFECTAS },
        { clave: 'racha', actual: Math.max(0, Math.trunc(num(mejorRacha))), meta: MAESTRO_RACHA },
    ].map((r) => ({ ...r, ok: r.actual >= r.meta }));
    const cumplidos = requisitos.filter((r) => r.ok).length;
    return { conseguido: cumplidos === requisitos.length, cumplidos, requisitos };
}

/** El rango completo (igual que `juego_puntos.rango_del_jugador`): divisiones con piso y, en la cima, Maestro. */
export function rangoDelJugador(total, semanasPerfectas = 0, mejorRacha = 0, pisoIndice = 0) {
    const t = Math.max(0, Math.trunc(num(total)));
    const piso = Math.trunc(num(pisoIndice));
    if (piso >= indiceMaestro() || maestroProgreso(t, semanasPerfectas, mejorRacha).conseguido) {
        return {
            clave: MAESTRO, division: null, romano: null, desde: MAESTRO_PUNTOS, hasta: null, siguiente: null,
            puntos_para_la_siguiente: null, avance: 1, indice: indiceMaestro(),
        };
    }
    const r = rangoConPiso(t, piso);
    if (r.siguiente) return r;
    return {
        ...r,
        hasta: MAESTRO_PUNTOS,
        siguiente: { clave: MAESTRO, division: null, romano: null },
        puntos_para_la_siguiente: Math.max(0, MAESTRO_PUNTOS - t),
        avance: Math.min(1, Math.max(0, t - r.desde) / (MAESTRO_PUNTOS - r.desde)),
    };
}

export function proximoHitoRacha(racha) {
    const r = Math.max(0, Math.trunc(num(racha)));
    return HITOS_RACHA_LARGOS.find((h) => h > r) ?? null;
}

export function diasParaEscudo(racha, escudos) {
    if (num(escudos) >= ESCUDOS_MAX) return null;
    return ESCUDO_CADA - (Math.max(0, Math.trunc(num(racha))) % ESCUDO_CADA);
}

/** Los logros de hoy si además consiguiera `clave`. */
function conLogro(logros, clave) {
    const l = { ...logros, registro: true, [clave]: true, dia_perfecto: false };
    if (clave === 'banda') { l.calorias_cerca = false; l.calorias_pasado = false; }
    if (clave === 'proteina') l.proteina_parcial = false;
    return l;
}

/** Ganancia neta de puntos al conseguir un logro (con el multiplicador activo de la racha). [1164] Cada logro
 * enseña su propia ganancia (sin duplicar el bono de día perfecto, que ya tiene su propia ficha). */
export function gananciaLogro({ logros = {}, clave, mult = 1 }) {
    if (!clave || logros?.[clave] === true) return 0;
    const m = num(mult) || 1;
    const base = puntosBase(logros);
    if (clave === 'dia_perfecto') return Math.max(0, redondear((base + PUNTOS_DIA_PERFECTO) * m) - redondear(base * m));
    return Math.max(0, redondear(puntosBase(conLogro(logros, clave)) * m) - redondear(base * m));
}

/** Lo que ya dan las calorías hoy sin estar en la banda (cerca 8 · pasado 3), con el multiplicador. */
export function puntosCaloriasParciales({ logros = {}, mult = 1 }) {
    if (logros?.banda === true) return 0;
    const p = logros?.calorias_cerca === true ? PUNTOS_CALORIAS_CERCA : logros?.calorias_pasado === true ? PUNTOS_CALORIAS_PASADO : 0;
    return redondear(p * (num(mult) || 1));
}

export const maximoDiario = ({ mult = 1, conAgua = false }) => redondear((conAgua ? 50 : 45) * (num(mult) || 1));
