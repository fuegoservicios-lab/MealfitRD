// [P1-PLAN-LOTE-118 · 2026-09-19] La barra de pestañas se puede plegar: deslizándola hacia abajo o tocando el asa.
// Plegada deja una franja con el asa (la navegación nunca queda sin puerta), se recuerda en el dispositivo y DEVUELVE
// su espacio a todo lo que lo reservaba.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import BottomTabBar from '../components/dashboard/BottomTabBar';
import { decidirAlSoltar, CLAVE_TABBAR_PLEGADA } from '../hooks/useTabBarPlegable';

vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({ isGuest: false, userProfile: { plan_mode: 'tracking' }, planData: null }),
}));
vi.mock('../utils/routePreload', () => ({ prefetchRoute: vi.fn() }));
vi.mock('../utils/historyCaches', () => ({ prefetchHistoryList: vi.fn() }));

const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');
const pintar = () => render(<MemoryRouter initialEntries={['/dashboard']}><BottomTabBar /></MemoryRouter>);

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-tabbar-plegada');
});

describe('decidirAlSoltar', () => {
    it('abierta: se pliega con recorrido o con un golpe rápido hacia abajo; un roce no', () => {
        expect(decidirAlSoltar({ plegada: false, dy: 40 })).toBe('plegar');
        expect(decidirAlSoltar({ plegada: false, dy: 10, vy: 0.6 })).toBe('plegar');
        expect(decidirAlSoltar({ plegada: false, dy: 12, vy: 0.1 })).toBe('quedarse');
        expect(decidirAlSoltar({ plegada: false, dy: -60 })).toBe('quedarse');
    });
    it('plegada: vuelve deslizando hacia ARRIBA', () => {
        expect(decidirAlSoltar({ plegada: true, dy: -40 })).toBe('desplegar');
        expect(decidirAlSoltar({ plegada: true, dy: -5, vy: -0.5 })).toBe('desplegar');
        expect(decidirAlSoltar({ plegada: true, dy: 30 })).toBe('quedarse');
    });
});

describe('la barra', () => {
    it('el asa la pliega, lo recuerda, marca <html> y saca las pestañas del foco; otro toque la devuelve', () => {
        pintar();
        const asa = screen.getByRole('button', { name: 'Ocultar el menú', hidden: true });
        expect(asa).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(asa);
        expect(localStorage.getItem(CLAVE_TABBAR_PLEGADA)).toBe('1');
        expect(document.documentElement.hasAttribute('data-tabbar-plegada')).toBe(true);
        const abrir = screen.getByRole('button', { name: 'Mostrar el menú', hidden: true });
        expect(abrir).toHaveAttribute('aria-expanded', 'false');
        // plegada, las pestañas no se alcanzan con el teclado ni las anuncia el lector
        // por atributo y no por rol: un elemento `aria-hidden` no tiene nombre accesible, que es justo lo que se comprueba
        const agente = () => document.querySelector('nav button[aria-label="Agente"]');
        expect(agente()).toHaveAttribute('tabindex', '-1');
        expect(agente()).toHaveAttribute('aria-hidden', 'true');
        fireEvent.click(abrir);
        expect(localStorage.getItem(CLAVE_TABBAR_PLEGADA)).toBeNull();
        expect(document.documentElement.hasAttribute('data-tabbar-plegada')).toBe(false);
        expect(agente()).not.toHaveAttribute('tabindex');
        expect(agente()).not.toHaveAttribute('aria-hidden');
    });

    it('nace como la dejaste', () => {
        localStorage.setItem(CLAVE_TABBAR_PLEGADA, '1');
        pintar();
        expect(screen.getByRole('button', { name: 'Mostrar el menú', hidden: true })).toBeInTheDocument();
        expect(document.documentElement.hasAttribute('data-tabbar-plegada')).toBe(true);
    });

    it('un deslizamiento hacia abajo la pliega y NO cuenta como toque en la pestaña donde empezó', () => {
        pintar();
        const pestana = screen.getByRole('button', { name: 'Agente', hidden: true });
        fireEvent.touchStart(pestana, { touches: [{ clientX: 100, clientY: 760 }] });
        fireEvent.touchMove(pestana, { touches: [{ clientX: 101, clientY: 790 }] });
        fireEvent.touchMove(pestana, { touches: [{ clientX: 101, clientY: 815 }] });
        fireEvent.touchEnd(pestana, { changedTouches: [{ clientX: 101, clientY: 815 }] });
        expect(document.documentElement.hasAttribute('data-tabbar-plegada')).toBe(true);
    });
});

describe('el espacio se devuelve', () => {
    it('todo lo que reservaba sitio para la barra resta --tabbar-recupera', () => {
        expect(leer('index.css')).toContain('html[data-tabbar-plegada] {\n  --tabbar-recupera: 42px;\n}'.replace(/\n/g, leer('index.css').includes('\r\n') ? '\r\n' : '\n'));
        const layout = leer('components/dashboard/DashboardLayout.module.css');
        expect((layout.match(/- var\(--tabbar-recupera, 0px\)/g) || []).length).toBe(2);
        const chat = leer('pages/AgentPage.jsx');
        expect(chat).toContain('calc(1.4rem + 64px - var(--tabbar-recupera, 0px) + env(safe-area-inset-bottom, 0px))');
        expect(chat).toContain('padding-bottom: calc(64px - var(--tabbar-recupera, 0px) + env(safe-area-inset-bottom, 0px));');
        for (const f of ['components/recipes/MobileRecipes.module.css', 'pages/Pantry.mobileFridge.module.css', 'pages/History.module.css']) {
            expect(leer(f)).toContain('calc(80px - var(--tabbar-recupera, 0px) + env(safe-area-inset-bottom, 0px))');
        }
    });
    it('plegada deja la franja del asa ENCIMA del indicador de inicio, y el teclado sigue mandando', () => {
        const css = leer('components/dashboard/BottomTabBar.module.css');
        expect(css).toContain('transform: translateY(calc(100% - var(--tabbar-asa) - env(safe-area-inset-bottom, 0px)));');
        expect(css).toContain('transform: translateY(110%) !important;');
        expect(css).toContain('touch-action: none;');
    });
});
