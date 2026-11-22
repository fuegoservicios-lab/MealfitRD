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
// [P1-PLAN-LOTE-1161] `servidor` (juego por puntos): {estrellas: Map(numero→★), puntos: Map(numero→pts), racha}. Las
// estrellas de cada semana y la racha (días registrando) son las del servidor; los MUNDOS se abren por PUNTOS acumulados
// (`umbrales` = los de `RANGOS_PUNTOS`). Sin `servidor`, la regla vieja (días en meta).
export function armarMapa({ inicioISO, hoyISO, estadoDe, umbrales = [0], servidor = null }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(hoyISO || ''))) return { semanas: [], racha: 0, estrellas: 0, nivelHoy: 1, mundo: 0 };
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
        const numero = numeroDeSemana(semana1, domingo);
        const est = servidor?.estrellas?.has(numero) ? Number(servidor.estrellas.get(numero)) || 0 : estrellasDeLaSemana(enMeta);
        estrellas += est;
        semanas.push({
            numero,
            domingo,
            puntos: servidor?.puntos?.get(numero) ?? null,
            enCurso,
            enMeta,
            estrellas: est,
            faltan: faltanParaLaSiguienteEstrella(enMeta),
            dias,
        });
    }

    // [P1-PLAN-LOTE-1132] Los MUNDOS (los rangos de la escalera: Bronce, Plata…): cada semana vive en el mundo que
    // tenías al empezarla (estrellas juntadas ANTES); la que te hace cruzar un umbral abre el siguiente (`abreMundo`).
    const mundoDe = (n) => {
        let i = 0;
        (umbrales || [0]).forEach((desde, k) => { if (n >= desde) i = k; });
        return i;
    };
    let acumuladas = 0;
    for (let k = semanas.length - 1; k >= 0; k -= 1) {
        const s = semanas[k];
        s.mundo = mundoDe(acumuladas);
        acumuladas += servidor ? (Number(s.puntos) || 0) : s.estrellas;
        const tras = mundoDe(acumuladas);
        s.abreMundo = tras > s.mundo ? tras : null;
    }

    // Racha: días seguidos en meta que acaban hoy (si hoy aún no llegó, cuenta hasta ayer: el día no ha terminado).
    let racha = 0;
    for (let iso = hoyISO; iso >= inicio; iso = sumarDias(iso, -1)) {
        const e = estadoDeDia(iso);
        if (e === 'meta') racha += 1;
        else if (iso === hoyISO) continue;
        else break;
    }
    if (servidor) {
        return { semanas, racha: Number(servidor.racha) || 0, estrellas, puntos: acumuladas, nivelHoy: diasEntre(inicio, hoyISO) + 1, mundo: mundoDe(acumuladas) };
    }
    return { semanas, racha, estrellas, nivelHoy: diasEntre(inicio, hoyISO) + 1, mundo: mundoDe(estrellas) };
}

/**
 * Las filas del dibujo, de arriba abajo: por semana, primero su trofeo (cierra la semana: está «arriba» de sus días)
 * y luego sus días. Cada fila lleva su `y` (px) y su `x` (0-100, % del ancho): los días serpentean en una curva
 * continua de semana en semana; los trofeos van al centro.
 * [P1-PLAN-LOTE-1132] Más denso (se ven 5-6 días y la curva entera en un teléfono) y con los MUNDOS: una «puerta» encima
 * de la semana que abrió un mundo nuevo, el «Inicio» al pie del camino y `zonas` (el tramo de cada mundo, para pintar
 * su paisaje detrás).
 */
export const ALTO_DIA = 80;
// [P1-PLAN-LOTE-1146 · 2026-11-21] Hoy lleva su cartel «Estás aquí» ENCIMA: con el alto de un día normal el cartel se
// montaba sobre la tarjeta de la semana (el dueño: «mira cómo eso choca») o sobre el nivel bloqueado de arriba. Su
// tramo es más alto (simétrico: las zonas de los mundos siguen pegadas fila con fila).
export const ALTO_HOY = 148;
export const ALTO_TROFEO = 92;   // [1146] la tarjeta lleva ahora la barra de 7 días con los hitos de estrella
export const ALTO_PUERTA = 70;
export const MARGEN_SUP = 84;   // aire para el marcador flotante y el cartel «Estás aquí»
export const MARGEN_INF = 40;
const CURVA = [50, 68, 78, 68, 50, 32, 22, 32];

