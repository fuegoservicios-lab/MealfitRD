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
