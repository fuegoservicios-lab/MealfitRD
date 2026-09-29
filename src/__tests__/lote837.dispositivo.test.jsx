/**
 * [P1-PLAN-LOTE-837 · 2026-09-29] Los ajustes DEL DISPOSITIVO (spec 2026-09-29, §13.3).
 *
 * El tema, el permiso de notificaciones del sistema, las alertas del dispositivo, el veto local de analítica, la barra
 * plegada, la unidad de altura, el avatar, la plataforma y la versión viven SOLO en el teléfono. La app los informa al
 * servidor con `PUT /api/profile/ajustes-dispositivo`, por una LISTA CERRADA de claves (lo demás no sale de aquí) y a lo
 * sumo una vez al día, salvo que cambie el tema o las alertas. Un componente sin pantalla lo hace en reposo:
 *
 *  - nunca bloquea ni lanza: un error de red se descarta en silencio y no se anota (se reintenta, pero sin martillar);
 *  - no manda NADA del perfil de salud (peso, edad, alergias…): esos datos no son un ajuste;
 *  - el registro del último envío es por cuenta: dos personas en el mismo teléfono no se tapan la una a la otra.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, act, cleanup } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
let ctx = {};
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => ctx }));
// La plataforma se puede fingir (el navegador de las pruebas es siempre «web»).
const plataforma = { nativa: false, nombre: 'web', plugin: true };
vi.mock('../config/platform', async (importOriginal) => ({
    ...(await importOriginal()),
    isNativeApp: () => plataforma.nativa,
    nativePlatform: () => plataforma.nombre,
    nativePluginAvailable: () => plataforma.nativa && plataforma.plugin,
}));
const notificacionesNativas = { display: 'prompt' };
vi.mock('@capacitor/local-notifications', () => ({
    LocalNotifications: { checkPermissions: vi.fn(async () => ({ display: notificacionesNativas.display })) },
}));

import { fetchWithAuth } from '../config/api';
import { APP_VERSION } from '../config/appVersion';
import ReporteAjustesDispositivo from '../components/dashboard/ReporteAjustesDispositivo';
import {
    CLAVE_ENVIADO_AT,
    CLAVE_ULTIMO,
    ENFRIAMIENTO_MS,
    ESPERA_CAMBIO_MS,
    ESPERA_INICIAL_MS,
    REENVIO_MS,
    REVISION_MS,
    RUTA_AJUSTES_DISPOSITIVO,
    hayQueEnviar,
    informarAjustesDelDispositivo,
    leerAjustesDelDispositivo,
    _reiniciarAjustesDelDispositivoParaTests,
} from '../utils/ajustesDelDispositivo';

const fuente = (ruta) => readFileSync(resolve(process.cwd(), ruta), 'utf8');
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const UID = 'aaaaaaaa-1111-2222-3333-444444444444';
const OTRA = 'bbbbbbbb-1111-2222-3333-444444444444';
const T0 = Date.parse('2026-09-29T15:00:00Z');

const CLAVES_DEL_CUERPO = ['plataforma', 'pwa', 'app_build', 'ajustes'];
const CLAVES_DE_AJUSTES = [
    'tema', 'notificaciones_permiso', 'alertas_activadas', 'analitica_vetada', 'barra_plegada', 'unidad_altura', 'avatar_elegido',
];
const cuerpoDe = (n = 0) => JSON.parse(fetchWithAuth.mock.calls[n][1].body);
const conAvisosEncendidos = () => {
    vi.stubGlobal('Notification', { permission: 'granted' });
    localStorage.setItem('mealfit_push_enabled', 'true');
};

let matchMediaOriginal;
beforeEach(() => {
    localStorage.clear();
    plataforma.nativa = false;
    plataforma.nombre = 'web';
    plataforma.plugin = true;
    notificacionesNativas.display = 'prompt';
    fetchWithAuth.mockReset();
    fetchWithAuth.mockResolvedValue(respuesta({ ok: true, guardado: true }));
    _reiniciarAjustesDelDispositivoParaTests();
    ctx = { session: { user: { id: UID } } };
    matchMediaOriginal = window.matchMedia;
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.matchMedia = matchMediaOriginal;
});

describe('[837] lo que se lee del dispositivo', () => {
    it('de fábrica: los valores por defecto de la app, y sin unidad de altura (nadie la eligió)', async () => {
        const r = await leerAjustesDelDispositivo();
        expect(r.plataforma).toBe('web');
        expect(r.pwa).toBe(false);
        expect(r.app_build.startsWith(APP_VERSION)).toBe(true);
        expect(r.ajustes).toEqual({
            tema: 'dark',                                 // `getStoredThemePref`: la app nace oscura
            notificaciones_permiso: 'unsupported',        // jsdom no tiene la API de notificaciones
            alertas_activadas: false,
            analitica_vetada: false,
            barra_plegada: false,
            avatar_elegido: false,
        });
        expect('unidad_altura' in r.ajustes).toBe(false);
    });

    it('con todo tocado: tema, permiso, alertas, veto de analítica, barra, unidad y avatar', async () => {
        localStorage.setItem('mealfit_theme', 'light');
        localStorage.setItem('mealfit_analytics_opt_out', '1');
        localStorage.setItem('mf_tabbar_plegada', '1');
        localStorage.setItem('mealfit_avatar', 'avatar-3');
        localStorage.setItem('mealfit_form', JSON.stringify({ _heightInputUnit: 'cm', weight: '80' }));
        conAvisosEncendidos();
        const r = await leerAjustesDelDispositivo();
        expect(r.ajustes).toEqual({
            tema: 'light',
            notificaciones_permiso: 'granted',
            alertas_activadas: true,
            analitica_vetada: true,
            barra_plegada: true,
            unidad_altura: 'cm',
            avatar_elegido: true,
        });
    });

    it('el permiso del sistema se lee tal cual: denied y default; las alertas exigen permiso Y interruptor', async () => {
        vi.stubGlobal('Notification', { permission: 'denied' });
        localStorage.setItem('mealfit_push_enabled', 'true');
        let r = await leerAjustesDelDispositivo();
        expect(r.ajustes.notificaciones_permiso).toBe('denied');
        expect(r.ajustes.alertas_activadas).toBe(false);   // el interruptor dice sí, pero el sistema no deja
        vi.stubGlobal('Notification', { permission: 'default' });
        r = await leerAjustesDelDispositivo();
        expect(r.ajustes.notificaciones_permiso).toBe('default');
    });

    it('una unidad de altura que no es cm/ft, o un formulario ilegible, no salen', async () => {
        localStorage.setItem('mealfit_form', JSON.stringify({ _heightInputUnit: 'metros' }));
        expect('unidad_altura' in (await leerAjustesDelDispositivo()).ajustes).toBe(false);
        localStorage.setItem('mealfit_form', '{esto no es json');
        expect('unidad_altura' in (await leerAjustesDelDispositivo()).ajustes).toBe(false);
        localStorage.setItem('mealfit_form', JSON.stringify({ _heightInputUnit: 'ft' }));
        expect((await leerAjustesDelDispositivo()).ajustes.unidad_altura).toBe('ft');
    });

    it('instalada como PWA se dice; en el navegador, no', async () => {
        window.matchMedia = vi.fn((q) => ({ matches: q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {} }));
        expect((await leerAjustesDelDispositivo()).pwa).toBe(true);
        window.matchMedia = vi.fn((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
        expect((await leerAjustesDelDispositivo()).pwa).toBe(false);
    });

    it('app nativa: la plataforma es la del binario, no es PWA, y el permiso lo da el plugin (no `Notification`)', async () => {
        plataforma.nativa = true;
        plataforma.nombre = 'android';
        notificacionesNativas.display = 'denied';
        localStorage.setItem('mealfit_avisos_locales', '1');
        let r = await leerAjustesDelDispositivo();
        expect(r.plataforma).toBe('android');
        expect(r.pwa).toBe(false);
        expect(r.ajustes.notificaciones_permiso).toBe('denied');
        expect(r.ajustes.alertas_activadas).toBe(true);    // el interruptor de la persona; el permiso es otra cosa
        notificacionesNativas.display = 'granted';
        expect((await leerAjustesDelDispositivo()).ajustes.notificaciones_permiso).toBe('granted');
        notificacionesNativas.display = 'prompt-with-rationale';
        expect((await leerAjustesDelDispositivo()).ajustes.notificaciones_permiso).toBe('default');
        // apagó las alertas (marca de la push nativa): no cuentan aunque el interruptor local siga en '1'
        localStorage.setItem('mealfit_fcm_apagada', JSON.stringify({ user: null, pendiente: false }));
        r = await leerAjustesDelDispositivo();
        expect(r.ajustes.alertas_activadas).toBe(false);
    });

    it('app nativa sin el plugin (binario viejo): el permiso sale como no soportado', async () => {
        plataforma.nativa = true;
        plataforma.nombre = 'ios';
        plataforma.plugin = false;
        const r = await leerAjustesDelDispositivo();
        expect(r.plataforma).toBe('ios');
        expect(r.ajustes.notificaciones_permiso).toBe('unsupported');
    });
});

describe('[837] cuándo se envía (decisión pura)', () => {
    const base = { ahora: T0, enviadoAt: T0 - 1000, ultimo: { uid: UID, tema: 'dark', alertas: false }, uid: UID, tema: 'dark', alertas: false };

    it('nunca enviado, o el registro es ilegible: sí', () => {
        expect(hayQueEnviar({ ...base, enviadoAt: null, ultimo: null })).toBe(true);
        expect(hayQueEnviar({ ...base, enviadoAt: NaN })).toBe(true);
        expect(hayQueEnviar({ ...base, ultimo: null })).toBe(true);
    });

    it('hace menos de 24 h y nada cambió: no', () => {
        expect(hayQueEnviar(base)).toBe(false);
        expect(hayQueEnviar({ ...base, enviadoAt: T0 - REENVIO_MS + 1 })).toBe(false);
    });

    it('a las 24 h, sí', () => {
        expect(hayQueEnviar({ ...base, enviadoAt: T0 - REENVIO_MS })).toBe(true);
        expect(hayQueEnviar({ ...base, enviadoAt: T0 - 3 * REENVIO_MS })).toBe(true);
    });

    it('cambió el tema o las alertas: sí, aunque sea reciente', () => {
        expect(hayQueEnviar({ ...base, tema: 'light' })).toBe(true);
        expect(hayQueEnviar({ ...base, alertas: true })).toBe(true);
    });

    it('otra cuenta en el mismo teléfono: sí', () => {
        expect(hayQueEnviar({ ...base, uid: OTRA })).toBe(true);
    });

    it('un envío «en el futuro» (el reloj se movió) no bloquea para siempre', () => {
        expect(hayQueEnviar({ ...base, enviadoAt: T0 + 10 * 60 * 1000 })).toBe(true);
    });
});

describe('[837] el envío (nunca bloquea ni lanza)', () => {
    it('manda SOLO las claves del contrato, por PUT, y anota el envío', async () => {
        localStorage.setItem('mealfit_form', JSON.stringify({
            _heightInputUnit: 'cm', weight: '80', age: '34', allergies: ['Maní'], medicalConditions: ['Diabetes tipo 2'],
        }));
        localStorage.setItem('mealfit_avatar', 'avatar-3');
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 })).toBe('enviado');
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        const [url, opts] = fetchWithAuth.mock.calls[0];
        expect(url).toBe('/api/profile/ajustes-dispositivo');
        expect(url).toBe(RUTA_AJUSTES_DISPOSITIVO);
        expect(opts.method).toBe('PUT');
        expect(opts.headers['Content-Type']).toBe('application/json');
        const cuerpo = cuerpoDe();
        expect(Object.keys(cuerpo).every((k) => CLAVES_DEL_CUERPO.includes(k))).toBe(true);
        expect(Object.keys(cuerpo.ajustes).every((k) => CLAVES_DE_AJUSTES.includes(k))).toBe(true);
        expect(cuerpo).toMatchObject({ plataforma: 'web', pwa: false, ajustes: { unidad_altura: 'cm', avatar_elegido: true } });
        // el perfil de salud NO es un ajuste, ni el id del avatar: solo si eligió uno
        const crudo = fetchWithAuth.mock.calls[0][1].body;
        for (const dato of ['80', '34', 'Maní', 'Diabetes', 'avatar-3', UID]) expect(crudo).not.toContain(dato);
        expect(localStorage.getItem(CLAVE_ENVIADO_AT)).toBe(String(T0));
        expect(JSON.parse(localStorage.getItem(CLAVE_ULTIMO))).toEqual({ uid: UID, tema: 'dark', alertas: false });
    });

    it('los valores son de las listas cerradas: enumerados cortos y booleanos', async () => {
        conAvisosEncendidos();
        localStorage.setItem('mealfit_theme', 'system');
        await informarAjustesDelDispositivo({ uid: UID, ahora: T0 });
        const { ajustes, plataforma: p, pwa } = cuerpoDe();
        expect(['system', 'light', 'dark']).toContain(ajustes.tema);
        expect(['granted', 'denied', 'default', 'unsupported']).toContain(ajustes.notificaciones_permiso);
        for (const k of ['alertas_activadas', 'analitica_vetada', 'barra_plegada', 'avatar_elegido']) {
            expect(typeof ajustes[k]).toBe('boolean');
        }
        expect(['web', 'ios', 'android']).toContain(p);
        expect(typeof pwa).toBe('boolean');
        expect(cuerpoDe().app_build.length).toBeLessThanOrEqual(64);
    });

    it('no envía dos veces en 24 h', async () => {
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 })).toBe('enviado');
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 + 60 * 1000 })).toBe('reciente');
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 + REENVIO_MS - 1 })).toBe('reciente');
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    });

    it('sí a las 24 h', async () => {
        await informarAjustesDelDispositivo({ uid: UID, ahora: T0 });
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 + REENVIO_MS })).toBe('enviado');
        expect(fetchWithAuth).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem(CLAVE_ENVIADO_AT)).toBe(String(T0 + REENVIO_MS));
    });

    it('sí al cambiar el tema', async () => {
        await informarAjustesDelDispositivo({ uid: UID, ahora: T0 });
        localStorage.setItem('mealfit_theme', 'light');
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 + 5000 })).toBe('enviado');
        expect(fetchWithAuth).toHaveBeenCalledTimes(2);
        expect(cuerpoDe(1).ajustes.tema).toBe('light');
        // y lo nuevo queda como referencia: volver a mirar no repite
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 + 10000 })).toBe('reciente');
        expect(fetchWithAuth).toHaveBeenCalledTimes(2);
    });

    it('sí al cambiar las alertas (encender y apagar)', async () => {
        await informarAjustesDelDispositivo({ uid: UID, ahora: T0 });
        conAvisosEncendidos();
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 + 5000 })).toBe('enviado');
        expect(cuerpoDe(1).ajustes.alertas_activadas).toBe(true);
        localStorage.setItem('mealfit_push_enabled', 'false');
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 + 10000 })).toBe('enviado');
        expect(cuerpoDe(2).ajustes.alertas_activadas).toBe(false);
    });

    it('otra cuenta en el mismo teléfono: se informa aunque el envío del otro sea de hace un minuto', async () => {
        await informarAjustesDelDispositivo({ uid: UID, ahora: T0 });
        expect(await informarAjustesDelDispositivo({ uid: OTRA, ahora: T0 + 60 * 1000 })).toBe('enviado');
        expect(JSON.parse(localStorage.getItem(CLAVE_ULTIMO)).uid).toBe(OTRA);
    });

    it('sin cuenta no hay nada que informar', async () => {
        expect(await informarAjustesDelDispositivo({ uid: null, ahora: T0 })).toBe('sin_sesion');
        expect(await informarAjustesDelDispositivo({ ahora: T0 })).toBe('sin_sesion');
        expect(fetchWithAuth).not.toHaveBeenCalled();
    });

    it('un error de red se descarta en silencio: no lanza, no se anota, y no martillea (enfriamiento)', async () => {
        fetchWithAuth.mockRejectedValue(new Error('sin red'));
        await expect(informarAjustesDelDispositivo({ uid: UID, ahora: T0 })).resolves.toBe('fallo');
        expect(localStorage.getItem(CLAVE_ENVIADO_AT)).toBeNull();
        expect(localStorage.getItem(CLAVE_ULTIMO)).toBeNull();
        // dentro del enfriamiento no vuelve a intentarlo
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 + ENFRIAMIENTO_MS - 1 })).toBe('enfriando');
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        // pasado el enfriamiento, reintenta y, si esta vez sale bien, lo anota
        fetchWithAuth.mockResolvedValue(respuesta({ ok: true, guardado: true }));
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 + ENFRIAMIENTO_MS })).toBe('enviado');
        expect(fetchWithAuth).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem(CLAVE_ENVIADO_AT)).toBe(String(T0 + ENFRIAMIENTO_MS));
    });

    it('una respuesta que no es 2xx (429, 500, 401…) tampoco se anota', async () => {
        for (const status of [401, 404, 429, 500]) {
            _reiniciarAjustesDelDispositivoParaTests();
            fetchWithAuth.mockResolvedValueOnce(respuesta({ detail: 'x' }, false, status));
            expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 })).toBe('fallo');
            expect(localStorage.getItem(CLAVE_ENVIADO_AT)).toBeNull();
        }
    });

    it('un fetchWithAuth que no devuelve una respuesta (un doble, un abort) no lanza', async () => {
        fetchWithAuth.mockResolvedValueOnce(undefined);
        await expect(informarAjustesDelDispositivo({ uid: UID, ahora: T0 })).resolves.toBe('fallo');
    });

    it('con el interruptor del servidor apagado (`guardado: false`) sí se anota: una vez al día, sin martillar', async () => {
        fetchWithAuth.mockResolvedValue(respuesta({ ok: true, guardado: false }));
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 })).toBe('enviado');
        expect(await informarAjustesDelDispositivo({ uid: UID, ahora: T0 + 60 * 1000 })).toBe('reciente');
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    });

    it('dos llamadas a la vez comparten una sola petición', async () => {
        let soltar;
        fetchWithAuth.mockReturnValueOnce(new Promise((r) => { soltar = r; }));
        const a = informarAjustesDelDispositivo({ uid: UID, ahora: T0 });
        const b = informarAjustesDelDispositivo({ uid: UID, ahora: T0 });
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        soltar(respuesta({ ok: true, guardado: true }));
        expect(await a).toBe('enviado');
        expect(await b).toBe('enviado');
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    });
});

describe('[837] el componente sin pantalla', () => {
    const pasar = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
    });

    it('no pinta nada', async () => {
        const { container } = render(<ReporteAjustesDispositivo />);
        await pasar(ESPERA_INICIAL_MS + 100);
        expect(container.innerHTML).toBe('');
    });

    it('sin cuenta no sale nada (ni petición ni temporizadores que vigilar)', async () => {
        ctx = { session: null, userProfile: null };
        render(<ReporteAjustesDispositivo />);
        await pasar(ESPERA_INICIAL_MS + REVISION_MS);
        expect(fetchWithAuth).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('informa tras el primer idle, no antes', async () => {
        render(<ReporteAjustesDispositivo />);
        await pasar(ESPERA_INICIAL_MS - 100);
        expect(fetchWithAuth).not.toHaveBeenCalled();
        await pasar(200);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        expect(fetchWithAuth.mock.calls[0][0]).toBe('/api/profile/ajustes-dispositivo');
        expect(cuerpoDe().plataforma).toBe('web');
    });

    it('usa requestIdleCallback cuando existe (Safari y WKWebView no lo tienen: setTimeout)', async () => {
        const idle = vi.fn((fn) => { fn(); return 7; });
        vi.stubGlobal('requestIdleCallback', idle);
        window.requestIdleCallback = idle;
        render(<ReporteAjustesDispositivo />);
        await pasar(0);
        expect(idle).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        delete window.requestIdleCallback;
    });

    it('al desmontarse antes del idle no manda nada (y no deja temporizadores)', async () => {
        const { unmount } = render(<ReporteAjustesDispositivo />);
        unmount();
        await pasar(ESPERA_INICIAL_MS + REVISION_MS + 1000);
        expect(fetchWithAuth).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('no envía dos veces en 24 h aunque la app se monte otra vez', async () => {
        const a = render(<ReporteAjustesDispositivo />);
        await pasar(ESPERA_INICIAL_MS + 100);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        a.unmount();
        render(<ReporteAjustesDispositivo />);
        await pasar(ESPERA_INICIAL_MS + REVISION_MS + 1000);
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    });

    it('sí al cambiar el tema: el aviso del cambio de tema lo dispara, con un respiro para juntar ráfagas', async () => {
        render(<ReporteAjustesDispositivo />);
        await pasar(ESPERA_INICIAL_MS + 100);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        localStorage.setItem('mealfit_theme', 'light');
        window.dispatchEvent(new Event('mealfit-theme-change'));
        window.dispatchEvent(new Event('mealfit-theme-change'));   // una ráfaga: una sola petición
        await pasar(ESPERA_CAMBIO_MS - 100);
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        await pasar(200);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(2));
        expect(cuerpoDe(1).ajustes.tema).toBe('light');
    });

    it('sí al cambiar el tema en OTRA pestaña (evento storage)', async () => {
        render(<ReporteAjustesDispositivo />);
        await pasar(ESPERA_INICIAL_MS + 100);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        localStorage.setItem('mealfit_theme', 'light');
        window.dispatchEvent(new StorageEvent('storage', { key: 'mealfit_theme', newValue: 'light' }));
        await pasar(ESPERA_CAMBIO_MS + 100);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(2));
    });

    it('una clave que no vigila no dispara nada: ni petición ni siquiera un temporizador nuevo', async () => {
        render(<ReporteAjustesDispositivo />);
        await pasar(ESPERA_INICIAL_MS + 100);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        const antes = vi.getTimerCount();
        window.dispatchEvent(new StorageEvent('storage', { key: 'mealfit_plan', newValue: '{}' }));
        expect(vi.getTimerCount()).toBe(antes);          // el filtro es lo que evita la mirada, no solo la decisión de después
        window.dispatchEvent(new StorageEvent('storage', { key: 'mealfit_theme', newValue: 'light' }));
        expect(vi.getTimerCount()).toBe(antes + 1);      // una clave vigilada sí programa su mirada
        await pasar(ESPERA_CAMBIO_MS + 100);
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);  // …y como nada cambió de verdad, no sale ninguna petición
    });

    it('las alertas que se encienden en esta misma pestaña las recoge la revisión periódica', async () => {
        render(<ReporteAjustesDispositivo />);
        await pasar(ESPERA_INICIAL_MS + 100);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        conAvisosEncendidos();      // Configuración las enciende: no hay evento de storage en la misma pestaña
        await pasar(REVISION_MS + 100);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(2));
        expect(cuerpoDe(1).ajustes.alertas_activadas).toBe(true);
    });

    it('al volver a la app (visibilitychange) también mira', async () => {
        render(<ReporteAjustesDispositivo />);
        await pasar(ESPERA_INICIAL_MS + 100);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        conAvisosEncendidos();
        document.dispatchEvent(new Event('visibilitychange'));
        await pasar(ESPERA_CAMBIO_MS + 100);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(2));
    });

    it('un error de red no rompe nada: el componente sigue sin pintar y el envío no se anota (una promesa rechazada haría fallar la corrida)', async () => {
        fetchWithAuth.mockRejectedValue(new Error('sin red'));
        const { container } = render(<ReporteAjustesDispositivo />);
        await pasar(ESPERA_INICIAL_MS + 100);
        await vi.waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
        await pasar(50);
        expect(container.innerHTML).toBe('');
        expect(localStorage.getItem(CLAVE_ENVIADO_AT)).toBeNull();
    });
});

describe('[837] el montaje (anclas del código)', () => {
    it('el reporte no pinta (devuelve null) y sale solo del módulo de utilidades', () => {
        const componente = fuente('src/components/dashboard/ReporteAjustesDispositivo.jsx');
        expect(componente).toContain('return null;');
        expect(componente).toContain("from '../../utils/ajustesDelDispositivo'");
        expect(componente).not.toContain('fetchWithAuth');   // nada de red en el componente: vive en la utilidad
    });

    it('la utilidad habla con el servidor por fetchWithAuth y lee del almacenamiento con el helper defensivo', () => {
        const util = fuente('src/utils/ajustesDelDispositivo.js');
        expect(util).toContain("import { fetchWithAuth } from '../config/api';");
        expect(util).toContain('safeLocalStorageGet');
        expect(util).toContain('safeLocalStorageSet');
        expect(util).not.toMatch(/localStorage\.(get|set|remove)Item/);
    });
});
