// [P2-AUDIT-NEW-1 · 2026-05-12] Consumidor frontend de `_coherence_warnings`.
//
// El backend emite `_coherence_warnings` (top-5 divergencias summarized vía
// `summarize_divergences_for_ui`) en las responses de:
//
//   - POST /api/plans/recalculate-shopping-list  (P2-COHERENCE-1)
//   - agent tool `modify_single_meal` (en el JSON del response del agente,
//     bajo la key `_coherence_warnings`)
//
// Antes (audit 2026-05-12): el backend producía la telemetría pero el
// frontend la ignoraba — `grep _coherence_warnings frontend/src` = 0 matches.
// Resultado: toast no-bloqueante "lista revisada, items pueden necesitar
// ajuste" documentado pero nunca renderizado al usuario.
//
// Este helper centraliza:
//   1. Detección de presencia/forma del payload (resiliente a backend
//      que no lo emita — endpoints antiguos retornan el response sin la key).
//   2. Construcción de un mensaje corto (max ~120 chars) para el body del toast.
//   3. Construcción de un description con los primeros 2-3 items para detalle.
//   4. Decisión de severidad: warning (default — divergencias críticas
//      como cap_swallowed_modifier) vs info (drift menor sin causa
//      identificada — hypothesis="unknown").
//
// Shape esperado de cada item (espejo de `summarize_divergences_for_ui`):
//   {
//     food: string,                  // "Pechuga de Pollo"
//     hypothesis: string,            // "cap_swallowed_modifier" | "unit_mismatch" | "unknown" | ...
//     side: string,                  // "left" | "right" | ""
//     magnitude: boolean,            // true si la divergencia es de magnitud
//     delta_pct?: number             // -0.45 = -45%, presente solo si magnitude=true
//   }

import { getCoherenceHypothesisLabel } from './coherenceLabels.js';

/**
 * @typedef {Object} CoherenceWarningItem
 * @property {string} food
 * @property {string} hypothesis
 * @property {string} [side]
 * @property {boolean} [magnitude]
 * @property {number} [delta_pct]
 */

/**
 * @typedef {Object} ToastDescriptor
 * @property {'warning'|'info'} severity
 * @property {string} title          // texto principal (1 línea)
 * @property {string} description    // detalles concatenados (≤180 chars)
 * @property {number} count          // total de warnings (puede ser >2 — solo summarizamos 2)
 */

/**
 * Construye un mensaje compacto para el toast a partir de la lista de
 * warnings. Retorna `null` si no hay warnings — el caller debe omitir
 * el toast en ese caso.
 *
 * Política de severidad:
 *   - Si AL MENOS UN warning tiene hypothesis ∈ {cap_swallowed_modifier,
 *     yield_uncovered, pantry_overdeduct, unit_mismatch} → severity=warning.
 *   - Si TODOS son hypothesis=unknown → severity=info (drift sin
 *     diagnóstico, usuario probablemente no necesita acción).
 *
 * @param {CoherenceWarningItem[]|null|undefined} warnings
 * @returns {ToastDescriptor|null}
 */
