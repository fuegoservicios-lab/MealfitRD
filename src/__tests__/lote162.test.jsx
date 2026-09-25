// [P1-PLAN-LOTE-162 · 2026-09-22] Auditoría de la beta en modo contador — lo que se cierra por OTA.
//
// Seis revisiones antes de repartir la app a dos testers de Android (y el dueño en iPhone), verificadas contra el
// código. Aquí, lo que se arregla sin reinstalar nada:
//   · Android 14+: encender los avisos sacaba al tester a «Alarmas y recordatorios» tras cada comida, cada respuesta
//     del coach y cada vuelta a la app (el plugin programa EXACTO por defecto y, sin permiso, abre Ajustes él solo).
//   · Agua: con la app abierta desde anoche, el primer vaso de la mañana SOBRESCRIBÍA el total de ayer.
//   · Los dos interruptores de avisos mandaban el formulario entero y se pisaban entre sí.
//   · «Ver días anteriores» y el Historial vacío del contador; el escáner que decía «Descontamos 0 de tu Nevera».
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

// ── el doble del plugin: fiel al Proxy real (lo desconocido no contesta nunca) ─────────────────────────────────
const colgada = () => new Promise(() => {});
const programadas = [];
let respuestaExacta = { exact_alarm: 'denied' };
const metodos = {
    checkPermissions: async () => ({ display: 'granted' }),
    requestPermissions: async () => ({ display: 'granted' }),
    cancel: async () => {},
    schedule: async (o) => { programadas.push(...o.notifications); },
    addListener: async () => ({ remove: async () => {} }),
    checkExactNotificationSetting: async () => {
        if (respuestaExacta === 'colgada') return colgada();
        if (respuestaExacta instanceof Error) throw respuestaExacta;
        return respuestaExacta;
    },
};
vi.mock('@capacitor/local-notifications', () => ({
    LocalNotifications: new Proxy({}, { get: (_t, prop) => metodos[prop] || (() => colgada()) }),
}));
vi.mock('../config/platform', () => ({ isNativeApp: () => true, nativePluginAvailable: () => true }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import { fetchWithAuth } from '../config/api';
import { sincronizarAvisosLocales, alarmaExactaPendiente, CLAVE_AVISOS_LOCALES } from '../utils/avisosDeComida';
import { buildHealthProfilePayload, CLAVES_CON_CONTROL_PROPIO } from '../config/secureFormStorage';
import { pedirAbrirDiasAnteriores, consumirAbrirDiasAnteriores } from '../utils/diasAnteriores';
import WaterTracker from '../components/dashboard/WaterTracker';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const oColgado = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r('COLGADO'), 1500))]);

const recordatorios = {
    ok: true,
    json: async () => ({ enabled: true, reminders: [{ meal: 'cena', hour: 23, minute: 59, title: 'Bioboros', body: 'Es tu hora de cenar.' }] }),
};

describe('lote 162 · alarmas exactas en Android: la duda nunca abre Ajustes', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem(CLAVE_AVISOS_LOCALES, '1');
        programadas.length = 0;
        fetchWithAuth.mockReset();
        fetchWithAuth.mockImplementation(async () => recordatorios);
    });

    it('sin el permiso, programa INEXACTA (el plugin no abre «Alarmas y recordatorios»)', async () => {
        respuestaExacta = { exact_alarm: 'denied' };
        const r = await oColgado(sincronizarAvisosLocales());
        expect(r).not.toBe('COLGADO');
        expect(programadas.length).toBeGreaterThan(0);
        expect(programadas.every((n) => n.isExactNotification === false)).toBe(true);
        expect(await alarmaExactaPendiente()).toBe(true);
    });

    it('con el permiso dado, programa EXACTA', async () => {
        respuestaExacta = { exact_alarm: 'granted' };
        await sincronizarAvisosLocales();
        expect(programadas.length).toBeGreaterThan(0);
        expect(programadas.every((n) => n.isExactNotification === true)).toBe(true);
        expect(await alarmaExactaPendiente()).toBe(false);
    });

    it('si la consulta no contesta (o no existe, como en iOS), no se cuelga y programa inexacta', async () => {
        respuestaExacta = 'colgada';
        const r = await oColgado(sincronizarAvisosLocales());
        expect(r).not.toBe('COLGADO');
        expect(programadas.every((n) => n.isExactNotification === false)).toBe(true);
        respuestaExacta = new Error('unimplemented');
        programadas.length = 0;
        await sincronizarAvisosLocales();
        expect(programadas.every((n) => n.isExactNotification === false)).toBe(true);
        expect(await alarmaExactaPendiente()).toBe(false);   // «no se sabe» no es «falta»: no se ofrece nada en iOS
    });
});

