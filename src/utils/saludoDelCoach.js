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

const _hash = (s) => {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
};
const _elegir = (lista, semilla, clave) => lista[_hash(`${semilla}|${clave}`) % lista.length];
const _n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** La franja del día: qué comida toca a esta hora. */
export function franjaDeLaHora(hora) {
    if (hora < 5) return 'madrugada';
    if (hora < 11) return 'desayuno';
    if (hora < 12) return 'merienda';
    if (hora < 15) return 'almuerzo';
    if (hora < 19) return 'merienda';
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

function _observacion({ franja, hora, resumen, semilla, t }) {
    if (franja === 'madrugada') {
        // el día acaba de empezar: los números de «hoy» están en cero; lo útil es qué comer si hay hambre de verdad
        return _elegir([
            t('Si el cuerpo te pide algo, que sea ligero: un yogur, una fruta o un vaso de leche no te descuadran.'),
            t('Si de verdad hay hambre, algo pequeño con proteína, como un yogur o un huevo hervido, es mejor que picar sin rumbo.'),
            t('Si te entra hambre, una fruta o un yogur te calman sin pesarte para dormir.'),
        ], semilla, 'madrugada');
    }
    const totales = resumen?.totales;
    const metas = resumen?.metas;
    const comidas = Array.isArray(resumen?.comidas) ? resumen.comidas : null;
    if (!totales || !metas || !metas.calories) {
        return comidas && comidas.length === 0 ? _nadaAnotado({ hora, semilla, t }) : '';
    }
    const kcal = Math.round(_n(totales.calories));
    const meta = Math.round(_n(metas.calories));
    const grasa = Math.round(_n(totales.fats));
    const metaGrasa = Math.round(_n(metas.fats));
    const faltaProteina = Math.round(_n(metas.protein) - _n(totales.protein));

    if (kcal > meta * 1.05) {
        const n = kcal - meta;
        return _elegir([
            t('Hoy ya pasaste tu meta por {n} kcal. Sin drama: un día no define nada; si comes algo más, que sea ligero.', { n: formatNumber(n) }),
            t('Llevas {n} kcal por encima de tu meta de hoy. Mañana se equilibra; por hoy, algo ligero si te da hambre.', { n: formatNumber(n) }),
        ], semilla, 'exceso');
    }
    if (metaGrasa && grasa > metaGrasa + 5) {
        return _elegir([
            t('La grasa ya va en {g} de {meta} g, así que para lo que queda del día conviene algo a la plancha, al horno o hervido.', { g: grasa, meta: metaGrasa }),
            t('Hoy vas alto de grasa ({g} de {meta} g): para lo que falta, mejor preparaciones sin fritura.', { g: grasa, meta: metaGrasa }),
        ], semilla, 'grasa');
    }
    if (hora >= 14 && metas.protein && faltaProteina >= 20) {
        return faltaProteina >= 40
            ? _elegir([
                t('Te faltan {n} g de proteína: una pechuga de pollo o un filete de pescado te acercan bastante.', { n: faltaProteina }),
                t('Vas corto de proteína: faltan {n} g. Pollo, pescado o atún son lo más rápido para cerrarla.', { n: faltaProteina }),
            ], semilla, 'proteina')
            : _elegir([
                t('Te faltan {n} g de proteína: un par de huevos o un yogur griego lo resuelven.', { n: faltaProteina }),
                t('Para cerrar la proteína te faltan {n} g; un par de huevos o un yogur griego te acercan.', { n: faltaProteina }),
            ], semilla, 'proteina');
    }
    if (comidas && comidas.length === 0) return _nadaAnotado({ hora, semilla, t });
    if (hora >= 19 && Math.abs(kcal - meta) <= meta * 0.1) {
        return _elegir([
            t('Vas redondo: {kcal} de {meta} kcal. ¡Buen trabajo!', { kcal: formatNumber(kcal), meta: formatNumber(meta) }),
            t('Hoy lo tienes en su sitio: {kcal} de {meta} kcal.', { kcal: formatNumber(kcal), meta: formatNumber(meta) }),
        ], semilla, 'redondo');
    }
    const quedan = Math.max(0, meta - kcal);
    return _elegir([
        t('Llevas {kcal} de {meta} kcal; te quedan {quedan} para el resto del día.', { kcal: formatNumber(kcal), meta: formatNumber(meta), quedan: formatNumber(quedan) }),
        t('Vas por {kcal} de {meta} kcal y {p} g de proteína.', { kcal: formatNumber(kcal), meta: formatNumber(meta), p: Math.round(_n(totales.protein)) }),
    ], semilla, 'progreso');
}

function _nadaAnotado({ hora, semilla, t }) {
    return hora < 11
        ? _elegir([t('Día nuevo: todavía no hay nada anotado.'), t('Hoy todavía está en blanco.')], semilla, 'blanco')
        : _elegir([t('Hoy todavía no has anotado nada.'), t('Todavía no hay nada registrado hoy.')], semilla, 'blanco');
}

const _PLAN = {
    desayuno: (t, plato) => [t('De desayuno te toca **{plato}**.', { plato }), t('Tu desayuno de hoy es **{plato}**.', { plato })],
    almuerzo: (t, plato) => [t('Para el almuerzo te toca **{plato}**.', { plato }), t('Hoy de almuerzo tienes **{plato}**.', { plato })],
    merienda: (t, plato) => [t('Tu merienda de hoy es **{plato}**.', { plato }), t('Para merendar te toca **{plato}**.', { plato })],
    cena: (t, plato) => [t('De cena te toca **{plato}**.', { plato }), t('Tu cena de hoy es **{plato}**.', { plato })],
};

const _INVITA = {
    desayuno: (t) => [t('¿Qué vas a desayunar? Si quieres, te ayudo a decidir.'), t('Cuando desayunes, mándame una foto y lo anoto yo. ¿Te ayudo con alguna idea?')],
    almuerzo: (t) => [t('¿Qué vas a almorzar? Si quieres, te ayudo a decidir.'), t('Cuando almuerces, mándame una foto y lo anoto yo. ¿Te ayudo con alguna idea?')],
    merienda: (t) => [t('¿Te provoca algo para merendar? Te doy ideas.'), t('¿Una merienda? Dime qué se te antoja y lo ajustamos a tu día.')],
    cena: (t) => [t('¿Qué vas a cenar? Si quieres, te ayudo a decidir.'), t('Cuando cenes, mándame una foto y lo anoto yo. ¿Te ayudo con alguna idea?')],
};

/**
 * @param {object} p
 * @param {number} p.hora
 * @param {string} [p.nombre]        el primer nombre
 * @param {boolean} [p.modoContador]
 * @param {string} [p.plato]         el plato del plan para esta franja (en modo plan)
 * @param {boolean} [p.nevera]       la Nevera está activa
 * @param {object} [p.resumen]       { totales, metas (en números), comidas: [meal_type] }
 * @param {string} [p.semilla]       usuario|día|media hora
 * @param {Function} p.t
 */
export function saludoDelCoach({ hora, nombre = '', modoContador = false, plato = '', nevera = true, resumen = null, semilla = '', t }) {
    const franja = franjaDeLaHora(hora);
    const comidas = Array.isArray(resumen?.comidas) ? resumen.comidas : null;
    const deNuevo = !!(comidas && comidas.length > 0 && hora >= 11);
    const nombreLimpio = String(nombre || '').trim();
    const partes = [_saludo({ franja, hora, nombre: nombreLimpio, deNuevo, semilla, t })];

    const yaComioEsta = !!(comidas && comidas.includes(franja));
    const conPlato = !modoContador && plato && franja !== 'madrugada' && !yaComioEsta;
    if (conPlato) {
        partes.push(_elegir(_PLAN[franja](t, plato), semilla, 'plan'));
        partes.push(_elegir([t('¿Lo preparas o prefieres cambiarlo?'), t('¿Te paso la receta paso a paso?'), t('¿Lo tienes listo o armamos otra opción?')], semilla, 'invita-plan'));
    } else {
        const obs = _observacion({ franja, hora, resumen, semilla, t });
        if (obs) partes.push(obs);
        if (franja === 'madrugada') {
            partes.push(_elegir([t('¿En qué te ayudo?'), t('¿Te ayudo con algo o ya toca dormir?')], semilla, 'invita'));
        } else if (yaComioEsta) {
            partes.push(_elegir([t('¿En qué más te ayudo?'), t('¿Quieres que revise cómo va tu día?')], semilla, 'invita'));
        } else {
            const opciones = _INVITA[franja](t);
            if (nevera && franja !== 'merienda') opciones.push(t('¿Qué tienes en la nevera? Con eso te armo una idea.'));
            partes.push(_elegir(opciones, semilla, 'invita'));
        }
    }
    return partes.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
