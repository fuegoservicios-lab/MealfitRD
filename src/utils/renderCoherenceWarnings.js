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
//     delta_pct?: number             // MAGNITUD sin signo: 0.45 = 45% de
//                                    // diferencia. El backend la calcula como
//                                    // `abs(act - exp) / exp`, así que NUNCA es
//                                    // negativa — la dirección la da `hypothesis`,
//                                    // no el signo. Presente solo si magnitude=true.
//   }

import { getCoherenceHypothesisLabelI18n } from './coherenceLabels.js';
// [P1-I18N-DASHBOARD · 2026-08-15] `t`/`tn` de módulo: esto no es un componente.
// Todas las llamadas viven dentro de las funciones que construyen el toast, así
// que se evalúan al emitirlo — con el catálogo ya cargado, nunca al importar.
import { t, tn } from '../i18n';
import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';

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
 *     yield_uncovered, pantry_overdeduct, magnitude_undersupply,
 *     unit_mismatch} → severity=warning.
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
            // ⚠️ [P1-UNIT-MISMATCH-NO-ES-FALTANTE · 2026-08-05] `unit_mismatch === true` NO
            // es una divergencia: es el backend diciendo «no puedo comparar estas dos
            // cantidades». Lo calcula en shopping_calculator.py:
            //
            //     _unit_mismatch = (act_qty == 0 and any(v > 0 for v in act_units.values()))
            //
            // o sea: cero en ESTA unidad, pero el alimento SÍ se compró en otras. La
            // comparación cae en casillas distintas del mismo alimento, no en un faltante.
            //
            // Caso real (owner, 2026-08-05): «Ajo — compra menor que la receta, 78% de
            // diferencia». Las recetas lo pedían en `diente` (7) + `g` (10); la lista lo
            // traía en `paquete (4 uds.)` (1) + `g` (23,33). Al comparar la casilla
            // `diente` el guard veía 7 esperados y 0 comprados. El ajo estaba comprado.
            //
            // El backend YA marcaba estas filas — las etiquetaba y las emitía igual. Se
            // filtran aquí, en el surface, y no en el guard: su `hypothesis` sigue viajando
            // a la telemetría (`_shopping_coherence_block_history`) y las decisiones de
            // bloqueo/retry NO cambian. Lo único que desaparece es un aviso que le pide al
            // usuario revisar a mano una compra que está bien.
            //
            // ⚠️ NO silencia «no se compró nada»: ahí `act_units` está vacío o todo a cero,
            // `_unit_mismatch` es False y el aviso sigue saliendo.
            && w.unit_mismatch !== true
    );
    if (validItems.length === 0) {
        return null;
    }

    const HIGH_PRIORITY_HYPOTHESES = new Set([
        'cap_swallowed_modifier',
        'yield_uncovered',
        'pantry_overdeduct',
        // [P2-GUARD-UNDERSUPPLY-CANONICAL · 2026-08-03] Es la MISMA divergencia
        // que `pantry_overdeduct` (compra < mitad de lo que pide la receta),
        // solo que sobre una lista sin nevera deducida. Sin esta línea, el
        // renombre del backend degradaba el toast de `warning` a `info` en
        // silencio — mismo caso, menos aviso.
        'magnitude_undersupply',
        'unit_mismatch',
    ]);

    const hasHighPriority = validItems.some(
        (w) => HIGH_PRIORITY_HYPOTHESES.has(w.hypothesis)
    );
    const severity = hasHighPriority ? 'warning' : 'info';

    // Summary: primeros 2 items en formato "Food (causa)"
    const summary = validItems.slice(0, 2).map((w) => {
        const label = getCoherenceHypothesisLabelI18n(w.hypothesis, t) || t('revisar');
        // Si hay delta_pct y es significativo, anexar la magnitud.
        //
        // [P1-COHERENCE-DELTA-SIGN · 2026-08-05] SIN signo. `delta_pct` no es un
        // delta con signo: el backend lo calcula como
        // `abs(act_qty - exp_qty) / exp_qty` (shopping_calculator.py), o sea una
        // MAGNITUD de divergencia, siempre ≥ 0. Anteponerle "+" producía un "+"
        // en el 100% de los casos y, peor, contradecía la etiqueta: el owner
        // reportó el toast «Ajo (Compra menor que la receta, +88%)» — dice
        // "menor" y muestra "+". La dirección ya la da la etiqueta
        // (`Compra menor que la receta` / `Nevera dedujo de más`); el número
        // solo aporta CUÁNTO se separa de lo que piden las recetas.
        if (typeof w.delta_pct === 'number' && Math.abs(w.delta_pct) >= 0.10) {
            const pct = Math.round(Math.abs(w.delta_pct) * 100);
            // El nombre del alimento NO se traduce (es el SSOT del motor clínico);
            // lo que viaja al catálogo es el molde que lo rodea.
            return t('{food} ({label}, {pct}% de diferencia)', { food: w.food.trim(), label, pct });
        }
        return t('{food} ({label})', { food: w.food.trim(), label });
    });

    const title = tn(
        validItems.length,
        'Lista revisada — {n} item puede necesitar ajuste manual',
        'Lista revisada — {n} items pueden necesitar ajuste manual',
        { n: validItems.length },
    );

    // Description: lista summarized + hint "ver Historial > Ajustes" donde
    // el usuario puede inspeccionar todos los entries con `coherenceLabels`.
    let description = summary.join(' · ');
    if (validItems.length > summary.length) {
        description += ` · ${t('y {n} más', { n: validItems.length - summary.length })}`;
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

// [P1-COHERENCE-BANNER-NOISE · 2026-06-22] Hipótesis ACCIONABLES para el usuario:
// un alimento AUSENTE de la lista (cap_swallowed_modifier → "se te olvida comprarlo")
// o SUB-SUMINISTRO severo (pantry_overdeduct → "te quedas corto"). Las divergencias
// de magnitud benignas (unknown/unit_mismatch/yield_uncovered) son artefactos de
// unidad de compra / rendimiento cocido↔crudo / unidad entera — el alimento SÍ está
// en la lista. CADA recálculo (cambio de duración/household) appendea una entry
// `warn_only_recalc` benigna al historial; sin este filtro, el toast histórico
// ("Tu lista tuvo N revisiones automáticas") contaba esos recálculos benignos y
// alarmaba al usuario sin razón. Espejo del filtro de `summarize_divergences_for_ui`
// en el backend (banner en vivo). Tooltip-anchor: P1-COHERENCE-BANNER-NOISE.
const _ACTIONABLE_HYPOTHESES = new Set([
    'cap_swallowed_modifier',
    'pantry_overdeduct',
    // [P2-GUARD-UNDERSUPPLY-CANONICAL · 2026-08-03] El sub-suministro severo de una
    // lista SIN deducción de nevera. Hasta hoy el backend lo etiquetaba
    // `pantry_overdeduct` (culpando a un inventario que no participó) y por eso YA
    // contaba para este toast; al renombrarlo, omitirlo aquí lo habría sacado del
    // conteo en silencio — el usuario dejaría de enterarse justo del caso en que se
    // queda corto de comida. Espejo de `summarize_divergences_for_ui` en el backend.
    'magnitude_undersupply',
]);

/**
 * Una entry del historial es ACCIONABLE si bloqueó el plan (`block_set`) o si tuvo
 * al menos una hipótesis accionable. Las entries benignas (recálculos que solo
 * produjeron magnitud unknown/unit_mismatch/yield) NO cuentan para el toast.
 * @param {Object} e
 * @returns {boolean}
 */
const _isActionableHistoryEntry = (e) => {
    if (!e || typeof e !== 'object') return false;
    if (e.block_set) return true;
    const hyps = e.hypotheses && typeof e.hypotheses === 'object' ? e.hypotheses : {};
    return Object.keys(hyps).some((h) => _ACTIONABLE_HYPOTHESES.has(h));
};

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
            // [P1-I18N-DASHBOARD · 2026-08-15] `parsedTs`, no `t`: `t` es ahora el
            // traductor importado y este local lo tapaba dentro del filtro.
            const parsedTs = Date.parse(e.ts);
            if (!Number.isNaN(parsedTs) && parsedTs < cutoffMs) return false;
        }
        // [P1-COHERENCE-BANNER-NOISE · 2026-06-22] Solo cuentan revisiones
        // ACCIONABLES. Un recálculo benigno (warn_only_recalc que solo halló
        // magnitudes unknown/unit_mismatch/yield sobre alimentos presentes en la
        // lista) NO debe disparar "tu lista tuvo N revisiones automáticas".
        if (!_isActionableHistoryEntry(e)) return false;
        return true;
    });

    if (recent.length === 0) {
        return null;
    }

    // Todas las entries restantes son accionables (block o hipótesis accionable)
    // → severidad warning (vale la pena que el usuario revise).
    const severity = 'warning';

    // Ternario y no `tn`: el singular dice «una revisión», no «1 revisión» — un
    // plural con `{n}` cambiaría el copy español para que encaje en el molde.
    const title = recent.length === 1
        ? t('Tu lista de compras tuvo una revisión automática reciente')
        : t('Tu lista de compras tuvo {n} revisiones automáticas recientes', { n: recent.length });
    const description = t('Algunas cantidades pueden necesitar ajuste manual. Verifica los items antes de comprar.');

    return { severity, title, description, count: recent.length };
};

