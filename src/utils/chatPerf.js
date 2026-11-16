// [P1-PLAN-LOTE-1001 · G-01 · 2026-11-14] Telemetría real de latencia percibida en el chat
// (envío -> primer chunk y primer texto pintado en pantalla), correlacionada con el `corr` del turno.
import { fetchWithAuth } from '../config/api';

const _roundMs = (val) => (typeof val === 'number' && Number.isFinite(val) && val >= 0
    ? Math.min(600_000, Math.round(val))
    : null);

export const detectClientPlatform = () => {
    try {
        if (typeof window !== 'undefined' && window.Capacitor && typeof window.Capacitor.getPlatform === 'function') {
            return String(window.Capacitor.getPlatform() || 'capacitor').slice(0, 32);
        }
    } catch { /* ignore */ }
    return 'web';
};

export const buildClientPerfPayload = ({
    corr,
    sessionId,
    firstChunkMs,
    firstPaintMs,
    streamTotalMs,
    chunkCount = 0,
    isCallMode = false,
    platform,
}) => {
    if (!sessionId) return null;
    const fc = _roundMs(firstChunkMs);
    const fp = _roundMs(firstPaintMs ?? firstChunkMs);
    const st = _roundMs(streamTotalMs);
    return {
        corr: typeof corr === 'string' && corr.trim() ? corr.trim().slice(0, 64) : null,
        session_id: String(sessionId),
        first_chunk_ms: fc,
        first_paint_ms: fp,
        stream_total_ms: st,
        chunk_count: Math.max(0, Math.round(Number(chunkCount) || 0)),
        is_call_mode: !!isCallMode,
        platform: (platform || detectClientPlatform()),
    };
};

// [P1-PLAN-LOTE-1040 · A-33 · 2026-11-16] Qué paquete de la app habla con el servidor. En la app nativa el teléfono
// aplica el paquete OTA nuevo al SEGUNDO arranque: tras un deploy conviven paquetes viejos y nuevos, y el servidor
// tiene que saber cuáles siguen vivos antes de retirar nada del protocolo del stream. Viaja en el CUERPO del chat
// (no en una cabecera: en nativo toda llamada es de otro origen y una cabecera nueva exigiría su preflight).
export const paqueteDelCliente = () => {
    try {
        if (typeof __OTA_BUNDLE_ID__ === 'string' && __OTA_BUNDLE_ID__) return `ota:${__OTA_BUNDLE_ID__}`.slice(0, 48);
        if (typeof __WEB_BUILD_ID__ === 'string' && __WEB_BUILD_ID__) return `web:${__WEB_BUILD_ID__}`.slice(0, 48);
    } catch { /* sin defines (tests): desconocido */ }
    return 'web:?';
};

// [P1-PLAN-LOTE-1038 · A-23 · 2026-11-16] El stream se cortó y el rescate terminó: ¿recuperó la respuesta?
// Desde que el turno corre en su propio hilo en el servidor (lote 760), el servidor ya no ve los cortes: solo el
// cliente sabe si el usuario se quedó sin respuesta. Un evento por episodio, sin texto del usuario.
export const RESULTADOS_DE_CORTE = ['rescued', 'exhausted', 'dead'];

export const buildStreamCutPayload = ({ sessionId, outcome, attempts = 0, waitedMs, platform } = {}) => {
    if (!sessionId || !RESULTADOS_DE_CORTE.includes(outcome)) return null;
    return {
        event: 'stream_cut',
        session_id: String(sessionId),
        outcome,
        attempts: Math.max(0, Math.min(100, Math.round(Number(attempts) || 0))),
        waited_ms: _roundMs(waitedMs) ?? 0,
        platform: (platform || detectClientPlatform()),
    };
};

export const sendStreamCutTelemetry = (episodio, { fetcher = fetchWithAuth } = {}) => {
    const payload = buildStreamCutPayload(episodio || {});
    if (!payload || typeof fetcher !== 'function') return Promise.resolve(false);
    try {
        return Promise.resolve(
            fetcher('/api/chat/client-metrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true,
            })
        )
            .then(() => true)
            .catch(() => false);
    } catch {
        return Promise.resolve(false);
    }
};

export const sendClientPerfTelemetry = (metrics, { fetcher = fetchWithAuth } = {}) => {
    const payload = buildClientPerfPayload(metrics || {});
    if (!payload || typeof fetcher !== 'function') return Promise.resolve(false);
    try {
        return Promise.resolve(
            fetcher('/api/chat/client-metrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true,
            })
        )
            .then(() => true)
            .catch(() => false);
    } catch {
        return Promise.resolve(false);
    }
};
