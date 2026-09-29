/**
 * [P1-PLAN-LOTE-900 · 2026-09-29] Lo que el coach cambia de la app, aplicado a la pantalla.
 * «Activa la hidratación» acababa en un vaso anotado; ahora el servidor enciende la tarjeta y el `done` del chat trae
 * `ajustes_de_app`, que `aplicarAjustesDelCoach` convierte en lo que haría el interruptor de Configuración.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const temaMock = vi.hoisted(() => ({ aplicado: [] }));
vi.mock('../utils/theme', () => ({ applyThemePref: (v) => temaMock.aplicado.push(v) }));

import { aplicarAjustesDelCoach, rutaDePantalla } from '../utils/ajustesDelCoach';

const deps = () => ({
    navigate: vi.fn(),
    ubicacion: { pathname: '/dashboard' },
    setLocale: vi.fn(async () => true),
    guardarIdioma: vi.fn(async () => ({ ok: true })),
    updateData: vi.fn(),
    refrescarPerfil: vi.fn(async () => {}),
    restaurarPlan: vi.fn(),
    sincronizarAvisos: vi.fn(async () => {}),
    pedirFormulario: vi.fn(),
    modoContador: true,
});

beforeEach(() => { localStorage.clear(); temaMock.aplicado = []; });

describe('aplicarAjustesDelCoach', () => {
    it('hidratación: el espejo local y el aviso `storage` que escucha la tarjeta del panel', () => {
        const eventos = [];
        const oir = (e) => eventos.push(e.type === 'storage' ? `${e.key}=${e.newValue}` : e.type);
        window.addEventListener('storage', oir);
        window.addEventListener('mealfit:refresh-hydration', oir);
        aplicarAjustesDelCoach({ hidratacion: true }, deps());
        window.removeEventListener('storage', oir);
        window.removeEventListener('mealfit:refresh-hydration', oir);
        expect(localStorage.getItem('mealfit_water_tracker_enabled')).toBe('true');
        expect(eventos).toEqual(['mealfit_water_tracker_enabled=true', 'mealfit:refresh-hydration']);
    });

    it('nevera: espejo + perfil refrescado (la pestaña sale del perfil)', () => {
        const d = deps();
        aplicarAjustesDelCoach({ nevera: false }, d);
        expect(localStorage.getItem('mealfit_nevera_activa')).toBe('false');
        expect(d.refrescarPerfil).toHaveBeenCalledTimes(1);
    });

    it('generador: espejo, appMode, perfil y el plan adoptado entero SIN recargar (cortaría el modo voz)', () => {
        const d = deps();
        aplicarAjustesDelCoach({ generador_de_planes: 'tracking', tenia_plan: true }, d);
        expect(localStorage.getItem('mealfit_plan_mode')).toBe('tracking');
        expect(d.updateData).toHaveBeenCalledWith('appMode', 'tracking');
        expect(d.restaurarPlan).toHaveBeenCalled();
        expect(d.refrescarPerfil).toHaveBeenCalledTimes(1);
        const d2 = deps();
        aplicarAjustesDelCoach({ generador_de_planes: 'plan', tenia_plan: false }, d2);
        expect(d2.restaurarPlan).not.toHaveBeenCalled();
    });

    it('recordatorios: el formulario en memoria y el teléfono reprograma', () => {
        const d = deps();
        aplicarAjustesDelCoach({ avisos_agua: true }, d);
        expect(d.updateData).toHaveBeenCalledWith('avisos_agua', true);
        expect(d.sincronizarAvisos).toHaveBeenCalled();
    });

    it('tema: se guarda y se aplica al instante', () => {
        aplicarAjustesDelCoach({ tema: 'dark' }, deps());
        expect(localStorage.getItem('mealfit_theme')).toBe('dark');
        expect(temaMock.aplicado).toEqual(['dark']);
        aplicarAjustesDelCoach({ tema: 'morado' }, deps());
        expect(temaMock.aplicado).toEqual(['dark']);
    });

    it('idioma: el catálogo primero y SOLO si cargó, el perfil', async () => {
        const d = deps();
        aplicarAjustesDelCoach({ idioma: 'en-US' }, d);
        await Promise.resolve(); await Promise.resolve();
        expect(d.setLocale).toHaveBeenCalledWith('en-US');
        expect(d.guardarIdioma).toHaveBeenCalledWith('en-US');
        const d2 = { ...deps(), setLocale: vi.fn(async () => false) };
        aplicarAjustesDelCoach({ idioma: 'fr-FR' }, d2);
        await Promise.resolve(); await Promise.resolve();
        expect(d2.guardarIdioma).not.toHaveBeenCalled();
    });

    it('pantallas: la ruta según el modo; Configuración como ventana y en su sección', () => {
        const d = deps();
        aplicarAjustesDelCoach({ pantalla: 'nevera' }, d);
        expect(d.navigate).toHaveBeenLastCalledWith('/dashboard/pantry');
        aplicarAjustesDelCoach({ pantalla: 'configuracion', seccion: 'health' }, d);
        expect(d.navigate).toHaveBeenLastCalledWith('/dashboard/settings#health', { state: { backgroundLocation: d.ubicacion } });
        expect(rutaDePantalla('progreso', { modoContador: true })).toBe('/dashboard');
        expect(rutaDePantalla('progreso', { modoContador: false })).toBe('/dashboard/progress');
        expect(rutaDePantalla('marte')).toBeNull();
    });

    it('encender los planes sin plan: el formulario (misma puerta que Configuración)', () => {
        const d = deps();
        aplicarAjustesDelCoach({ pantalla: 'formulario' }, d);
        expect(d.pedirFormulario).toHaveBeenCalled();
        expect(d.updateData).toHaveBeenCalledWith('appMode', 'plan');
        expect(d.navigate).toHaveBeenCalledWith('/assessment');
    });

    it('un paso que falla no tumba los demás; sin ajustes, nada', () => {
        const d = { ...deps(), refrescarPerfil: vi.fn(() => { throw new Error('red'); }) };
        expect(() => aplicarAjustesDelCoach({ nevera: true, pantalla: 'historial' }, d)).not.toThrow();
        expect(d.navigate).toHaveBeenCalledWith('/history');
        expect(() => aplicarAjustesDelCoach(null, d)).not.toThrow();
    });
});

describe('cableado en AgentPage', () => {
    it('el done del chat aplica `ajustes_de_app`', () => {
        const src = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        expect(src).toContain("if (dataObj.ajustes_de_app && typeof dataObj.ajustes_de_app === 'object') {");
        expect(src).toContain('aplicarAjustesDelCoach(dataObj.ajustes_de_app, {');
        expect(src).toContain('refrescarPerfil: refreshProfileAndPlan,');
    });
});