// [P3-HISTORICAL-TOAST-DISMISS · 2026-05-14] Persistencia del dismiss
// del toast histórico en localStorage. Pre-fix:
// `emitHistoricalCoherenceToast` emitía el toast en CADA descarga de
// PDF si había entries en `_shopping_coherence_block_history` ≤48h. Si
// el usuario lo cerraba y descargaba PDF 3 veces seguidas, veía el
// mismo toast 3 veces — molesto.
//
// Fix:
//   1. Antes de emitir, leer `mealfit_coherence_toast_dismissed_at`
//      de localStorage. Si dismiss < windowHours previas, omitir el
//      toast (usuario ya lo vio y lo cerró).
//   2. Al emitir, pasar `onDismiss` callback al toast de sonner que
//      escribe `Date.now()` al localStorage cuando el usuario cierra
//      manualmente (X o swipe).
//
// Cap defensivo: el dismiss state expira tras `windowHours` (default
// 48h) — mismo cap que el filtro de entries históricas. Si pasa el
// cap, el toast vuelve a aparecer (asume que el contexto cambió y
// vale la pena re-notificar).

const _DISMISS_STORAGE_KEY = 'mealfit_coherence_toast_dismissed_at';

/**
 * Lee timestamp de dismiss desde localStorage (best-effort, retorna
 * `null` si storage unavailable / valor inválido).
 */
