// [P1-PLAN-LOTE-412 · 2026-09-27] El saludo del coach: habla de TU día, no solo de la hora. Pura: la hora, el nombre, el
// modo, el plato que toca y lo que llevas hoy entran; el texto sale.
//
// Antes era una plantilla (saludo de la hora + una de tres frases fijas por franja + «Seguimos enfocados en tu meta
// de…») que no miraba nada del día y a veces sermoneaba («A esta hora lo ideal es descansar, así que no te recomendaré
// comidas pesadas»). El dueño: «¿puedes hacerlos más versátiles, que se sientan más humanos e inteligentes?».
//
// Tres piezas: un saludo (con el nombre y neutro en género), UNA observación con los números del día (la más útil,
// por prioridad) o el plato del plan si esa comida aún no está registrada, y una invitación concreta de la franja.
// Las variantes se eligen con una semilla (usuario, día, media hora): el mismo día y los mismos datos dan el mismo texto,
// así que el saludo no «salta» al llegar los números si no cambiaron.
import { formatNumber } from '../i18n';
import { getBiologicalDateStr } from './diaBiologico';
import { elegirOpcionesSeguras } from './filtroAlimentosSaludo';

const _hash = (s) => {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
};
const _elegir = (lista, semilla, clave) => lista[_hash(`${semilla}|${clave}`) % lista.length];
const _n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** La franja del día: qué comida toca a esta hora (corte biológico: 04:00 AM). */
export function franjaDeLaHora(hora) {
    if (hora < 4) return 'madrugada';
    if (hora < 11) return 'desayuno';
    if (hora < 12) return 'merienda';
    if (hora < 15) return 'almuerzo';
    if (hora < 19) return 'merienda';
    return 'cena';
}

/** Clave única del momento actual (separa merienda de la mañana vs. tarde). */
export function momentoDelDia(hora) {
    if (hora < 4) return 'madrugada';
    if (hora < 11) return 'desayuno';
    if (hora < 12) return 'merienda-am';
    if (hora < 15) return 'almuerzo';
    if (hora < 19) return 'merienda-pm';
    return 'cena';
}

function _saludo({ franja, hora, nombre, deNuevo, semilla, t }) {
    const conNombre = !!nombre;
    const v = (conN, sinN) => (conNombre ? conN : sinN);
    let lista;
    if (franja === 'madrugada') {
        lista = v(
            [t('¿Noche larga, {nombre}?', { nombre }), t('¿Sin sueño, {nombre}?', { nombre }), t('Hola, {nombre}. ¿Todavía por aquí?', { nombre })],
            [t('¿Noche larga?'), t('¿Sin sueño?'), t('Hola. ¿Todavía por aquí?')],
        );
    } else if (hora < 12) {
        lista = v(
            [t('¡Buenos días, {nombre}!', { nombre }), t('¡Buen día, {nombre}!', { nombre }), t('Hola, {nombre}, ¿qué tal amaneces?', { nombre })],
            [t('¡Buenos días!'), t('¡Buen día!'), t('Hola, ¿qué tal amaneces?')],
        );
    } else if (hora < 19) {
        lista = v(
            [t('¡Buenas tardes, {nombre}!', { nombre }), t('Hola, {nombre}.', { nombre }), t('¡Buenas, {nombre}!', { nombre })],
            [t('¡Buenas tardes!'), t('¡Hola!'), t('¡Buenas!')],
        );
    } else {
        lista = v(
            [t('¡Buenas noches, {nombre}!', { nombre }), t('Hola, {nombre}.', { nombre }), t('¡Buenas, {nombre}!', { nombre })],
            [t('¡Buenas noches!'), t('¡Hola!'), t('¡Buenas!')],
        );
    }
    if (deNuevo) lista = [...lista, v(t('¡Hola de nuevo, {nombre}!', { nombre }), t('¡Hola de nuevo!'))];
    return _elegir(lista, semilla, 'saludo');
}

