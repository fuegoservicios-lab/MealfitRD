import {
    safeLocalStorageGet,
    safeLocalStorageRemove,
    safeLocalStorageSet,
} from './safeLocalStorage';

const CACHE_KEY = 'mealfit_paused_chunk_status_v1';

export function isPausedChunkStatus(status) {
    return !!(
        status
        && typeof status === 'object'
        && Number(status.pending_user_action_count || 0) > 0
        && Array.isArray(status.paused_chunks)
        && status.paused_chunks.length > 0
    );
}

function pausedChunksAreCovered(previous, generatedDays) {
    const count = Number(generatedDays);
    if (!Number.isFinite(count) || count < 1) return false;
    const chunks = Array.isArray(previous?.paused_chunks) ? previous.paused_chunks : [];
    if (chunks.length === 0) return false;

    return chunks.every((chunk) => {
        const offset = Number(chunk?.days_offset);
        const daysCount = Number(chunk?.days_count);
        return Number.isFinite(offset)
            && Number.isFinite(daysCount)
            && daysCount > 0
            && count >= offset + daysCount;
    });
}

export function reconcilePausedChunkStatus(previous, incoming, _cleanReads = 0, context = {}) {
    if (incoming == null) return { status: null, cleanReads: 0 };
    if (isPausedChunkStatus(incoming)) return { status: incoming, cleanReads: 0 };

    if (isPausedChunkStatus(previous)) {
        // El worker alterna pending_user_action -> pending/processing ->
        // pending_user_action en cada reintento. Incluso varias lecturas con
        // cola quieta pueden caer entre dos ciclos y NO prueban resolución.
        // `status=complete` NO es una prueba suficiente: pertenece al JSON del
        // plan, no a la fila de queue que originó el aviso, y durante recovery
        // puede seguir diciendo complete mientras esa fila alterna entre
        // pending/processing/pending_user_action. Solo retiramos la advertencia
        // cuando, además, los días del bloque pausado ya están materializados en
        // el plan. Así una lectura entre reintentos no provoca visible→oculto→
        // visible, pero una resolución real sí termina quitando el aviso.
        const noPause = Number(incoming.pending_user_action_count || 0) === 0;
        const covered = pausedChunksAreCovered(previous, context.generatedDays);
        // [P1-PAUSED-BANNER-RESOLVED · 2026-09-04] La pausa también se retira cuando el bloque
        // que estaba pausado YA está materializado en el plan y el servidor no reporta ninguna
        // pausa viva — aunque el plan siga `partial` con bloques futuros en cola. Antes solo la
        // retiraba `status=complete`: el dueño marcó «Ya compré», el bloque 2 se generó, y «Tu
        // primera compra está pendiente» iba a quedarse en pantalla hasta el último bloque del
        // mes. La prueba de los reintentos sigue intacta: entre ciclos de recovery los días del
        // bloque pausado NO existen todavía (covered=false), así que el aviso no parpadea.
        const resolved = noPause && covered;
        const terminal = incoming.status === 'complete'
            && Number(incoming.in_flight_count || 0) === 0
            && noPause
            && covered;
        if (!terminal && !resolved) return { status: previous, cleanReads: 0 };
    }

    return { status: incoming, cleanReads: 0 };
}

export function getCachedPausedChunkStatus(planId) {
    if (!planId) return null;
    const raw = safeLocalStorageGet(CACHE_KEY, null);
    if (!raw) return null;

    try {
        const entry = JSON.parse(raw);
        if (String(entry?.planId || '') !== String(planId)) return null;
        return isPausedChunkStatus(entry?.status) ? entry.status : null;
    } catch {
        safeLocalStorageRemove(CACHE_KEY);
        return null;
    }
}

export function syncPausedChunkStatusCache(planId, status) {
    if (!planId || !isPausedChunkStatus(status)) {
        const raw = safeLocalStorageGet(CACHE_KEY, null);
        if (!raw) return;
        try {
            const entry = JSON.parse(raw);
            if (!planId || String(entry?.planId || '') === String(planId)) {
                safeLocalStorageRemove(CACHE_KEY);
            }
        } catch {
            safeLocalStorageRemove(CACHE_KEY);
        }
        return;
    }

    safeLocalStorageSet(CACHE_KEY, JSON.stringify({ planId: String(planId), status }));
}
