// [P1-PLAN-LOTE-411 · 2026-09-27] Los atajos del chat: dos ACCIONES que no gastan mensajes y la pregunta del momento
// con los números del día. Pura: la hora, el modo, los totales y las metas entran; los atajos salen.
//
// Antes eran tres frases fijas («¿Qué me falta hoy?», «Registrar lo que comí», «Proponme una comida»): iguales a
// mediodía y a la 1:47 de la madrugada, y «Registrar lo que comí» gastaba un mensaje del mes para que el coach
// preguntara «¿qué comiste?». El dueño: «¿estos textos son útiles? reemplázalos por mejores».

const MAX = 4;
const _n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const _g = (v) => _n(String(v ?? '').replace(/[^\d.]/g, ''));   // «198g» → 198

/** Las metas de macros en números, vengan del plan o de /api/nutrition/targets (`macros: { protein: '198g' }`). */
export function metasEnNumeros(m) {
    if (!m) return null;
    const mm = m.macros || {};
    const metas = {
        calories: _n(m.calories),
        protein: _n(m.protein) ?? _g(mm.protein),
        carbs: _n(m.carbs) ?? _g(mm.carbs),
        fats: _n(m.fats) ?? _g(mm.fats),
    };
    return metas.calories || metas.protein ? metas : null;
}

/**
 * @param {object} p
 * @param {number} p.hora            hora local (0-23)
 * @param {boolean} p.modoContador   sin generador de planes
 * @param {object} [p.metas]         { calories, protein, carbs, fats } en números
 * @param {object} [p.totales]       lo registrado hoy { calories, protein, carbs, fats }
 * @param {string[]} [p.comidas]     los meal_type registrados hoy
 * @returns {{id:string, tipo:'accion'|'mensaje', accion?:string, mensaje?:string, texto:string}[]}
 */
export function atajosDelChat({ hora, modoContador, metas = null, totales = null, comidas = null, t }) {
    const acciones = [
        { id: 'escanear', tipo: 'accion', accion: 'escanear', texto: t('Escanear mi plato') },
        { id: 'anotar', tipo: 'accion', accion: 'anotar', texto: t('Anotar comida') },
    ];
    const msg = (id, texto) => ({ id, tipo: 'mensaje', mensaje: texto, texto });
    const candidatos = [];
    const noche = hora >= 18;
    const conDatos = !!(metas && totales);

    // 1. de madrugada, lo único que se pregunta
    if (hora < 5) candidatos.push(msg('ligero', t('Tengo hambre: algo ligero')));

    if (conDatos) {
        const faltaProteina = Math.round((metas.protein || 0) - (totales.protein || 0));
        const sobraGrasa = (totales.fats || 0) - (metas.fats || 0);
        // 2. pasado de grasa: qué comer a partir de ahora
        if (metas.fats && sobraGrasa > 5) {
            candidatos.push(msg('grasa', noche ? t('Voy alto en grasa: ¿qué ceno?') : t('Voy alto en grasa: ¿qué como ahora?')));
        }
        // 3. proteína corta desde la tarde (por la mañana es normal ir corto)
        if (hora >= 14 && metas.protein && faltaProteina >= 20) {
            candidatos.push(msg('proteina', t('Me faltan {n} g de proteína: ¿qué como?', { n: faltaProteina })));
        }
    }

    // 4. la comida que toca y no está registrada
    if (Array.isArray(comidas)) {
        const tiene = (x) => comidas.includes(x);
        if (hora >= 5 && hora < 11 && !tiene('desayuno')) candidatos.push(msg('desayuno', t('Ideas de desayuno con proteína')));
        else if (hora >= 11 && hora < 16 && !tiene('almuerzo')) candidatos.push(msg('almuerzo', t('¿Qué almuerzo me conviene hoy?')));
        else if (hora >= 18 && hora < 23 && !tiene('cena')) candidatos.push(msg('cena', t('¿Qué ceno hoy?')));
    }

    // 5. el del modo
    candidatos.push(modoContador ? msg('como-voy', t('¿Cómo voy hoy?')) : msg('me-toca', t('¿Qué me toca ahora?')));

    const vistos = new Set();
    const mensajes = candidatos.filter((c) => (vistos.has(c.texto) ? false : vistos.add(c.texto)));
    return [...acciones, ...mensajes].slice(0, MAX);
}