function _observacion({ franja, hora, resumen, perfil, semilla, t }) {
    if (franja === 'madrugada') {
        // el día acaba de empezar: los números de «hoy» están en cero; sugerimos algo ligero 100 % compatible
        const opt = elegirOpcionesSeguras({ perfil, tipo: 'madrugada', semilla, t });
        const texto = opt
            ? _elegir([
                t('Si de verdad tienes hambre, algo ligero como {opt} te calma sin pesarte para dormir.', { opt }),
                t('Si el cuerpo pide algo a esta hora, mejor ligero ({opt}) que picar sin rumbo.', { opt }),
            ], semilla, 'madrugada')
            : t('Si de verdad tienes hambre a esta hora, ve por algo ligero que te siente bien sin pesarte para dormir.');
        return { texto, yaInvita: false };
    }
    const totales = resumen?.totales;
    const metas = resumen?.metas;
    const comidas = Array.isArray(resumen?.comidas) ? resumen.comidas : null;
    const nombresComidas = Array.isArray(resumen?.nombresComidas) ? resumen.nombresComidas : [];

    // Día en blanco ANTES de calcular brechas: nunca decir «faltan 98 g de proteína» si aún no anotó nada hoy.
    if (comidas && comidas.length === 0) {
        return { texto: _nadaAnotado({ franja, hora, semilla, t }), yaInvita: true };
    }
    if (!totales || !metas || !metas.calories) {
        return { texto: '', yaInvita: false };
    }
    const kcal = Math.round(_n(totales.calories));
    const meta = Math.round(_n(metas.calories));
    const quedan = Math.max(0, meta - kcal);
    const grasa = Math.round(_n(totales.fats));
    const metaGrasa = Math.round(_n(metas.fats));
    const faltaProteina = Math.round(_n(metas.protein) - _n(totales.protein));

    if (kcal > meta * 1.05) {
        const n = kcal - meta;
        return {
            texto: _elegir([
                t('Hoy pasaste tu meta por {n} kcal — sin drama, un día no define nada. Si te da hambre más tarde, que sea algo ligero.', { n: formatNumber(n) }),
                t('Llevas {n} kcal por encima de tu meta hoy. Mañana se nivela; por ahora, algo ligero si el cuerpo pide más.', { n: formatNumber(n) }),
            ], semilla, 'exceso'),
            yaInvita: false,
        };
    }
    if (hora >= 14 && metas.protein && quedan <= 280 && faltaProteina >= 20) {
        const opt = elegirOpcionesSeguras({ perfil, tipo: 'ligera', yaComidoHoy: nombresComidas, semilla, t });
        const texto = opt
            ? t('Te quedan {quedan} kcal y {n} g de proteína; para no pasarte, conviene algo magro como {opt}.', {
                quedan: formatNumber(quedan), n: faltaProteina, opt,
            })
            : t('Te quedan {quedan} kcal y {n} g de proteína; para no pasarte, conviene ir directo a una proteína magra ligera.', {
                quedan: formatNumber(quedan), n: faltaProteina,
            });
        return { texto, yaInvita: false };
    }
    if (metaGrasa && grasa > metaGrasa + 5) {
        return {
            texto: _elegir([
                t('La grasa ya va en {g} de {meta} g; en lo que queda del día, mejor a la plancha, al horno o hervido.', { g: grasa, meta: metaGrasa }),
                t('Hoy vas alto de grasa ({g} de {meta} g): para lo que falta, mejor preparaciones sin fritura.', { g: grasa, meta: metaGrasa }),
            ], semilla, 'grasa'),
            yaInvita: false,
        };
    }
    if (hora >= 14 && metas.protein && faltaProteina >= 20) {
        if (faltaProteina >= 65) {
            const opt = elegirOpcionesSeguras({ perfil, tipo: 'fuerte', yaComidoHoy: nombresComidas, semilla, t });
            const texto = opt
                ? t('Aún te faltan {n} g de proteína hoy. Si te quedó alguna comida sin anotar, pásamela y cuadramos; si no, prioriza una buena base de {opt} en tu próxima comida.', { n: faltaProteina, opt })
                : t('Aún te faltan {n} g de proteína hoy. Si te quedó alguna comida sin anotar, pásamela y cuadramos; si no, dale protagonismo a la proteína en tu próxima comida.', { n: faltaProteina });
            return { texto, yaInvita: false };
        }
        if (faltaProteina >= 40) {
            const opt = elegirOpcionesSeguras({ perfil, tipo: 'fuerte', yaComidoHoy: nombresComidas, semilla, t });
            const texto = opt
                ? _elegir([
                    t('Te faltan {n} g de proteína hoy; algo como {opt} te deja muy cerca de la meta.', { n: faltaProteina, opt }),
                    t('Quedan {n} g de proteína por cubrir; una buena porción de {opt} te acerca bastante.', { n: faltaProteina, opt }),
                ], semilla, 'proteina')
                : t('Te faltan {n} g de proteína hoy; conviene que sea la base de tu próxima comida.', { n: faltaProteina });
            return { texto, yaInvita: false };
        }
        const opt = elegirOpcionesSeguras({ perfil, tipo: 'ligera', yaComidoHoy: nombresComidas, semilla, t });
        const texto = opt
            ? _elegir([
                t('Solo te faltan {n} g de proteína; con {opt} la cierras fácil.', { n: faltaProteina, opt }),
                t('Para completar la proteína te faltan {n} g; {opt} lo resuelven rápido.', { n: faltaProteina, opt }),
            ], semilla, 'proteina')
            : t('Solo te faltan {n} g de proteína para completar tu meta de hoy.', { n: faltaProteina });
        return { texto, yaInvita: false };
    }
    if (hora >= 19 && Math.abs(kcal - meta) <= meta * 0.1) {
        return {
            texto: _elegir([
                t('Vas clavado hoy: {kcal} de {meta} kcal. ¡Buen cierre!', { kcal: formatNumber(kcal), meta: formatNumber(meta) }),
                t('Hoy lo tienes en su sitio: {kcal} de {meta} kcal.', { kcal: formatNumber(kcal), meta: formatNumber(meta) }),
            ], semilla, 'redondo'),
            yaInvita: false,
        };
    }
    return {
        texto: _elegir([
            t('Llevas {kcal} de {meta} kcal; te quedan {quedan} para el resto del día.', { kcal: formatNumber(kcal), meta: formatNumber(meta), quedan: formatNumber(quedan) }),
            t('Vas por {kcal} de {meta} kcal y {p} g de proteína.', { kcal: formatNumber(kcal), meta: formatNumber(meta), p: Math.round(_n(totales.protein)) }),
        ], semilla, 'progreso'),
        yaInvita: false,
    };
}

