// [P1-I18N-DASHBOARD · 2026-08-15 · P0-FE-CI-RED · 2026-09-04] Helpers del panel de
// micronutrientes que comparten el panel, el centro de notificaciones y Dashboard.jsx. Viven
// aparte del componente porque `react-refresh/only-export-components` no admite funciones y
// componentes en el mismo fichero (rompe el refresco en caliente). `classify` y
// `buildMicrosNotification` son SSOT compartido, así que no pueden exigir un `t` en la firma:
// reciben uno OPCIONAL cuyo default es el `t` de módulo (el motor lee el locale activo en cada
// llamada, no al importar).
import { safeLocalStorageRemove } from '../../utils/safeLocalStorage';
import { t as _t, tn as _tn } from '../../i18n';

// [P3-MICROS-RESTORE · 2026-06-19] "Desocultar" desde el centro de notificaciones.
// El centro llama a `restoreMicrosPanel(sig)`: (1) limpia la dismissal persistida
// —cubre el caso en que el panel NO está montado (el usuario está en /agente u
// otra ruta del dashboard); (2) dispara un evento para que un panel YA montado
// re-aparezca al instante. `sig` = firma de contenido (del id `micros_c_<sig>`).
export const MICROS_RESTORE_EVENT = 'mealfit:micros-restore';

export function restoreMicrosPanel(sig) {
    if (sig) {
        safeLocalStorageRemove(`mealfit_micros_dismissed_c_${sig}`);
        safeLocalStorageRemove(`mealfit_micros_notif_backfilled_c_${sig}`);
    }
    try {
        window.dispatchEvent(new CustomEvent(MICROS_RESTORE_EVENT, { detail: { sig: sig || null } }));
    } catch {
        /* SSR / sin window */
    }
}

/* [P3-MICRONUTRIENT-PANEL · 2026-06-15 · P3-MICRO-PLAIN-LANGUAGE · 2026-06-20]
   Panel "Micronutrientes a vigilar". Cada gap es una FILA DE ESTADO en palabras
   claras: el nutriente, un chip BAJO/ALTO con flecha (dirección), y una frase
   ("Te faltan 7g para tu meta de 38g" / "Te pasaste 247mg del límite de 2000mg").
   Reemplaza la barra de progreso anterior, que se leía como "cargando" y era
   INCOHERENTE — la misma barra casi llena significaba "bien" para un déficit
   (fibra) pero "mal" para un exceso (sodio). El color = severidad; la flecha +
   palabra = la dirección. Cada fila es tocable → preguntarle al coach IA cómo
   mejorarla. Dismissible (X, persistido por contenido).

   Data del backend (FS4/FS8): report.gaps[] = {nutriente, valor, unidad, piso,
   techo, status}; advice.items[] = {nutriente, suplemento, dosis_sugerida,
   primero_alimentos}; disclaimer en cualquiera de los dos. */

// [P3-NOTIF-CENTER-CONTENT-DISMISS · 2026-06-16] Firma ESTABLE del contenido del
// reporte para la clave de descarte del panel. El bug: la clave anterior usaba la
// identidad del plan (plan_id/id/sig), que en planes solo-localStorage es null o
// cambia entre remontajes (al navegar agente↔dashboard la ruta se desmonta) → la
// dismissal no se encontraba y el panel REAPARECÍA. El contenido (nutrientes +
// valores) es idéntico entre navegaciones del mismo plan → clave estable → la X
// aguanta de verdad. Cambia sólo si el reporte cambia (recalc/regen) = correcto.
function _hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}
export function microsContentSig(report, advice) {
    const parts = [];
    (report?.gaps || []).forEach((g) => parts.push(`${g.nutriente}=${g.valor}/${g.piso ?? g.techo ?? ''}`));
    (advice?.items || []).forEach((it) => parts.push(`s:${it.nutriente}`));
    const raw = parts.join('|');
    return raw ? _hashStr(raw) : '';
}

// Formatea un número para mostrarlo: hasta 1 decimal, sin ceros colgantes.
export function fmtN(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '';
    return String(Math.round(Number(n) * 10) / 10);
}