describe('lote 162 · los interruptores de avisos no viajan en el formulario', () => {
    it('una preferencia con control propio no sale del formulario congelado, pero sí de un override explícito', () => {
        const formulario = { weight: 70, avisos_agua: false, avisos_comida: true, allergies: [] };
        const p = buildHealthProfilePayload(formulario, {}, null);
        for (const k of CLAVES_CON_CONTROL_PROPIO) expect(p).not.toHaveProperty(k);
        expect(p.weight).toBe(70);
        expect(buildHealthProfilePayload(formulario, { avisos_agua: true }, null).avisos_agua).toBe(true);
    });

    it('Configuración guarda SOLO su clave y espera la respuesta antes de decir que quedó', () => {
        const S = leer('src/pages/Settings.jsx');
        const i = S.indexOf('const cambiarPrefDeAviso');
        const cuerpo = S.slice(i, i + 1600);
        expect(cuerpo).toContain('body: JSON.stringify({ health_profile: { [clave]: valor } }),');
        expect(cuerpo).toContain('if (!res.ok) throw new Error');
        expect(cuerpo.indexOf('poner(!valor);')).toBeLessThan(cuerpo.indexOf("toast.success(valor ? t('Avisos activados.')"));
        expect(cuerpo).not.toContain('safeUpdateHealthProfile(');
    });
});

describe('lote 162 · agua: el primer vaso de la mañana no pisa el día de ayer', () => {
    const posts = () => fetchWithAuth.mock.calls
        .filter(([, o]) => o?.method === 'POST')
        .map(([, o]) => JSON.parse(o.body));
    const botonMas = () => screen.getByRole('button', { name: 'Agregar medio vaso' });

    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 8, 22, 23, 50, 0));
        fetchWithAuth.mockReset();
        fetchWithAuth.mockImplementation(async (_url, opts) => {
            if (opts?.method === 'POST') return { ok: true, status: 200, json: async () => ({ goal: 8 }) };
            return { ok: true, status: 200, json: async () => ({ glasses: 3, goal: 8, enabled: true, streak: 2 }) };
        });
    });
    afterEach(() => { vi.useRealTimers(); });

    it('al volver a la app al día siguiente, la fecha se pone al día ANTES del primer toque', async () => {
        render(<WaterTracker userId="u-1" />);
        await waitFor(() => expect(botonMas()).not.toBeDisabled());
        vi.setSystemTime(new Date(2026, 8, 23, 8, 0, 0));
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
        await waitFor(() => expect(botonMas()).not.toBeDisabled());
        await act(async () => { fireEvent.click(botonMas()); });
        await waitFor(() => expect(posts().length).toBe(1));
        expect(posts()[0].date).toBe('2026-09-23');
    });

    it('con la app abierta pasada la medianoche (antes del tic de 60 s), el toque NO se escribe en ayer', async () => {
        render(<WaterTracker userId="u-1" />);
        await waitFor(() => expect(botonMas()).not.toBeDisabled());
        vi.setSystemTime(new Date(2026, 8, 23, 0, 0, 30));
        await act(async () => { fireEvent.click(botonMas()); });
        expect(posts().some((b) => b.date === '2026-09-22')).toBe(false);
        await waitFor(() => expect(botonMas()).not.toBeDisabled());
        await act(async () => { fireEvent.click(botonMas()); });
        await waitFor(() => expect(posts().length).toBe(1));
        expect(posts()[0].date).toBe('2026-09-23');
    });
});