function _nadaAnotado({ franja, hora, semilla, t }) {
    if (hora < 11) {
        return _elegir([
            t('Todavía sin registros hoy. ¿Con qué arrancas el desayuno?'),
            t('Hoy arrancamos de cero. ¿Ya sabes qué desayunar o armamos una idea rápida?'),
        ], semilla, 'blanco');
    }
    if (franja === 'almuerzo') {
        return _elegir([
            t('Todavía no tienes nada anotado hoy. Si ya comiste algo, pásamelo y cuadramos; si no, ¿qué te provoca almorzar?'),
            t('Aún sin registros hoy. ¿Ya almorzaste o armamos una idea para el almuerzo?'),
        ], semilla, 'blanco');
    }
    if (franja === 'cena') {
        return _elegir([
            t('Tu diario de hoy sigue en blanco. Si ya comiste antes, dime qué fue y cuadramos; si no, ¿qué te provoca cenar?'),
            t('Todavía no tienes comidas anotadas hoy. ¿Ya cenaste o pensamos qué preparar?'),
        ], semilla, 'blanco');
    }
    return _elegir([
        t('Todavía no tienes nada anotado hoy. Si ya comiste, cuéntame y actualizo tus números; ¿o te provoca merendar algo?'),
        t('Aún sin registros hoy. ¿Comiste algo antes o buscamos una idea para merendar?'),
    ], semilla, 'blanco');
}