export function filasDelMapa(semanas) {
    const filas = [];
    let y = MARGEN_SUP;
    let k = 0;
    const lista = semanas || [];
    lista.forEach((s) => {
        const mundo = s.mundo || 0;
        if (s.abreMundo != null) {
            filas.push({ tipo: 'puerta', mundo: s.abreMundo, x: 50, y: y + ALTO_PUERTA / 2, alto: ALTO_PUERTA, clave: `p-${s.domingo}` });
            y += ALTO_PUERTA;
        }
        filas.push({ tipo: 'trofeo', semana: s, mundo, x: 50, y: y + ALTO_TROFEO / 2, alto: ALTO_TROFEO, clave: `t-${s.domingo}` });
        y += ALTO_TROFEO;
        s.dias.forEach((d) => {
            const altoFila = d.esHoy ? ALTO_HOY : ALTO_DIA;
            filas.push({ tipo: 'dia', dia: d, semana: s, mundo, x: CURVA[k % CURVA.length], y: y + altoFila / 2, alto: altoFila, clave: d.iso });
            k += 1;
            y += altoFila;
        });
    });
    if (lista.length > 0) {
        filas.push({ tipo: 'inicio', mundo: lista.at(-1).mundo || 0, x: 50, y: y + ALTO_PUERTA / 2, alto: ALTO_PUERTA, clave: 'inicio' });
        y += ALTO_PUERTA;
    }
    const alto = y + MARGEN_INF;
    // El paisaje de cada mundo: filas seguidas del mismo mundo; el de arriba llega al borde de arriba y el de abajo al pie.
    const zonas = [];
    filas.forEach((f) => {
        const y0 = f.y - f.alto / 2;
        const y1 = f.y + f.alto / 2;
        const ultima = zonas.at(-1);
        if (ultima && ultima.mundo === f.mundo) ultima.y1 = y1;
        else zonas.push({ mundo: f.mundo, y0, y1 });
    });
    if (zonas.length > 0) { zonas[0].y0 = 0; zonas.at(-1).y1 = alto; }
    return { filas, alto, zonas };
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

/**
 * [P1-PLAN-LOTE-1132] La celebración que toca al abrir el mapa (o null). Solo lo RECIENTE, y cada cosa una vez
 * (`yaVistas`: las claves ya celebradas en este teléfono):
 *  · un mundo que se abrió esta semana o la anterior → `{ tipo: 'mundo', mundo, clave }`;
 *  · si no, hoy en meta, o ayer cerrado en meta → `{ tipo: 'dia', iso, esHoy, estrella, clave }` (`estrella`: ese
 *    día le dio a su semana una estrella nueva: 3.º, 5.º o 7.º día en meta).
 * Un usuario que abre el mapa por primera vez con meses de historia NO recibe una lluvia de celebraciones viejas.
 */
export function celebracionPendiente(mapa, yaVistas) {
    const vistas = yaVistas instanceof Set ? yaVistas : new Set(yaVistas || []);
    const semanas = mapa?.semanas || [];
    for (const s of semanas.slice(0, 2)) {
        if (s.abreMundo != null) {
            const clave = `mundo:${s.abreMundo}`;
            if (!vistas.has(clave)) return { tipo: 'mundo', mundo: s.abreMundo, clave };
        }
    }
    const dias = semanas.slice(0, 2).flatMap((s) => s.dias.map((d) => ({ d, s })));
    const iHoy = dias.findIndex(({ d }) => d.esHoy);
    if (iHoy < 0) return null;
    for (const { d, s } of [dias[iHoy], dias[iHoy + 1]].filter(Boolean)) {
        if (d.estado !== 'meta') continue;
        const clave = `dia:${d.iso}`;
        if (vistas.has(clave)) continue;
        // ¿ese día fue el que dio la estrella? Cuenta los días en meta de su semana hasta él (incluido).
        const hasta = s.dias.filter((x) => x.iso <= d.iso && x.estado === 'meta').length;
        const estrella = estrellasDeLaSemana(hasta) > estrellasDeLaSemana(hasta - 1);
        return { tipo: 'dia', iso: d.iso, esHoy: d.esHoy, estrella, clave };
    }
    return null;
}

/**
 * [P1-PLAN-LOTE-1155 · 2026-11-21] El paisaje a los lados del camino (el dueño: «mejoremos el mapa en general, el
 * diseño»): la ventana era un cielo liso con el camino solo. Cada dos días, un adorno (planeta con anillo, luna,
 * destello o cometa) en el lado CONTRARIO al nivel, donde la curva deja hueco; nunca junto a tarjetas ni puertas.
 * Determinista por posición (es un dibujo: no cambia al repintar ni al desplazarse).
 * Devuelve `[{ clave, tipo, x, y, tam, mundo }]` (x en %, y en px, tam en px).
 */
export const TIPOS_DE_ADORNO = ['planeta', 'luna', 'destello', 'cometa', 'destello'];
export function adornosDelMapa(filas) {
    const adornos = [];
    let k = 0;
    (filas || []).forEach((f) => {
        if (f.tipo !== 'dia') return;
        k += 1;
        if (f.dia?.esHoy || k % 2) return;
        const n = Math.floor(k / 2);
        const tipo = TIPOS_DE_ADORNO[n % TIPOS_DE_ADORNO.length];
        const lado = f.x >= 50 ? 1 : -1;               // el nivel a la derecha (o al centro) → adorno a la izquierda
        const x = 50 - lado * (31 + (n % 3) * 4);       // 19-27 % o 73-81 %
        const tam = tipo === 'destello' ? 14 + (n % 2) * 6 : tipo === 'cometa' ? 44 : 26 + (n % 3) * 6;
        adornos.push({ clave: `a-${f.clave}`, tipo, x, y: f.y - 14 + (n % 3) * 10, tam, mundo: f.mundo || 0 });
    });
    return adornos;
}