describe('lote 162 · «Ver mis días anteriores» desde el Historial del contador', () => {
    beforeEach(() => localStorage.clear());

    it('la marca abre el cajón UNA vez y solo si es reciente', () => {
        pedirAbrirDiasAnteriores(1_000_000);
        expect(consumirAbrirDiasAnteriores(1_005_000)).toBe(true);
        expect(consumirAbrirDiasAnteriores(1_005_100)).toBe(false);   // consumida
        pedirAbrirDiasAnteriores(1_000_000);
        expect(consumirAbrirDiasAnteriores(1_000_000 + 60_000)).toBe(false);   // vieja: no sorprende a nadie
    });

    it('el Historial vacío del contador lleva a los días anteriores; encender el plan es secundario', () => {
        const H = leer('src/pages/History.jsx');
        expect(H).toContain("onClick={enModoContador ? _verDiasAnteriores : _encenderElPlan}");
        expect(H).toContain("{enModoContador ? t('Ver mis días anteriores') : t('Crear mi primer plan')}");
        const T = leer('src/components/dashboard/TrackingProgress.jsx');
        expect(T).toContain('useEffect(() => { if (consumirAbrirDiasAnteriores()) setHistoryOpen(true); }, []);');
    });

    it('«Ver días anteriores» recalcula HOY al abrir (el cajón vive montado)', () => {
        const D = leer('src/components/dashboard/DiaryHistory.jsx');
        expect(D).toContain('const hoyISO = useMemo(() => aISO(new Date()), [open]);');
        expect(D).toContain('useEffect(() => { if (open) setSelected(aISO(new Date())); }, [open]);');
        expect(D).not.toContain('const hoyISO = useMemo(() => aISO(new Date()), []);');
    });
});

describe('lote 162 · lo demás que se veía mal', () => {
    it('la memoria del coach es de toda cuenta, no de Básico+', () => {
        const S = leer('src/pages/Settings.jsx');
        // el código ya no la consulta (el comentario que explica el cambio sí la nombra)
        expect(S).not.toMatch(/[{,]\s*isPremium\s*[,}]/);
        expect(S).not.toContain('!isPremium');
        expect(S).not.toContain('isPremium &&');
        expect(S).toContain('{!isGuest && ltmEnabled !== null && (');
        expect(S).not.toContain('El Cerebro IA está disponible a partir del plan');
    });

    it('el escáner solo habla de la Nevera si está en uso', () => {
        const M = leer('src/components/dashboard/ScanMealModal.jsx');
        expect(M).toContain('if (ausentes.length > 0 && (bajaron > 0 || neveraConCosas === true)) {');
        // [P1-PLAN-LOTE-224] la Nevera salió del título de la lista a un interruptor propio: con la Nevera vacía
        // (o apagada) no se pinta, y la lista se llama siempre por lo que es.
        expect(M).toContain('const mostrarNevera = _neveraOn && neveraConCosas !== false');
        expect(M).toContain("<h4 className={styles.componentsTitle}>{t('Ingredientes que detectamos')}</h4>");
    });

    it('Android no lee instrucciones de iPhone', () => {
        const S = leer('src/pages/Settings.jsx');
        expect(S).toContain("nativePlatform() === 'android' ? t('Permiso bloqueado en el teléfono.') : t('Permiso bloqueado en el iPhone.')");
    });

    it('un borrado de cuenta a medias no se anuncia como hecho', () => {
        const D = leer('src/components/account/DeleteAccountSection.jsx');
        expect(D).toContain('if (_resultado && _resultado.success === false) {');
    });

    it('en Android, cerrar la hoja de Google deja la salida del correo a la vista', () => {
        const L = leer('src/pages/Login.jsx');
        expect(L).toContain("toast(t('Si no pudiste entrar con Google, entra con tu correo: te mandamos un código de 6 dígitos.'), { duration: 6000 });");
    });

    it('el chat que abrió el aviso del coach tiene su propio rótulo', () => {
        const R = leer('src/components/agent/SidebarRecientes.jsx');
        expect(R).toContain("coach: t('Aviso del coach'),");
    });
});
