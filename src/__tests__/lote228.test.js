/**
 * [P1-PLAN-LOTE-228 · 2026-09-25] «Tu plan está listo» con la app en segundo plano.
 *
 * El dueño: «cuando se esté generando un plan en el móvil, quiero que se pueda salir de la app y que cuando termine
 * llegue una notificación, como la de hidratación o la de comer». La mitad nativa: el teléfono avisa con una
 * notificación LOCAL (sin FCM, el servidor no le llega). Se prueba el vigía con el plugin y el backend simulados.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const programados = [];
const cancelados = [];
const servidor = { status: 'generating', p90_s: 600 };
let permiso = 'granted';

vi.mock('../config/platform', () => ({
    isNativeApp: () => true,
    nativePluginAvailable: () => true,
    nativePlatform: () => 'android',
}));
vi.mock('../utils/avisosDeComida', () => ({
    permisoAvisosLocales: vi.fn(async ({ pedir } = {}) => (pedir && permiso === 'prompt' ? 'granted' : permiso)),
    programarAvisoLocal: vi.fn(async (n) => { programados.push(n); return true; }),
    cancelarAvisosLocales: vi.fn(async (ids) => { cancelados.push(...ids); }),
}));
vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(async (url) => {
        const json = (b) => ({ ok: true, json: async () => b });
        if (url === '/api/plans/generation-eta') return json({ p50_s: 400, p90_s: servidor.p90_s });
        if (url === '/api/plans/pending-status') return json({ status: servidor.status });
        return { ok: false, json: async () => ({}) };
    }),
}));

import {
    firmaDelPlan, momentoDelRespaldo, decidir, iniciarVigiaPlanListo, prepararAvisoPlanListo,
    ID_PLAN_LISTO, ID_PLAN_RESPALDO, INTERVALO_MS, RESPALDO_MINIMO_MS,
} from '../utils/avisoPlanListo';
import { permisoAvisosLocales } from '../utils/avisosDeComida';

const SRC = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

let visible = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visible });
const cambiarVisibilidad = async (v) => {
    visible = v;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
};

describe('[228] las reglas', () => {
    it('la firma del plan cambia cuando llega uno nuevo', () => {
        const a = firmaDelPlan(JSON.stringify({ id: 'p1', created_at: '2026-09-24', days: [1, 2] }));
        const b = firmaDelPlan({ id: 'p2', created_at: '2026-09-25', days: [1] });
        expect(a).not.toBe(b);
        expect(firmaDelPlan(null)).toBeNull();
        expect(firmaDelPlan('no es json')).toBeNull();
    });

    it('el respaldo sale al p90 desde el inicio, nunca antes de 3 minutos', () => {
        const ahora = Date.parse('2026-09-25T10:00:00Z');
        const inicio = '2026-09-25T09:58:00Z';
        expect(momentoDelRespaldo({ startedAt: inicio, p90s: 900, ahora }).getTime()).toBe(Date.parse(inicio) + 900000);
        expect(momentoDelRespaldo({ startedAt: '2026-09-25T09:00:00Z', p90s: 900, ahora }).getTime())
            .toBe(ahora + RESPALDO_MINIMO_MS);
        expect(momentoDelRespaldo({ startedAt: null, p90s: null, ahora }).getTime()).toBe(ahora + 15 * 60 * 1000);
    });

    it('terminó = el servidor dice complete O el plan guardado cambió (la página pudo recogerlo antes)', () => {
        expect(decidir({ estado: 'none', firmaAntes: 'a', firmaAhora: 'b', hayFlag: false })).toBe('listo');
        expect(decidir({ estado: 'complete', firmaAntes: 'a', firmaAhora: 'a', hayFlag: true })).toBe('listo');
        expect(decidir({ estado: 'failed', firmaAntes: 'a', firmaAhora: 'a', hayFlag: true })).toBe('fallo');
        expect(decidir({ estado: 'generating', firmaAntes: 'a', firmaAhora: 'a', hayFlag: true })).toBe('seguir');
        expect(decidir({ estado: 'none', firmaAntes: 'a', firmaAhora: 'a', hayFlag: true })).toBe('seguir');
        expect(decidir({ estado: 'none', firmaAntes: 'a', firmaAhora: 'a', hayFlag: false })).toBe('parar');
    });
});

describe('[228] el vigía en la app nativa', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
        vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));
        programados.length = 0;
        cancelados.length = 0;
        servidor.status = 'generating';
        window.localStorage.clear();
        window.localStorage.setItem('mealfit_plan', JSON.stringify({ id: 'viejo', created_at: '2026-09-01', days: [1] }));
        window.localStorage.setItem('mealfit_plan_in_progress',
            JSON.stringify({ user_id: 'u', started_at: '2026-09-25T09:59:00Z' }));
        visible = 'visible';
        iniciarVigiaPlanListo();   // una sola vez por proceso: los tests comparten el listener
    });
    afterEach(async () => {
        await cambiarVisibilidad('visible');
        vi.useRealTimers();
    });

    it('al salir programa el respaldo; al terminar lo cancela y avisa al momento', async () => {
        await cambiarVisibilidad('hidden');
        await vi.advanceTimersByTimeAsync(0);
        const respaldo = programados.find((n) => n.id === ID_PLAN_RESPALDO);
        expect(respaldo).toBeTruthy();
        expect(respaldo.at.getTime()).toBe(Date.parse('2026-09-25T09:59:00Z') + 600 * 1000);
        servidor.status = 'complete';
        await vi.advanceTimersByTimeAsync(INTERVALO_MS);
        expect(cancelados).toContain(ID_PLAN_RESPALDO);
        const listo = programados.find((n) => n.id === ID_PLAN_LISTO);
        expect(listo).toMatchObject({ title: 'Tu plan está listo 🎉', url: '/dashboard' });
    });

    it('si la página recogió el plan antes (ack), lo reconoce por el plan guardado', async () => {
        await cambiarVisibilidad('hidden');
        servidor.status = 'none';
        window.localStorage.removeItem('mealfit_plan_in_progress');
        window.localStorage.setItem('mealfit_plan', JSON.stringify({ id: 'nuevo', created_at: '2026-09-25', days: [1] }));
        await vi.advanceTimersByTimeAsync(INTERVALO_MS);
        expect(programados.find((n) => n.id === ID_PLAN_LISTO)?.title).toBe('Tu plan está listo 🎉');
    });

    it('si falla, lo dice y lleva a /plan', async () => {
        await cambiarVisibilidad('hidden');
        servidor.status = 'failed';
        await vi.advanceTimersByTimeAsync(INTERVALO_MS);
        expect(programados.find((n) => n.id === ID_PLAN_LISTO)).toMatchObject({ title: 'No pudimos terminar tu plan', url: '/plan' });
    });

    it('al volver a la app se cancela el respaldo y no avisa nada', async () => {
        await cambiarVisibilidad('hidden');
        await cambiarVisibilidad('visible');
        expect(cancelados).toContain(ID_PLAN_RESPALDO);
        servidor.status = 'complete';
        await vi.advanceTimersByTimeAsync(INTERVALO_MS * 2);
        expect(programados.find((n) => n.id === ID_PLAN_LISTO)).toBeUndefined();
    });

    it('sin generación en vuelo, salir no programa nada', async () => {
        window.localStorage.removeItem('mealfit_plan_in_progress');
        await cambiarVisibilidad('hidden');
        await vi.advanceTimersByTimeAsync(INTERVALO_MS);
        expect(programados).toHaveLength(0);
    });
});

describe('[228] cableado', () => {
    it('pide el permiso al empezar a generar', async () => {
        permiso = 'prompt';
        prepararAvisoPlanListo();
        expect(permisoAvisosLocales).toHaveBeenCalledWith({ pedir: true });
        permiso = 'granted';
        expect(SRC('pages/Plan.jsx')).toContain("import('../utils/avisoPlanListo').then((m) => m.prepararAvisoPlanListo())");
    });

    it('el vigía arranca en la app nativa y sus ids no los cancela la resincronización de comidas', async () => {
        expect(SRC('main.jsx')).toContain('m.iniciarVigiaPlanListo()');
        const real = await vi.importActual('../utils/avisosDeComida');
        expect(real.idsPropios()).not.toContain(ID_PLAN_LISTO);
        expect(real.idsPropios()).not.toContain(ID_PLAN_RESPALDO);
    });

    it('el service worker no repite el aviso si la app está a la vista', () => {
        const sw = SRC('custom-sw.js');
        expect(sw).toContain('if (data.solo_si_no_mira) {');
        expect(sw).toContain("ventanas.some((v) => v.visibilityState === 'visible')");
    });
});
