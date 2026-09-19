// [P1-PLAN-LOTE-119 · 2026-09-19] Dos quejas del dueño sobre la barra de pestañas del teléfono:
//  · el asa de plegar «se ve bien pero si se pudiera notar más que eso se puede presionar» → lengüeta con flecha que
//    sobresale de la barra, en el color de acento, y que las primeras veces se mece para presentarse;
//  · «con el generador encendido esto se ve con demasiados apartados» → la barra lleva como mucho 5: el Historial pasa
//    al menú ☰ de la cabecera. En modo contador (4) nadie se mueve.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import BottomTabBar from '../components/dashboard/BottomTabBar';
import { navItemsFor, repartoTelefono, TAB_BAR_MAX } from '../config/dashboardNav';
import { debePresentarse, CLAVE_ASA_USADA, CLAVE_ASA_PISTAS, PISTAS_MAX } from '../hooks/useTabBarPlegable';

const perfil = { plan_mode: 'plan' };
vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({ isGuest: false, userProfile: perfil, planData: null }),
}));
vi.mock('../utils/routePreload', () => ({ prefetchRoute: vi.fn() }));
vi.mock('../utils/historyCaches', () => ({ prefetchHistoryList: vi.fn() }));

const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');
const pintar = () => render(<MemoryRouter initialEntries={['/dashboard']}><BottomTabBar /></MemoryRouter>);
const pestanas = () => [...document.querySelectorAll('nav button[aria-label]')]
    .map((b) => b.getAttribute('aria-label'))
    .filter((l) => !l.includes('barra de navegación'));

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-tabbar-plegada');
    perfil.plan_mode = 'plan';
});

describe('repartoTelefono', () => {
    it('con el generador encendido son 6: la barra se queda con 5 y el Historial va al menú', () => {
        const { barra, menu } = repartoTelefono(navItemsFor({ trackingMode: false }));
        expect(barra.map((i) => i.key)).toEqual(['plan', 'progress', 'agent', 'pantry', 'recipes']);
        expect(menu.map((i) => i.key)).toEqual(['history']);
        expect(barra.length).toBeLessThanOrEqual(TAB_BAR_MAX);
    });
    it('en modo contador caben las 4: nadie sale de la barra', () => {
        const { barra, menu } = repartoTelefono(navItemsFor({ trackingMode: true }));
        expect(barra.map((i) => i.key)).toEqual(['plan', 'agent', 'pantry', 'history']);
        expect(menu).toEqual([]);
    });
    it('nada se pierde: barra + menú son la nav entera', () => {
        for (const trackingMode of [true, false]) {
            const todas = navItemsFor({ trackingMode });
            const { barra, menu } = repartoTelefono(todas);
            expect([...barra, ...menu].map((i) => i.key).sort()).toEqual(todas.map((i) => i.key).sort());
        }
    });
});

describe('la barra', () => {
    it('modo plan: 5 pestañas, sin Historial', () => {
        pintar();
        expect(pestanas()).toEqual(['Plan', 'Progreso', 'Agente', 'Nevera', 'Recetas']);
    });
    it('modo contador: conserva el Historial', () => {
        perfil.plan_mode = 'tracking';
        pintar();
        expect(pestanas()).toEqual(['Progreso', 'Agente', 'Nevera', 'Historial']);
    });
    it('el menú ☰ recibe lo que la barra suelta, del mismo SSOT', () => {
        const layout = leer('components/dashboard/DashboardLayout.jsx');
        expect(layout).toContain('const menuTelefono = repartoTelefono(menuItems).menu;');
        expect(layout).toContain('{menuTelefono.map((item) => {');
        expect(leer('components/dashboard/BottomTabBar.jsx'))
            .toContain('repartoTelefono(navItemsFor({ trackingMode: isTrackingMode(userProfile, planData) })).barra');
    });
});

describe('el asa se nota', () => {
    it('es una lengüeta con flecha que SOBRESALE de la barra, en el color de acento', () => {
        pintar();
        const asa = screen.getByRole('button', { name: 'Ocultar la barra de navegación', hidden: true });
        expect(asa.querySelector('svg')).toBeTruthy();
        const css = leer('components/dashboard/BottomTabBar.module.css');
        const regla = css.slice(css.indexOf('    .asa {'), css.indexOf('}', css.indexOf('    .asa {')));
        expect(regla).toMatch(/top:\s*-17px;/);
        const lengua = css.slice(css.indexOf('    .asaLengua {'), css.indexOf('}', css.indexOf('    .asaLengua {')));
        expect(lengua).toMatch(/color:\s*#4F46E5;/);
        expect(lengua).toMatch(/border-bottom:\s*0;/);
        expect(css).toContain('.tabBar.plegada .asaFlecha {');
        expect(css).not.toContain('asaPildora');
    });

    it('debePresentarse: hasta que se usa, y como mucho PISTAS_MAX veces', () => {
        expect(debePresentarse({ usada: null, vistas: '0' })).toBe(true);
        expect(debePresentarse({ usada: null, vistas: String(PISTAS_MAX - 1) })).toBe(true);
        expect(debePresentarse({ usada: null, vistas: String(PISTAS_MAX) })).toBe(false);
        expect(debePresentarse({ usada: '1', vistas: '0' })).toBe(false);
        expect(debePresentarse({ usada: null, vistas: 'basura' })).toBe(true);
    });

    it('la pista cuenta cada aparición y calla para siempre en cuanto el asa se usa', () => {
        const { unmount } = pintar();
        const asa = () => document.querySelector('nav button[aria-expanded]');
        expect(asa().className).toMatch(/asaPista/);
        expect(localStorage.getItem(CLAVE_ASA_PISTAS)).toBe('1');
        fireEvent.click(asa());
        expect(localStorage.getItem(CLAVE_ASA_USADA)).toBe('1');
        expect(asa().className).not.toMatch(/asaPista/);
        fireEvent.click(asa()); // la devuelve
        unmount();
        pintar();
        expect(asa().className).not.toMatch(/asaPista/);
    });

    it('sin tocarla nunca, a la sexta aparición ya no se mece', () => {
        localStorage.setItem(CLAVE_ASA_PISTAS, String(PISTAS_MAX));
        pintar();
        expect(document.querySelector('nav button[aria-expanded]').className).not.toMatch(/asaPista/);
    });

    it('el aviso «sin conexión» deja sitio a la lengüeta', () => {
        expect(leer('index.css')).toContain('+ 88px - var(--tabbar-recupera, 0px));');
    });
});
