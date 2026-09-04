// [P1-ARQ25-F4-FORM · 2026-09-03] Embudo del wizard → `POST /api/plans/telemetry/wizard` →
// `pipeline_metrics.node='wizard_funnel'`. Es la LÍNEA BASE que el gate de la Fase 4 exige («sin
// caída de conversión frente a la línea base, medida, no supuesta»). Best-effort: se encola, se
// envía en lotes y nunca bloquea al wizard. Respeta el opt-out de analítica. El `sid` es un id
// aleatorio por navegador (no PII): el backend lo hashea antes de guardarlo.
import { fetchWithAuth } from '../config/api';
import { isAnalyticsOptedOut } from './analytics';
import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';

export const WIZARD_SID_KEY = 'mealfit_wizard_sid';
export const WIZARD_TELEMETRY_ENDPOINT = '/api/plans/telemetry/wizard';
const FLUSH_AFTER_MS = 4000;
const FLUSH_AT = 10;

let _queue = [];
let _timer = null;

const _randomId = () => {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch { /* no-op */ }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const wizardSid = () => {
    let sid = safeLocalStorageGet(WIZARD_SID_KEY, null);
    if (!sid) {
        sid = _randomId();
        safeLocalStorageSet(WIZARD_SID_KEY, sid);
    }
    return sid;
};

export const flushWizardTelemetry = ({ beacon = false } = {}) => {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    if (_queue.length === 0) return false;
    const events = _queue.splice(0, 20);
    const body = JSON.stringify({ sid: wizardSid(), events });
    if (beacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
            navigator.sendBeacon(WIZARD_TELEMETRY_ENDPOINT, new Blob([body], { type: 'application/json' }));
            return true;
        } catch { /* cae al fetch */ }
    }
    try {
        const p = fetchWithAuth(WIZARD_TELEMETRY_ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true,
        });
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* best-effort */ }
    return true;
};

export const trackWizard = (event, meta = {}) => {
    if (isAnalyticsOptedOut()) return false;
    _queue.push({ event, ...meta, ts: Date.now() });
    if (_queue.length >= FLUSH_AT) flushWizardTelemetry();
    else if (!_timer) _timer = setTimeout(() => flushWizardTelemetry(), FLUSH_AFTER_MS);
    return true;
};

/** Solo tests. */
export const _wizardTelemetryQueueForTests = () => _queue.slice();
export const _resetWizardTelemetryForTests = () => {
    _queue = [];
    if (_timer) clearTimeout(_timer);
    _timer = null;
};
