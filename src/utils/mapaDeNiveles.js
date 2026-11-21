// [P1-PLAN-LOTE-1131 · 2026-11-20] El «Registro por día» como MAPA DE NIVELES (estilo saga de videojuego), opción A
// elegida por el dueño: CADA DÍA ES UN NIVEL. Este módulo es la parte pura (sin React): qué niveles hay, en qué estado
// está cada uno y cómo se agrupan en semanas. El componente (`components/dashboard/MapaDeNiveles.jsx`) solo los pinta.
//
// Reglas (las mismas del calendario, para que las dos vistas cuenten la MISMA historia):
//  · el estado de un día lo decide `estadoDe(iso)` del cajón (`getCalorieGoalState` con la meta de ESE día):
//    'green' → «en meta», 'under' → «bajo la meta», 'over' → «sobre la meta», null → sin registro;
//  · las semanas van de domingo a sábado y se numeran desde el domingo de la Semana 1 (`domingoDe(día 1)`), como «S9»
//    en el calendario y «Semana 9» en Progreso; sus estrellas salen de `estrellasDeLaSemana` (3/5/7 días en meta);
//  · el camino empieza en el DÍA 1 del viaje (el del servidor manda) y acaba en el sábado de la semana en curso:
//    los días que faltan se ven BLOQUEADOS (el nivel siguiente, como en los juegos), nunca se pueden tocar.
import { DIAS_DE_LA_SEMANA, domingoDe, estrellasDeLaSemana, faltanParaLaSiguienteEstrella, mediodiaDe, numeroDeSemana } from './progresoDeLosDias';

const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sumarDias = (iso, n) => {
    const f = mediodiaDe(iso);
    f.setDate(f.getDate() + n);
    return aISO(f);
};
const diasEntre = (a, b) => Math.round((mediodiaDe(b) - mediodiaDe(a)) / 86400000);

const ESTADO = { green: 'meta', under: 'bajo', over: 'sobre' };
// Tope de seguridad: el endpoint da hasta 365 días; más allá el mapa empezaría a pesar en teléfonos modestos.
export const NIVELES_MAX = 371;

/**
 * Las semanas del camino, de la MÁS RECIENTE a la más antigua, cada una con sus días de sábado a domingo (arriba lo
 * nuevo: el camino se sube, como en los juegos). Cada día: `{ iso, estado, esHoy, nivel }` con
 * `estado ∈ meta|bajo|sobre|vacio|futuro` y `nivel` = su número en el camino (día 1 = 1).
 */
export function armarMapa({ inicioISO, hoyISO, estadoDe }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(hoyISO || ''))) return { semanas: [], racha: 0, estrellas: 0, nivelHoy: 1 };
    let inicio = /^\d{4}-\d{2}-\d{2}$/.test(String(inicioISO || '')) && inicioISO <= hoyISO ? inicioISO : hoyISO;
    if (diasEntre(inicio, hoyISO) > NIVELES_MAX - DIAS_DE_LA_SEMANA) inicio = sumarDias(hoyISO, -(NIVELES_MAX - DIAS_DE_LA_SEMANA));
    const semana1 = domingoDe(inicio);
    const estadoDeDia = (iso) => {
        if (iso > hoyISO) return 'futuro';
        const e = typeof estadoDe === 'function' ? estadoDe(iso) : null;
        return ESTADO[e] || 'vacio';
    };

    const semanas = [];
    let estrellas = 0;
    for (let domingo = domingoDe(hoyISO); domingo >= semana1; domingo = sumarDias(domingo, -DIAS_DE_LA_SEMANA)) {
        const dias = [];
        let enMeta = 0;
        for (let i = DIAS_DE_LA_SEMANA - 1; i >= 0; i -= 1) {
            const iso = sumarDias(domingo, i);
            if (iso < inicio) continue;
            const estado = estadoDeDia(iso);
            if (estado === 'meta') enMeta += 1;
            dias.push({ iso, estado, esHoy: iso === hoyISO, nivel: diasEntre(inicio, iso) + 1 });
        }
        const enCurso = hoyISO >= domingo && hoyISO <= sumarDias(domingo, DIAS_DE_LA_SEMANA - 1);
        const est = estrellasDeLaSemana(enMeta);
        estrellas += est;
        semanas.push({
            numero: numeroDeSemana(semana1, domingo),
            domingo,
            enCurso,
            enMeta,
            estrellas: est,
            faltan: faltanParaLaSiguienteEstrella(enMeta),
            dias,
        });
    }

    // Racha: días seguidos en meta que acaban hoy (si hoy aún no llegó, cuenta hasta ayer: el día no ha terminado).
    let racha = 0;
    for (let iso = hoyISO; iso >= inicio; iso = sumarDias(iso, -1)) {
        const e = estadoDeDia(iso);
        if (e === 'meta') racha += 1;
        else if (iso === hoyISO) continue;
        else break;
    }
    return { semanas, racha, estrellas, nivelHoy: diasEntre(inicio, hoyISO) + 1 };
}

/**
 * Las filas del dibujo, de arriba abajo: por semana, primero su trofeo (cierra la semana: está «arriba» de sus días)
 * y luego sus días. Cada fila lleva su `y` (px) y su `x` (0-100, % del ancho): los días serpentean en una curva
 * continua de semana en semana; los trofeos van al centro.
 */
export const ALTO_DIA = 96;
export const ALTO_TROFEO = 116;
export const MARGEN = 72;
const CURVA = [50, 70, 80, 70, 50, 30, 20, 30];

export function filasDelMapa(semanas) {
    const filas = [];
    let y = MARGEN;
    let k = 0;
    (semanas || []).forEach((s) => {
        filas.push({ tipo: 'trofeo', semana: s, x: 50, y: y + ALTO_TROFEO / 2, clave: `t-${s.domingo}` });
        y += ALTO_TROFEO;
        s.dias.forEach((d) => {
            filas.push({ tipo: 'dia', dia: d, semana: s, x: CURVA[k % CURVA.length], y: y + ALTO_DIA / 2, clave: d.iso });
            k += 1;
            y += ALTO_DIA;
        });
    });
    return { filas, alto: y + MARGEN };
}

/** El camino SVG (viewBox 0 0 ancho alto, en píxeles) entre puntos, con curvas suaves. */
export function trazo(puntos) {
    if (!puntos || puntos.length === 0) return '';
    let d = `M ${puntos[0].x} ${puntos[0].y}`;
    for (let i = 1; i < puntos.length; i += 1) {
        const a = puntos[i - 1];
        const b = puntos[i];
        const m = (b.y - a.y) / 2;
        d += ` C ${a.x} ${a.y + m}, ${b.x} ${b.y - m}, ${b.x} ${b.y}`;
    }
    return d;
}
