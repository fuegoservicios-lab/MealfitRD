import { fetchWithAuth } from '../config/api';
import { safeLocalStorageGet } from './safeLocalStorage';

let current = null;

// Plan and the app-wide recovery wake together. Share only a recent request,
// never a settled status or a request frozen while the app was in the background.
export function readPendingPlanStatus() {
    const user = safeLocalStorageGet('mealfit_user_id', null);
    const sid = safeLocalStorageGet('mealfit_guest_session_id', null);
    const session = safeLocalStorageGet('mealfit_mf_session', null);
    const key = JSON.stringify([user, sid, session]);
    if (current?.key === key && Date.now() - current.startedAt < 1000) return current.promise;
    const request = { key, startedAt: Date.now(), promise: null };
    request.promise = (async () => {
        try {
            const qs = sid ? `?session_id=${encodeURIComponent(sid)}` : '';
            const response = await fetchWithAuth(`/api/plans/pending-status${qs}`, { method: 'GET' });
            return response.ok ? await response.json() : null;
        } catch { return null; }
    })().finally(() => { if (current === request) current = null; });
    current = request;
    return request.promise;
}