export const buildCoherenceToast = (warnings) => {
    if (!Array.isArray(warnings) || warnings.length === 0) {
        return null;
    }

    const validItems = warnings.filter(
        (w) => w && typeof w === 'object' && typeof w.food === 'string' && w.food.trim()
    );
    if (validItems.length === 0) {
        return null;
    }

    const HIGH_PRIORITY_HYPOTHESES = new Set([
        'cap_swallowed_modifier',
        'yield_uncovered',
        'pantry_overdeduct',
        'unit_mismatch',
    ]);

    const hasHighPriority = validItems.some(
        (w) => HIGH_PRIORITY_HYPOTHESES.has(w.hypothesis)
    );
    const severity = hasHighPriority ? 'warning' : 'info';

    // Summary: primeros 2 items en formato "Food (causa)"
    const summary = validItems.slice(0, 2).map((w) => {
        const label = getCoherenceHypothesisLabel(w.hypothesis) || 'revisar';
        // Si hay delta_pct y es significativo, anexar la magnitud.
        if (typeof w.delta_pct === 'number' && Math.abs(w.delta_pct) >= 0.10) {
            const sign = w.delta_pct > 0 ? '+' : '';
            const pct = Math.round(w.delta_pct * 100);
            return `${w.food.trim()} (${label}, ${sign}${pct}%)`;
        }
        return `${w.food.trim()} (${label})`;
    });

    const title =
        validItems.length === 1
            ? 'Lista revisada — 1 item puede necesitar ajuste manual'
            : `Lista revisada — ${validItems.length} items pueden necesitar ajuste manual`;

    // Description: lista summarized + hint "ver Historial > Ajustes" donde
    // el usuario puede inspeccionar todos los entries con `coherenceLabels`.
    let description = summary.join(' · ');
    if (validItems.length > summary.length) {
        description += ` · y ${validItems.length - summary.length} más`;
    }
    // Cap defensive (sonner trunca pero queremos cap explícito).
    if (description.length > 180) {
        description = description.slice(0, 177) + '...';
    }

    return {
        severity,
        title,
        description,
        count: validItems.length,
    };
};

/**
 * Helper para integrar con la API sonner — recibe los warnings y la
 * referencia a `toast` (no la importamos acá para evitar coupling de
 * libraries en utils/). El caller pasa el toast desde su scope:
 *
 *   import { toast } from 'sonner';
 *   import { emitCoherenceToast } from '@/utils/renderCoherenceWarnings';
 *   emitCoherenceToast(toast, response._coherence_warnings);
 *
 * Si no hay warnings (lista vacía o ausente), NO emite nada — silencio
 * por default.
 *
 * @param {Object} toast        sonner toast namespace (`toast.warning`, `toast.info`)
 * @param {CoherenceWarningItem[]|null|undefined} warnings
 * @param {Object} [options]
 * @param {number} [options.duration]  ms (default 8000 — más largo que toast.success
 *                                     porque queremos que el usuario alcance a leer)
 * @returns {ToastDescriptor|null}     descriptor emitido (para tests / telemetría)
 */
export const emitCoherenceToast = (toast, warnings, options = {}) => {
    const descriptor = buildCoherenceToast(warnings);
    if (!descriptor) {
        return null;
    }
    const { severity, title, description } = descriptor;
    const duration = typeof options.duration === 'number' ? options.duration : 8000;
    const emitter = severity === 'warning' ? toast.warning : toast.info;
    if (typeof emitter !== 'function') {
        // Fallback defensivo: si sonner cambia API, no crashear el flow.
        if (typeof toast === 'function') {
            toast(title, { description, duration });
        }
        return descriptor;
    }
    emitter(title, { description, duration });
    return descriptor;
};

// ============================================================
// [P2-SHOPPING-1 · 2026-05-14] Consumidor de `_shopping_coherence_block_history`
// ------------------------------------------------------------
// Espejo de `buildCoherenceToast`/`emitCoherenceToast` pero opera sobre el
// HISTORIAL persistido en `plan_data._shopping_coherence_block_history`
// (P3-NEW-C · 2026-05-11), no sobre `_coherence_warnings` de una response.
//
// Por qué se necesita:
//   `emitCoherenceToast` se invoca SOLO tras `/recalculate-shopping-list`
//   (Pantry add/delete, Dashboard cambio de groceryDuration, swap post-
//   recalc) y tras `modify_single_meal` del agente. Pero el usuario que
//   abre Dashboard y descarga PDF directo NO pasa por recalc — y por
//   tanto NUNCA ve telemetría aunque el plan tenga entries reales en
//   `_shopping_coherence_block_history` (escritas por chunk worker T2,
//   cron diario, agent tool, /recipe/expand, etc.).
//
// Entry shape (backend, espejo de
// `shopping_calculator.run_shopping_coherence_guard_and_append_history`):
//   {
//     ts: ISO timestamp,
//     attempt: int,
//     divergence_count: int,
//     presence_count: int,
//     magnitude_count: int,
//     hypotheses: { cap_swallowed_modifier: 2, unit_mismatch: 1, ... },
//     block_set: bool,
//     action_taken: "degrade" | "reject_minor" | "reject_high" |
//                   "warn_only_chunk_t2" | "warn_only_recalc" |
//                   "warn_only_agent_tool" | "warn_only_cron_daily" |
//                   "post_swap_revalidation" | "not_applicable" |
//                   "hydration_error" | null
//   }
//
// Política de filtrado:
//   - Entries con `action_taken ∈ {null, "not_applicable", "hydration_error"}`
//     se ignoran: el primero es invariant violation (P2-2), el segundo es
//     placeholder warn-mode sin acción real, el tercero es bug
//     interno (review_plan_node falló — no es señal al usuario final).
//   - Entries fuera de `windowHours` (default 48h) se ignoran — un
//     plan persiste hasta 30d y un entry de hace 25 días ya no es
//     accionable.
//   - Severity warning si AL MENOS UNO tiene `block_set=true` (degrade/
//     reject_*) o `hypotheses` incluye `cap_swallowed_modifier` /
//     `unit_mismatch`. Resto = info.
// ============================================================