const _PLAN = {
    desayuno: (t, plato) => [t('De desayuno te toca **{plato}**.', { plato }), t('Tu desayuno de hoy es **{plato}**.', { plato })],
    almuerzo: (t, plato) => [t('Para el almuerzo te toca **{plato}**.', { plato }), t('Hoy de almuerzo tienes **{plato}**.', { plato })],
    merienda: (t, plato) => [t('Tu merienda de hoy es **{plato}**.', { plato }), t('Para merendar te toca **{plato}**.', { plato })],
    cena: (t, plato) => [t('De cena te toca **{plato}**.', { plato }), t('Tu cena de hoy es **{plato}**.', { plato })],
};

const _INVITA = {
    desayuno: (t) => [
        t('¿Qué tienes en mente para desayunar?'),
        t('¿Ya desayunaste o vas por eso? Si prefieres, mándame foto y lo anoto.'),
    ],
    almuerzo: (t) => [
        t('¿Qué vas a almorzar hoy? Si quieres, armamos una idea.'),
        t('¿Ya almorzaste o estás decidiendo? Si quieres, mándame foto y lo registro.'),
    ],
    merienda: (t) => [
        t('¿Te provoca algo para merendar?'),
        t('¿Te provoca merendar algo? Dime qué tienes a mano y lo cuadramos.'),
    ],
    cena: (t) => [
        t('¿Qué tienes en mente para cenar?'),
        t('¿Ya cenaste o estás pensando qué preparar? Mándame foto cuando comas y cierro tu día.'),
    ],
};

const _PREFIJO_NEVERA = {
    desayuno: (t) => t('Hora de desayunar.'),
    almuerzo: (t) => t('Hora de almorzar.'),
    cena: (t) => t('Hora de cenar.'),
};

/**
 * @param {object} p
 * @param {number} p.hora
 * @param {string} [p.nombre]        el primer nombre
 * @param {boolean} [p.modoContador]
 * @param {string} [p.plato]         el plato del plan para esta franja (en modo plan)
 * @param {boolean} [p.nevera]       la Nevera está activa
 * @param {object} [p.resumen]       { totales, metas (en números), comidas: [meal_type], nombresComidas: [string] }
 * @param {object} [p.perfil]        perfil alimentario extraído con `extraerPerfilAlimentario`
 * @param {string} [p.semilla]       usuario|día|media hora
 * @param {Function} p.t
 */
