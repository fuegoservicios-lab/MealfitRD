// [P1-PLAN-LOTE-322 · 2026-09-25] Las dudas de la foto con respuestas de UN toque (escáner y chat).
//
// El análisis de la foto (`POST /api/diary/upload`) trae hasta 2 dudas; cada una con 2-5 opciones y lo que cambia
// cada opción en las macros del PLATO ENTERO (la que supuso la IA, en 0). El backend ya las normaliza; aquí se
// vuelven a validar porque un servidor anterior o un JSON raro no pueden romper la hoja.
import { t } from '../i18n';

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
            // [P1-PLAN-LOTE-626] lo que se LEE en el idioma del usuario; `texto` y `nombre_plato` siguen en español
            const textoMostrar = String(o.texto_mostrar || '').trim();
            if (textoMostrar) op.texto_mostrar = textoMostrar.slice(0, 60);
            const nombreMostrar = String(o.nombre_plato_mostrar || '').trim();
            if (nombreMostrar) op.nombre_plato_mostrar = nombreMostrar.slice(0, 200);
            return op;
        });
    return out.length >= 2 ? out : [];
}

/** Las dudas de un análisis: `{ sobre, pregunta, opciones }`, máx. 6 en platos compuestos, con pregunta. */
export function normalizarDudas(dudas) {
    return (Array.isArray(dudas) ? dudas : [])
        .filter((d) => d && typeof d === 'object' && String(d.pregunta || '').trim())
        .slice(0, 6)
        .map((d) => ({
            sobre: String(d.sobre || '').slice(0, 60),
            pregunta: String(d.pregunta).trim().slice(0, 160),
            opciones: normalizarOpciones(d.opciones),
        }));
}

/** Chat: las dudas CON opciones de todas las fotos del turno (1..4 fotos, máx. 12 en total). */
export function dudasDeLasFotos(subidas) {
    const out = [];
    for (const s of Array.isArray(subidas) ? subidas : []) {
        for (const d of normalizarDudas(s?.dudas)) {
            if (d.opciones.length >= 2) out.push(d);
            if (out.length === 12) return out;
        }
    }
    return out;
}

/** Índice de foto (0-based) paralelo al arreglo que devuelve `dudasDeLasFotos(subidas)`. */
export function indicesFotosDeDudas(subidas) {
    const out = [];
    const lista = Array.isArray(subidas) ? subidas : [];
    for (let idx = 0; idx < lista.length; idx += 1) {
        for (const d of normalizarDudas(lista[idx]?.dudas)) {
            if (d.opciones.length >= 2) out.push(idx);
            if (out.length === 12) return out;
        }
    }
    return out;
}

/**
 * Etiqueta por duda (`Foto N · Platillo`) cuando hay >= 2 fotos con dudas en el mismo turno;
 * devuelve `null` si las dudas vienen de una sola foto para no recargar paneles simples.
 */
export function etiquetasFotosDesde(indices, subidas) {
    if (!Array.isArray(indices) || !indices.length) return null;
    if (new Set(indices).size < 2) return null;
    const lista = Array.isArray(subidas) ? subidas : [];
    return indices.map((idx) => {
        const nombre = String(lista[idx]?.meal_name || '').trim().slice(0, 38);
        // [REVISION-88330c92] traducida: con la app en inglés salía «Foto 2 · …» en español
        return nombre ? t('Foto {n} · {nombre}', { n: idx + 1, nombre }) : t('Foto {n}', { n: idx + 1 });
    });
}

/** Chat: UN mensaje con todas las respuestas («4 huevos · Arepa») — un solo turno del coach, no uno por duda.
 *  [P1-PLAN-LOTE-626] con lo que el usuario leyó (el coach entiende cualquier idioma). */
export function mensajeDeRespuestas(dudas, elegidas) {
    return dudas
        .map((d, i) => { const o = d.opciones[elegidas?.[i]]; return o?.texto_mostrar || o?.texto; })
        .filter(Boolean)
        .join(' · ');
}