// [P3-MICRO-PLAIN-LANGUAGE · 2026-06-20] Clasifica un gap → ESTADO EN PALABRAS,
// no barra de progreso. El diseño anterior usaba una barra que se llenaba hacia
// el objetivo; el problema: una barra "casi llena" significaba COSAS OPUESTAS —
// buena para fibra/vit D (te acercas a la meta) pero MALA para sodio (te pasaste
// del límite) — y de paso se leía como "cargando". Ahora cada gap dice en palabras
// si te FALTA (piso) o te SOBRA (techo), cuánto, y con un color = severidad.
// Devuelve: direction ('low'|'high'), statusWord (BAJO/MUY BAJO/ALTO…), gap
// (brecha numérica), gapText (frase lista para mostrar) y tone (color).
// [P3-NOTIF-CENTER · 2026-06-16] SSOT compartido con el centro de notificaciones
// (mismas palabras/frases, cero drift). `fill`/`pct` se conservan por compat.
export function classify(g, t = _t) {
    const unit = g.unidad || '';
    const isCeil = g.techo !== undefined && g.techo !== null;
    if (isCeil) {
        const target = g.techo;
        const pct = target ? Math.round((g.valor / target) * 100) : 0;
        const gap = Math.max(0, Number(g.valor) - Number(target));
        const over = pct > 100;
        const tone = over ? 'over' : 'near';
        const statusWord = over ? t('ALTO') : t('EN EL LÍMITE');
        const gapText = over
            ? t('Te pasaste {gap}{unidad} del límite de {objetivo}{unidad}', { gap: fmtN(gap), objetivo: fmtN(target), unidad: unit })
            : t('Estás en tu límite de {objetivo}{unidad}', { objetivo: fmtN(target), unidad: unit });
        return { kind: 'ceil', direction: 'high', pct, fill: Math.min(pct, 100), over, tone, statusWord, gap, gapText, label: t('sobre el techo'), target };
    }
    const target = g.piso;
    const pct = target ? Math.round((g.valor / target) * 100) : 0;
    const gap = Math.max(0, Number(target) - Number(g.valor));
    const tone = pct >= 90 ? 'near' : pct >= 70 ? 'low' : 'far';
    const statusWord = pct >= 90 ? t('CASI') : pct >= 70 ? t('BAJO') : t('MUY BAJO');
    const gapText = t('Te faltan {gap}{unidad} para tu meta de {objetivo}{unidad}', { gap: fmtN(gap), objetivo: fmtN(target), unidad: unit });
    const label = g.status === 'estimado_bajo' ? t('estimado bajo') : t('por debajo');
    return { kind: 'floor', direction: 'low', pct, fill: Math.min(pct, 100), over: false, tone, statusWord, gap, gapText, label, target };
}

// [P3-NOTIF-CENTER · 2026-06-16] Construye el payload de notificación del panel
// de micros (resumen compacto de los gaps / sugerencias). SSOT compartido entre
// el descarte del panel (X) y el backfill del Dashboard (para descartes hechos
// ANTES de que existiera el archivado) → contenido idéntico, cero drift.
// Devuelve null si no hay nada accionable.
export function buildMicrosNotification({ report, advice, t = _t, tn = _tn }) {
    const gaps = report?.gaps || [];
    const supplements = advice?.items || [];
    if (!gaps.length && !supplements.length) return null;
    const microSummary = gaps.length
        ? gaps.map((g) => {
            const s = classify(g, t);
            return `${g.nutriente} ${g.valor}/${s.target}${g.unidad || ''}`;
        }).join('  ·  ')
        : tn(supplements.length, '{n} sugerencia de suplementación', '{n} sugerencias de suplementación', { n: supplements.length });
    // [P3-NOTIF-CENTER-CONTENT-DISMISS · 2026-06-16] id ESTABLE por contenido
    // (no por planId, que es null/inestable en planes solo-localStorage). Espeja
    // la clave de dismissal → archive del panel y backfill del Dashboard producen
    // el MISMO id → reconcileBackfill lo trata como existente (cero duplicados).
    const sig = microsContentSig(report, advice);
    return {
        id: sig ? `micros_c_${sig}` : undefined,
        kind: 'micros',
        title: t('Micronutrientes a vigilar'),
        message: microSummary,
        severity: 'info',
        // Payload estructurado para la vista expandida (info completa + acción).
        data: {
            gaps,
            supplements,
            disclaimer: advice?.disclaimer || report?.disclaimer || null,
        },
    };
}
