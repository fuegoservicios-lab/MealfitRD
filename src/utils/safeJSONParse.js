/**
 * [P2-A · 2026-05-08] Helper SSOT para parseo defensivo de JSON desde
 * `localStorage` (u otra fuente externa potencialmente corrupta).
 *
 * Por qué existe:
 *   `JSON.parse(raw)` lanza `SyntaxError` si `raw` está malformado, y devuelve
 *   un payload del shape equivocado (string/number/object cuando se espera
 *   array, etc.) si el JSON parsea pero la forma cambió. En ambos casos el
 *   código consumer asume el shape esperado y falla con TypeError después.
 *
 *   Sites históricos vulnerables (ChatWidget, AgentPage, Pantry, Plan):
 *     - Top-level useState initializer → whitescreen del Dashboard (P1-B).
 *     - Handlers/async → feature roto silencioso, storage permanece corrupto
 *       sin self-heal hasta intervención manual del usuario.
 *
 *   Patrones previos ad-hoc cerraban cada caso a mano (P2-B initial → 3 sites,
 *   P1-B → ChatWidget initializer). Este SSOT evita drift y centraliza la
 *   semántica del fallback + self-heal.
 *
 * API:
 *   safeJSONParse(raw, fallback, opts?)
 *
 *   raw: string | null | undefined — típicamente `localStorage.getItem(key)`.
 *   fallback: any — valor a retornar si parse falla o validator rechaza.
 *   opts.validator: (parsed) => boolean — opcional. Si presente y retorna
 *     false para el parsed value, el helper trata como corrupto. Útil para
 *     forzar shape: `Array.isArray`, `(v) => v && typeof v === 'object'`, etc.
 *   opts.storageKey: string — opcional. Si presente y el parse falla
 *     (`SyntaxError` o validator-fail), el helper reescribe
 *     `localStorage[storageKey] = JSON.stringify(fallback)` para self-healing.
 *     El siguiente read no vuelve a tropezar.
 *   opts.onCorrupt: (raw, err?) => void — opcional. Callback para logging
 *     o instrumentación. Se llama tanto en SyntaxError como en validator-fail.
 *
 * Returns:
 *   parsed value if valid; fallback otherwise. NUNCA throw.
 */

const _DEFAULT_OPTS = Object.freeze({});

export function safeJSONParse(raw, fallback, opts = _DEFAULT_OPTS) {
    // Casos triviales: null/undefined/no-string → devolver fallback sin tocar
    // storage. Estos NO son corrupción (no hay nada que parsear), por lo que
    // tampoco invocamos onCorrupt ni reescribimos storage.
    if (raw === null || raw === undefined || typeof raw !== 'string') {
        return fallback;
    }
    // String vacío: tampoco lo consideramos corrupción (no hay payload).
    if (raw.length === 0) {
        return fallback;
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        _handleCorrupt(raw, err, fallback, opts);
        return fallback;
    }

    // Validator opcional: el parse OK pero el shape no es el esperado
    // (e.g. `JSON.parse('"a string"')` parsea a string sin throw).
    if (typeof opts.validator === 'function') {
        let ok = false;
        try {
            ok = !!opts.validator(parsed);
        } catch {
            ok = false;
        }
        if (!ok) {
            _handleCorrupt(raw, null, fallback, opts);
            return fallback;
        }
    }

    return parsed;
}

function _handleCorrupt(raw, err, fallback, opts) {
    if (typeof opts.onCorrupt === 'function') {
        try { opts.onCorrupt(raw, err); }
        catch { /* el callback no debe propagar */ }
    }
    // Self-heal opcional: reescribir storage si nos dieron la key.
    if (
        typeof opts.storageKey === 'string' && opts.storageKey.length > 0 &&
        typeof localStorage !== 'undefined'
    ) {
        try {
            localStorage.setItem(opts.storageKey, JSON.stringify(fallback));
        } catch {
            // QuotaExceeded / storage disabled: best-effort, no propagar.
        }
    }
}

/**
 * Atajo ergonómico cuando el shape esperado es un array.
 * Defaults: fallback=[], validator=Array.isArray.
 */
export function safeJSONParseArray(raw, opts = _DEFAULT_OPTS) {
    return safeJSONParse(raw, [], { validator: Array.isArray, ...opts });
}

/**
 * Atajo ergonómico cuando el shape esperado es un objeto plain (no-null,
 * no-array). Defaults: fallback={}, validator chequea typeof === 'object'.
 */
export function safeJSONParseObject(raw, opts = _DEFAULT_OPTS) {
    const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    return safeJSONParse(raw, {}, { validator: isObj, ...opts });
}
