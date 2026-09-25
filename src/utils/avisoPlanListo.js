// [P1-PLAN-LOTE-228 · 2026-09-25] «Tu plan está listo» con la app en segundo plano — la mitad NATIVA.
//
// El dueño: «cuando se esté generando un plan en el móvil, quiero que se pueda salir de la app y que cuando termine
// llegue una notificación, como la de hidratación o la de comer».
//
// Salir ya se podía (la generación corre en el servidor y el plan se guarda igual). En el navegador/PWA avisa el
// servidor con una Web Push (`backend/aviso_plan_listo.py`). En la app nativa no hay push del servidor (sin FCM), así
// que avisa el propio teléfono con una notificación LOCAL, como los recordatorios de comida:
//
//   1. Al salir de la app con una generación en vuelo, se programa un RESPALDO para cuando el plan ya debería estar
//      (inicio + p90 real de `/generation-eta`, nunca antes de 3 min): si el sistema mata la app, al menos ese llega.
//   2. Mientras la app sigue viva en segundo plano (Android deja correr los temporizadores: `KeepRunning` de
//      Capacitor), se consulta el servidor cada 20 s. Al terminar: se cancela el respaldo y sale «Tu plan está listo»
//      al momento. Si falla: «No pudimos terminar tu plan».
//   3. Al volver a la app, se cancela todo: la pantalla de carga y el toast ya se encargan.
//
// «Terminó» se reconoce por DOS señales, porque la página, viva en segundo plano, puede recoger el plan antes que
// este vigía y borrar el estado del servidor (`/pending-status/ack`): el servidor dice `complete`, o el plan guardado
// en este dispositivo (`mealfit_plan`) cambió desde que salimos.
import { isNativeApp } from '../config/platform';
import { fetchWithAuth } from '../config/api';
import { t } from '../i18n';
import { hasPendingPipelineInFlight, readPendingFlag } from './pendingPipelineFlag';
import { safeLocalStorageGet } from './safeLocalStorage';
import { permisoAvisosLocales, programarAvisoLocal, cancelarAvisosLocales } from './avisosDeComida';

export const ID_PLAN_LISTO = 4300;
export const ID_PLAN_RESPALDO = 4301;
export const INTERVALO_MS = 20 * 1000;
export const RESPALDO_MINIMO_MS = 3 * 60 * 1000;
export const P90_POR_DEFECTO_S = 15 * 60;

/** Identidad del plan guardado en este dispositivo (cambia cuando llega uno nuevo), o null. Pura. */
export function firmaDelPlan(raw) {
    try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!p || typeof p !== 'object') return null;
        const id = p.id || p.plan_id || '';
        const cuando = p.created_at || p.generated_at || p.cycle_start_date || p.grocery_start_date || '';
        const dias = Array.isArray(p.days) ? p.days.length : 0;
        return id || cuando ? `${id}|${cuando}|${dias}` : null;
    } catch {
        return null;
    }
}

/** Cuándo sale el respaldo: inicio + p90, nunca antes de `ahora + 3 min`. Pura. */
export function momentoDelRespaldo({ startedAt, p90s, ahora = Date.now() } = {}) {
    const p90 = Number.isFinite(p90s) && p90s > 0 ? p90s : P90_POR_DEFECTO_S;
    const inicio = new Date(startedAt || '').getTime();
    const previsto = Number.isFinite(inicio) ? inicio + p90 * 1000 : ahora + p90 * 1000;
    return new Date(Math.max(previsto, ahora + RESPALDO_MINIMO_MS));
}

/** Qué hacer en un tick: 'listo' | 'fallo' | 'seguir' | 'parar'. Pura. */
export function decidir({ estado, firmaAntes, firmaAhora, hayFlag }) {
    if (firmaAhora && firmaAhora !== firmaAntes) return 'listo';
    if (estado === 'complete') return 'listo';
    if (estado === 'failed') return 'fallo';
    if (estado === 'generating') return 'seguir';
    // Sin estado (o 'none'): con el flag aún puesto, la página está recogiendo el plan — un tick más.
    return hayFlag ? 'seguir' : 'parar';
}

/** Al empezar a generar en la app nativa: pide el permiso de notificaciones si aún no se ha decidido. */
export function prepararAvisoPlanListo() {
    if (!isNativeApp()) return;
    permisoAvisosLocales({ pedir: true }).catch(() => {});
}

const _firmaActual = () => firmaDelPlan(safeLocalStorageGet('mealfit_plan', null));

async function _p90() {
    try {
        const r = await Promise.race([
            fetchWithAuth('/api/plans/generation-eta'),
            new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
        ]);
        const j = r && r.ok ? await r.json() : null;
        return j && Number.isFinite(j.p90_s) ? j.p90_s : null;
    } catch {
        return null;
    }
}

async function _estadoDelServidor() {
    try {
        const r = await fetchWithAuth('/api/plans/pending-status');
        const j = r && r.ok ? await r.json() : null;
        return j && typeof j.status === 'string' ? j.status : null;
    } catch {
        return null;
    }
}

let _iniciado = false;

/** Arranca el vigía (una vez, solo en la app nativa). */
export function iniciarVigiaPlanListo() {
    if (_iniciado || !isNativeApp() || typeof document === 'undefined') return;
    _iniciado = true;
    let timer = null;
    let firmaAntes = null;
    let ocupado = false;

    const parar = () => {
        if (timer) clearInterval(timer);
        timer = null;
    };
    const avisar = async (tipo) => {
        parar();
        await cancelarAvisosLocales([ID_PLAN_RESPALDO]);
        if (document.visibilityState === 'visible') return;   // volvió justo ahora: lo ve en pantalla
        await programarAvisoLocal(tipo === 'listo'
            ? { id: ID_PLAN_LISTO, title: t('Tu plan está listo 🎉'), body: t('Toca para verlo.'),
                at: new Date(Date.now() + 1000), url: '/dashboard', kind: 'plan' }
            : { id: ID_PLAN_LISTO, title: t('No pudimos terminar tu plan'), body: t('Toca para intentarlo de nuevo.'),
                at: new Date(Date.now() + 1000), url: '/plan', kind: 'plan' });
    };
    const tick = async () => {
        if (ocupado) return;
        ocupado = true;
        try {
            if (document.visibilityState === 'visible') { parar(); return; }
            const estado = await _estadoDelServidor();
            const decision = decidir({
                estado, firmaAntes, firmaAhora: _firmaActual(), hayFlag: hasPendingPipelineInFlight(),
            });
            if (decision === 'listo' || decision === 'fallo') await avisar(decision);
            else if (decision === 'parar') { parar(); await cancelarAvisosLocales([ID_PLAN_RESPALDO]); }
        } finally {
            ocupado = false;
        }
    };
    const alSalir = async () => {
        if (timer || !hasPendingPipelineInFlight()) return;
        firmaAntes = _firmaActual();
        timer = setInterval(tick, INTERVALO_MS);
        const at = momentoDelRespaldo({ startedAt: readPendingFlag()?.started_at, p90s: await _p90() });
        if (timer) {
            await programarAvisoLocal({
                id: ID_PLAN_RESPALDO, title: t('Tu plan ya debería estar listo'), body: t('Ábrelo para verlo.'),
                at, url: '/dashboard', kind: 'plan',
            });
        }
    };
    const alVolver = () => {
        parar();
        cancelarAvisosLocales([ID_PLAN_RESPALDO]);
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') alSalir();
        else alVolver();
    });
}