export function saludoDelCoach({ hora, nombre = '', modoContador = false, plato = '', nevera = true, resumen = null, perfil = null, semilla = '', t }) {
    const franja = franjaDeLaHora(hora);
    const comidas = Array.isArray(resumen?.comidas) ? resumen.comidas : null;
    const deNuevo = !!(comidas && comidas.length > 0 && hora >= 11);
    const nombreLimpio = String(nombre || '').trim();
    const partes = [_saludo({ franja, hora, nombre: nombreLimpio, deNuevo, semilla, t })];

    const yaComioEsta = !!(comidas && comidas.some((c) => {
        const k = String(c || '').toLowerCase();
        return franja === 'merienda' ? (k.includes('merienda') || k.includes('snack')) : k.includes(franja);
    }));
    const conPlato = !modoContador && plato && franja !== 'madrugada' && !yaComioEsta;
    if (conPlato) {
        partes.push(_elegir(_PLAN[franja](t, plato), semilla, 'plan'));
        partes.push(_elegir([t('¿Lo preparas o prefieres cambiarlo?'), t('¿Te paso la receta paso a paso?'), t('¿Lo tienes listo o armamos otra opción?')], semilla, 'invita-plan'));
    } else {
        const obs = _observacion({ franja, hora, resumen, perfil, semilla, t });
        if (obs.texto) partes.push(obs.texto);
        if (obs.yaInvita) {
            // La observación ya cierra con una pregunta natural adaptada al día en blanco
        } else if (franja === 'madrugada') {
            partes.push(_elegir([t('¿En qué te ayudo?'), t('¿Te ayudo con algo o ya vas cerrando el día?')], semilla, 'invita'));
        } else if (yaComioEsta) {
            partes.push(_elegir([t('¿En qué más te ayudo?'), t('¿Quieres que revise cómo va tu día?')], semilla, 'invita'));
        } else {
            const opciones = _INVITA[franja](t);
            if (nevera && franja !== 'merienda') {
                const pref = _PREFIJO_NEVERA[franja]?.(t);
                const ask = t('¿Qué tienes en la nevera? Con eso te armo una idea.');
                opciones.push(pref ? `${pref} ${ask}` : ask);
            }
            partes.push(_elegir(opciones, semilla, 'invita'));
        }
    }
    return partes.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function _normalizarTextoAviso(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

const _PATRONES_COMIDA_AVISO = [
    ['desayuno', /\b(?:desayun\w*|breakfast|cafe\s+da\s+manha|petit[- ]dejeuner|colazione)\b/],
    ['almuerzo', /\b(?:almuerz\w*|almorz\w*|lunch|almoc(?:o|ar)|pranzo|pranz\w*)\b/],
    ['merienda', /\b(?:meriend\w*|merend\w*|snack\w*|afternoon\s+snack|lanche|gouter)\b/],
    ['cena', /\b(?:cen(?:a|as|e|o|ando|ar|aste|aron)|dinner|jantar|janta|diner)\b/],
];
const _DEJEUNER_RE = /\bdejeuner\b/g;

function _inferirComidaDeAviso(texto) {
    const norm = _normalizarTextoAviso(texto);
    if (!norm) return null;
    let mejorSlot = null;
    let mejorPos = Infinity;
    for (const [slot, patron] of _PATRONES_COMIDA_AVISO) {
        const m = patron.exec(norm);
        if (m && m.index < mejorPos) {
            mejorSlot = slot;
            mejorPos = m.index;
        }
    }
    _DEJEUNER_RE.lastIndex = 0;
    let dejMatch;
    while ((dejMatch = _DEJEUNER_RE.exec(norm)) !== null) {
        const prefix = norm.slice(Math.max(0, dejMatch.index - 6), dejMatch.index);
        if (!/petit[- ]$/.test(prefix)) {
            if (dejMatch.index < mejorPos) {
                mejorSlot = 'almuerzo';
                mejorPos = dejMatch.index;
            }
            break;
        }
    }
    return mejorSlot;
}

function _normalizarSlotConsumido(raw) {
    const norm = _normalizarTextoAviso(raw).trim();
    if (!norm) return null;
    if (['desayuno', 'breakfast', 'cafe da manha', 'petit-dejeuner', 'petit dejeuner', 'colazione'].includes(norm)) return 'desayuno';
    if (['almuerzo', 'lunch', 'comida', 'almoco', 'dejeuner', 'pranzo'].includes(norm)) return 'almuerzo';
    if (norm.includes('merienda') || norm.includes('snack') || norm.includes('lanche') || norm.includes('gouter')) return 'merienda';
    if (['cena', 'dinner', 'jantar', 'janta', 'diner'].includes(norm)) return 'cena';
    return null;
}

function _normalizarComidasHoy(comidasHoy) {
    const slots = new Set();
    const fechasMerienda = [];
    for (const item of Array.isArray(comidasHoy) ? comidasHoy : []) {
        const rawType = typeof item === 'object' && item !== null ? (item.meal_type ?? item.type) : item;
        const slot = _normalizarSlotConsumido(rawType);
        if (!slot) continue;
        slots.add(slot);
        if (slot === 'merienda' && typeof item === 'object' && item !== null) {
            const rawDt = item.consumed_at ?? item.created_at ?? null;
            const dt = rawDt instanceof Date ? rawDt : (rawDt ? new Date(rawDt) : null);
            fechasMerienda.push(dt && !Number.isNaN(dt.getTime()) ? dt : null);
        }
    }
    return { slots, fechasMerienda };
}

function _esBurbujaBloqueadaParaAuto(m) {
    return !m || m.role !== 'model' || m.isImage || m._isErrorBubble || m._stoppedByUser || m.isIncomplete || m.isStreaming;
}

function _clasificarColaAutomatica(msgs) {
    if (!Array.isArray(msgs) || msgs.length === 0) {
        return { untouched: false, empty: true, hasRealPrefix: false, prefix: [], unanswered: [] };
    }
    if (msgs.some((m) => m?.isStreaming || m?.isIncomplete || m?._stoppedByUser || m?._isErrorBubble || m?.isImage)) {
        return { untouched: true, empty: false, hasRealPrefix: false, prefix: msgs, unanswered: [] };
    }
    let lastUserIdx = -1;
    for (let i = 0; i < msgs.length; i += 1) {
        if (msgs[i]?.role === 'user') lastUserIdx = i;
    }
    if (lastUserIdx === -1) {
        if (msgs.some(_esBurbujaBloqueadaParaAuto)) {
            return { untouched: true, empty: false, hasRealPrefix: false, prefix: msgs, unanswered: [] };
        }
        return { untouched: false, empty: false, hasRealPrefix: false, prefix: [], unanswered: msgs };
    }
    const prefix = msgs.slice(0, Math.min(msgs.length, lastUserIdx + 2));
    const tail = msgs.slice(Math.min(msgs.length, lastUserIdx + 2));
    if (tail.some(_esBurbujaBloqueadaParaAuto)) {
        return { untouched: true, empty: false, hasRealPrefix: true, prefix: msgs, unanswered: [] };
    }
    return { untouched: false, empty: false, hasRealPrefix: true, prefix, unanswered: tail };
}

function _avisoSigueVigente(msg, ahora = new Date(), comidasHoy = []) {
    if (!msg || msg.isWelcome) return false;
    const ref = ahora instanceof Date ? ahora : new Date(ahora);
    if (Number.isNaN(ref.getTime())) return true;
    const rawDate = msg.created_at ?? msg.welcomeAt ?? null;
    let fechaMsg = null;
    let msgHour = null;
    if (rawDate) {
        fechaMsg = rawDate instanceof Date ? rawDate : new Date(rawDate);
        if (!Number.isNaN(fechaMsg.getTime())) {
            if (getBiologicalDateStr(fechaMsg) !== getBiologicalDateStr(ref)) return false;
            msgHour = fechaMsg.getHours() + fechaMsg.getMinutes() / 60;
        } else {
            fechaMsg = null;
        }
    }
    const slot = _inferirComidaDeAviso(msg.content);
    if (!slot) {
        if (!fechaMsg) return true;
        return momentoDelDia(fechaMsg.getHours()) === momentoDelDia(ref.getHours());
    }
    const nowHour = ref.getHours() + ref.getMinutes() / 60;
    const { slots, fechasMerienda } = _normalizarComidasHoy(comidasHoy);

    if (slot === 'desayuno') {
        if (slots.has('desayuno') || slots.has('almuerzo') || slots.has('cena')) return false;
        return nowHour >= 4 && nowHour < 12;
    }
    if (slot === 'almuerzo') {
        if (slots.has('almuerzo') || slots.has('cena')) return false;
        return nowHour >= 4 && nowHour < 19;
    }
    if (slot === 'merienda') {
        if (slots.has('cena')) return false;
        if (msgHour !== null && msgHour < 12) {
            if (slots.has('almuerzo') || nowHour >= 12 || nowHour < 4) return false;
            if (!slots.has('merienda')) return true;
            if (fechasMerienda.length === 0) return false;
            return !fechasMerienda.some((dt) => !dt || dt.getHours() < 12 || (fechaMsg && dt >= fechaMsg));
        }
        if (nowHour >= 19 || nowHour < 4) return false;
        if (!slots.has('merienda')) return true;
        if (fechasMerienda.length === 0) return false;
        return !fechasMerienda.some((dt) => !dt || (fechaMsg ? dt >= fechaMsg : dt.getHours() >= 12));
    }
    if (slot === 'cena') {
        return !slots.has('cena');
    }
    return true;
}

/**
 * Verdadero si el hilo tiene aviso(s) automático(s) sin respuesta que están apilados,
 * ya fueron cumplidos al registrar esa comida o ya pasó su ventana útil.
 */
export function soloAvisoProactivoVencido(msgs, ahora = new Date(), comidasHoy = []) {
    const info = _clasificarColaAutomatica(msgs);
    if (info.empty || info.untouched || info.unanswered.length === 0) return false;
    if (!info.hasRealPrefix && info.unanswered.length === 1 && info.unanswered[0]?.isWelcome) return false;
    if (info.unanswered.length > 1) return true;
    return !_avisoSigueVigente(info.unanswered[0], ahora, comidasHoy);
}

/**
 * Fusiona y actualiza in-place los mensajes automáticos sin respuesta:
 * - Si hay varios avisos previos encadenados (p. ej. desayuno + almuerzo), descarta los
 *   anteriores y conserva solo el más reciente mientras su comida siga pendiente.
 * - Cuando esa comida ya se registró o venció su ventana/día, desaparecen todos los avisos
 *   caducados dejando el único saludo del momento (o solo la conversación real previa).
 */
export function actualizarMensajePredeterminado({
    prev,
    crearSaludo,
    ahora = new Date(),
    comidasHoy = [],
    esChatViejo = false,
    hayFotoPendiente = false,
}) {
    if (esChatViejo || hayFotoPendiente || typeof crearSaludo !== 'function') return prev;
    const ref = ahora instanceof Date ? ahora : new Date(ahora);
    const ts = Number.isFinite(ref.getTime()) ? ref.getTime() : Date.now();
    const hacerSaludo = () => [{
        role: 'model',
        content: crearSaludo(),
        isWelcome: true,
        welcomeAt: ts,
    }];

    if (!Array.isArray(prev) || prev.length === 0) {
        return hacerSaludo();
    }

    const info = _clasificarColaAutomatica(prev);
    if (info.untouched) return prev;

    if (info.hasRealPrefix) {
        if (info.unanswered.length === 0) return prev;
        const proactivos = info.unanswered.filter((m) => !m.isWelcome);
        const latest = proactivos[proactivos.length - 1] || null;
        if (latest && _avisoSigueVigente(latest, ref, comidasHoy)) {
            if (info.unanswered.length === 1 && info.unanswered[0] === latest) return prev;
            return [...info.prefix, latest];
        }
        return info.prefix;
    }

    const proactivos = info.unanswered.filter((m) => !m.isWelcome);
    if (proactivos.length > 0) {
        const latest = proactivos[proactivos.length - 1];
        if (_avisoSigueVigente(latest, ref, comidasHoy)) {
            if (prev.length === 1 && prev[0] === latest) return prev;
            return [latest];
        }
        return hacerSaludo();
    }

    const esUnicoSaludo = prev.length === 1 && Boolean(prev[0]?.isWelcome);
    const nuevo = crearSaludo();
    if (esUnicoSaludo && prev[0]?.content === nuevo) {
        return prev;
    }
    return [{
        role: 'model',
        content: nuevo,
        isWelcome: true,
        welcomeAt: ts,
    }];
}
