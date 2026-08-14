/**
 * [P3-4 · 2026-05-10] Helper client-side para chip de shelf-life en Pantry.
 *
 * El backend (`db_inventory.py:_infer_shelf_life_days` + master_ingredients
 * `shelf_life_days`) ya computa caducidad y adjunta `[⚠️ URGENTE: Caduca en
 * X días]` al texto que envía al LLM, pero ESE texto no llega al frontend.
 * Hasta P3-4, la UI de Pantry no surfaceaba urgency al usuario aunque el
 * sistema sabía cuáles ingredientes priorizar.
 *
 * Estrategia client-side (vs. pedir un campo computado al backend):
 *   - El cálculo es trivial (resta de fechas + threshold) y no necesita
 *     LLM ni master_ingredients lookup adicional — todo viene en la
 *     respuesta de `user_inventory + master_ingredients(shelf_life_days)`
 *     que Pantry ya hace.
 *   - Mantiene a Pantry independiente de un nuevo endpoint backend.
 *   - Reactive: si el usuario consume el item (qty cambia) y queda muy
 *     poco, el chip sigue mostrándose hasta que el row se elimine.
 *
 * Política de fallback:
 *   - Si `created_at` falta o no parsea → `null` (sin chip).
 *   - Si `shelf_life_days` falta (item no en master_ingredients, o
 *     master_ingredients row con shelf_life_days NULL) → `null` (sin
 *     chip). NO inferimos por categoría client-side; mantener semántica
 *     conservadora (no asustar al usuario con advertencias sin data).
 *   - Si `days_left > 3` → `null` (sin chip — el chip es para urgency,
 *     no contador general).
 *
 * Severity buckets (alineado con backend `db_inventory.py:404-406`):
 *   - `expired`: días < 0 → "Caducó hace X días", color rojo intenso.
 *   - `urgent`:  días ≤ 1 → "Caduca hoy" o "Caduca mañana", rojo.
 *   - `warn`:    días ≤ 3 → "Caduca en X días", amber.
 *
 * @param {{created_at?: string, master_ingredients?: {shelf_life_days?: number|null}}} item
 *   Row de `user_inventory` con join a `master_ingredients`.
 * @returns {{daysLeft: number, severity: 'expired'|'urgent'|'warn', label: string} | null}
 */
export function getShelfLifeBadge(item) {
    if (!item || typeof item !== 'object') return null;
    const createdAt = item.created_at;
    const master = item.master_ingredients || {};
    const shelfLifeDays = master.shelf_life_days;

    if (typeof shelfLifeDays !== 'number' || shelfLifeDays <= 0) return null;
    if (!createdAt || typeof createdAt !== 'string') return null;

    let createdMs;
    try {
        // Acepta cualquier ISO timestamp parseable (con/sin TZ).
        createdMs = Date.parse(createdAt);
    } catch (_e) {
        return null;
    }
    if (!Number.isFinite(createdMs)) return null;

    // `daysOld` en días enteros desde el INSERT del row hasta ahora.
    // Math.floor para no contar fracciones (un item de 23h se considera 0d).
    const nowMs = Date.now();
    const daysOld = Math.floor((nowMs - createdMs) / (1000 * 60 * 60 * 24));
    const daysLeft = shelfLifeDays - daysOld;

    if (daysLeft > 3) return null;

    let severity, label;
    if (daysLeft < 0) {
        severity = 'expired';
        label = `Caducó hace ${Math.abs(daysLeft)} día${Math.abs(daysLeft) === 1 ? '' : 's'}`;
    } else if (daysLeft <= 1) {
        severity = 'urgent';
        label = daysLeft === 0 ? 'Caduca hoy' : 'Caduca mañana';
    } else {
        severity = 'warn';
        label = `Caduca en ${daysLeft} días`;
    }

    return { daysLeft, severity, label };
}

/**
 * Devuelve estilos inline para el chip según severity. Centralizado para
 * que los 3 buckets sean visualmente consistentes en cualquier site
 * (Pantry, futuras vistas Dashboard, etc.).
 *
 * @param {'expired'|'urgent'|'warn'} severity
 * @returns {{background: string, color: string, borderColor?: string}}
 */
export function getShelfLifeBadgeStyle(severity) {
    // [P1-SHELF-CHIP-VEIL · 2026-08-13] Los tres buckets vivían en hex claros
    // (amber-100 / red-50 / red-100). En tema oscuro el chip quedaba a +76 dL*
    // por encima de su propia fila —una etiqueta blanca sobre fondo oscuro,
    // reportado por el dueño— y la incoherencia era interna: la fila que lo
    // contiene (.row.low) ya se pintaba con velo y el chip de dentro no.
    //
    // La receta es la de los chips del Historial: un VELO del acento sobre
    // transparent. Al no traer luminosidad propia la toma de la fila que tenga
    // debajo, así que una sola definición sirve para los dos temas. Funciona
    // igual en estilo inline —que no admite media queries ni [data-theme]—
    // porque var() y color-mix() los resuelve el navegador en el contexto del
    // elemento; ESA es la razón de que el arreglo quepa aquí y no haga falta
    // mover el chip a CSS.
    //
    // Los tres niveles se separan por el PESO del velo (antes por saturación
    // del hex): expired 26% contra urgent 14% deja dL* 6,3 entre ambos. La
    // tinta de expired se refuerza hacia --text-main porque su velo más denso
    // se comía el contraste (4,32:1, bajo AA → 5,40:1).
    switch (severity) {
        case 'expired':
            return {
                background: 'color-mix(in srgb, var(--danger) 26%, transparent)',
                color: 'color-mix(in srgb, var(--danger-text) 75%, var(--text-main))',
                borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)',
            };
        case 'urgent':
            return {
                background: 'color-mix(in srgb, var(--danger) 14%, transparent)',
                color: 'var(--danger-text)',
                borderColor: 'color-mix(in srgb, var(--danger) 32%, transparent)',
            };
        case 'warn':
        default:
            return {
                background: 'color-mix(in srgb, var(--warning) 14%, transparent)',
                color: 'var(--warning-text)',
                borderColor: 'color-mix(in srgb, var(--warning) 32%, transparent)',
            };
    }
}
