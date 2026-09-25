// [P1-PLAN-LOTE-322 · 2026-09-25] Las dudas de la foto con respuestas de UN toque (escáner y chat).
//
// El análisis de la foto (`POST /api/diary/upload`) trae hasta 2 dudas; cada una con 2-5 opciones y lo que cambia
// cada opción en las macros del PLATO ENTERO (la que supuso la IA, en 0). El backend ya las normaliza; aquí se
// vuelven a validar porque un servidor anterior o un JSON raro no pueden romper la hoja.
const MACROS = ['calories', 'protein', 'carbs', 'healthy_fats'];

const _num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** Opciones válidas de una duda: texto no vacío, ajuste numérico, máx. 5. Menos de 2 no es una elección → []. */
export function normalizarOpciones(opciones) {
    const out = (Array.isArray(opciones) ? opciones : [])
        .filter((o) => o && typeof o === 'object' && String(o.texto || '').trim())
        .slice(0, 5)
        .map((o) => {
            const aj = o.ajuste && typeof o.ajuste === 'object' ? o.ajuste : {};
            const op = {
                texto: String(o.texto).trim().slice(0, 40),
                supuesta: o.supuesta === true,
                ajuste: MACROS.reduce((acc, k) => ({ ...acc, [k]: _num(aj[k]) }), {}),
            };
            const nombre = String(o.nombre_plato || '').trim();
            if (nombre) op.nombre_plato = nombre.slice(0, 200);
            return op;
        });
    return out.length >= 2 ? out : [];
}

/** Las dudas de un análisis: `{ sobre, pregunta, opciones }`, máx. 2, con pregunta. */
export function normalizarDudas(dudas) {
    return (Array.isArray(dudas) ? dudas : [])
        .filter((d) => d && typeof d === 'object' && String(d.pregunta || '').trim())
        .slice(0, 2)
        .map((d) => ({
            sobre: String(d.sobre || '').slice(0, 60),
            pregunta: String(d.pregunta).trim().slice(0, 160),
            opciones: normalizarOpciones(d.opciones),
        }));
}

/** Chat: las dudas CON opciones de las fotos de un turno (máx. 2 en total). Sin opciones no hay botones que ofrecer. */
export function dudasDeLasFotos(subidas) {
    const out = [];
    for (const s of Array.isArray(subidas) ? subidas : []) {
        for (const d of normalizarDudas(s?.dudas)) {
            if (d.opciones.length >= 2) out.push(d);
            if (out.length === 2) return out;
        }
    }
    return out;
}

/** Chat: UN mensaje con todas las respuestas («4 huevos · Arepa») — un solo turno del coach, no uno por duda. */
export function mensajeDeRespuestas(dudas, elegidas) {
    return dudas
        .map((d, i) => d.opciones[elegidas?.[i]]?.texto)
        .filter(Boolean)
        .join(' · ');
}