const _HISTORICAL_ACTION_BLACKLIST = new Set([
    'not_applicable',
    'hydration_error',
]);

const _CRITICAL_HYPOTHESES = new Set([
    'cap_swallowed_modifier',
    'unit_mismatch',
]);

/**
 * @param {Array|null|undefined} history - plan_data._shopping_coherence_block_history
 * @param {Object} [opts]
 * @param {number} [opts.windowHours=48] - solo entries en últimas N horas (0 = sin filtro temporal)
 * @returns {ToastDescriptor|null}
 */
export const buildHistoricalCoherenceToast = (history, opts = {}) => {
    if (!Array.isArray(history) || history.length === 0) {
        return null;
    }
    const windowHours = typeof opts.windowHours === 'number' && opts.windowHours >= 0
        ? opts.windowHours
        : 48;
    const cutoffMs = windowHours > 0
        ? Date.now() - windowHours * 3600 * 1000
        : 0;

    const recent = history.filter((e) => {
        if (!e || typeof e !== 'object') return false;
        const action = e.action_taken;
        if (!action || _HISTORICAL_ACTION_BLACKLIST.has(action)) return false;
        if (windowHours > 0 && typeof e.ts === 'string') {
            const t = Date.parse(e.ts);
            if (!Number.isNaN(t) && t < cutoffMs) return false;
        }
        return true;
    });

    if (recent.length === 0) {
        return null;
    }

    const hasCritical = recent.some((e) => {
        if (e.block_set) return true;
        const hyps = e.hypotheses && typeof e.hypotheses === 'object' ? e.hypotheses : {};
        return Object.keys(hyps).some((h) => _CRITICAL_HYPOTHESES.has(h));
    });
    const severity = hasCritical ? 'warning' : 'info';

    const title = recent.length === 1
        ? 'Tu lista de compras tuvo una revisión automática reciente'
        : `Tu lista de compras tuvo ${recent.length} revisiones automáticas recientes`;
    const description = 'Algunas cantidades pueden necesitar ajuste manual. Verifica los items antes de comprar.';

    return { severity, title, description, count: recent.length };
};

/**
 * Emite toast a partir del historial. Misma semántica de fallback que
 * `emitCoherenceToast` (sonner API resiliente).
 *
 * @param {Object} toast - sonner toast namespace
 * @param {Array|null|undefined} history
 * @param {Object} [options]
 * @param {number} [options.duration=8000]
 * @param {number} [options.windowHours=48]
 * @returns {ToastDescriptor|null}
 */
export const emitHistoricalCoherenceToast = (toast, history, options = {}) => {
    const descriptor = buildHistoricalCoherenceToast(history, options);
    if (!descriptor) {
        return null;
    }
    const { severity, title, description } = descriptor;
    const duration = typeof options.duration === 'number' ? options.duration : 8000;
    const emitter = severity === 'warning' ? toast.warning : toast.info;
    if (typeof emitter !== 'function') {
        if (typeof toast === 'function') {
            toast(title, { description, duration });
        }
        return descriptor;
    }
    emitter(title, { description, duration });
    return descriptor;
};