const _readDismissAt = () => {
    try {
        const raw = typeof localStorage !== 'undefined'
            ? safeLocalStorageGet(_DISMISS_STORAGE_KEY, null)
            : null;
        if (raw === null || raw === undefined || raw === '') return null;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
};

/**
 * Escribe `Date.now()` al localStorage (best-effort, no-op si storage
 * unavailable). Llamado desde el `onDismiss` del toast.
 */
const _writeDismissAt = () => {
    try {
        if (typeof localStorage !== 'undefined') {
            safeLocalStorageSet(_DISMISS_STORAGE_KEY, String(Date.now()));
        }
    } catch { /* best-effort */ }
};

/**
 * Determina si el dismiss persistido cae DENTRO de la ventana actual.
 * Exportado para tests; el consumer normal solo lo usa indirectamente.
 *
 * @param {number} windowHours - ventana del dismiss state (default 48).
 * @returns {boolean} true si el usuario dismissed dentro del cap → skip toast.
 */
export const isHistoricalToastRecentlyDismissed = (windowHours = 48) => {
    const dismissedAt = _readDismissAt();
    if (dismissedAt === null) return false;
    const cap = (Number.isFinite(windowHours) && windowHours > 0 ? windowHours : 48) * 3600 * 1000;
    const age = Date.now() - dismissedAt;
    if (age < 0) return false; // clock skew → ignorar
    return age < cap;
};

/**
 * Emite toast a partir del historial. Misma semántica de fallback que
 * `emitCoherenceToast` (sonner API resiliente).
 *
 * [P3-HISTORICAL-TOAST-DISMISS · 2026-05-14] Respeta dismiss persistido
 * en localStorage: si el usuario cerró el toast dentro de `windowHours`
 * (default 48h), omite emit en este call. El timestamp se reescribe via
 * `onDismiss` cuando el usuario vuelve a cerrarlo.
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
    // [P3-HISTORICAL-TOAST-DISMISS] Skip si el usuario dismissed reciente.
    const windowHours = typeof options.windowHours === 'number' && options.windowHours >= 0
        ? options.windowHours
        : 48;
    if (isHistoricalToastRecentlyDismissed(windowHours)) {
        return null;
    }
    const { severity, title, description } = descriptor;
    const duration = typeof options.duration === 'number' ? options.duration : 8000;
    const toastOpts = { description, duration, onDismiss: _writeDismissAt };
    const emitter = severity === 'warning' ? toast.warning : toast.info;
    if (typeof emitter !== 'function') {
        if (typeof toast === 'function') {
            toast(title, toastOpts);
        }
        return descriptor;
    }
    emitter(title, toastOpts);
    return descriptor;
};
