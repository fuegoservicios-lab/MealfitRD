// [P1-PLAN-LOTE-89 · 2026-09-17] La campana de notificaciones ATRACA en la cabecera en teléfono y tableta.
// El dueño, con captura a 392px (la campana era un tirador en el borde derecho, encima de la tarjeta de la
// invitación): «en vez de la derecha, ¿por qué no mejor arriba?… que no estorbe ni choque con nada».
//
// Contrato: con la cabecera móvil VISIBLE (≤1024px, el corte de DashboardLayout) y su hueco montado
// (`NotificationSlot`), el botón se portaliza DENTRO del hueco; sin hueco o en escritorio cae al <body>
// como siempre. Atracada no se esconde con `hidden`: vive bajo el velo del menú y bajo cualquier modal.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => ({ isGuest: false }) }));
vi.mock('../components/dashboard/MicronutrientPanel', () => ({ classify: () => ({}), restoreMicrosPanel: () => {} }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import NotificationCenter from '../components/dashboard/NotificationCenter';
import NotificationSlot from '../components/dashboard/NotificationSlot';
import { getNotifSlot } from '../utils/notifSlot';

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

const ponerViewport = (movil) => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: movil && query === '(max-width: 1024px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
};

const montar = ({ conHueco = true, hidden = false } = {}) => render(
    <MemoryRouter>
        <header>{conHueco && <NotificationSlot />}</header>
        <NotificationCenter hidden={hidden} />
    </MemoryRouter>
);

const campana = () => screen.queryByRole('button', { name: /^Notificaciones/ });

describe('la campana atraca en la cabecera', () => {
    beforeEach(() => { try { localStorage.clear(); } catch { /* noop */ } });
    afterEach(() => cleanup());

    it('móvil con hueco: el botón vive DENTRO de la cabecera', () => {
        ponerViewport(true);
        montar();
        const hueco = document.querySelector('[data-notif-slot]');
        expect(hueco).not.toBeNull();
        expect(hueco.contains(campana())).toBe(true);
    });

    it('escritorio (cabecera móvil oculta) o sin hueco: cae al body como siempre', () => {
        ponerViewport(false);
        montar();
        expect(document.querySelector('[data-notif-slot]').contains(campana())).toBe(false);
        expect(campana().parentElement).toBe(document.body);
        cleanup();

        ponerViewport(true);
        montar({ conHueco: false });
        expect(campana().parentElement).toBe(document.body);
    });

    it('atracada ignora `hidden` (la tapa el velo del menú); suelta sigue escondiéndose', () => {
        ponerViewport(true);
        montar({ hidden: true });
        expect(campana()).not.toBeNull();
        cleanup();

        ponerViewport(false);
        montar({ hidden: true });
        expect(campana()).toBeNull();
    });

    it('al desmontarse la cabecera suelta el hueco y la campana vuelve al body', () => {
        ponerViewport(true);
        const Caso = ({ conCabecera }) => (
            <MemoryRouter>
                {conCabecera && <header><NotificationSlot /></header>}
                <NotificationCenter />
            </MemoryRouter>
        );
        const { rerender } = render(<Caso conCabecera />);
        expect(getNotifSlot()).not.toBeNull();
        act(() => { rerender(<Caso conCabecera={false} />); });
        expect(getNotifSlot()).toBeNull();
        expect(campana().parentElement).toBe(document.body);
    });
});

describe('anclas del lote 89', () => {
    it('la cabecera ofrece el hueco con la MISMA condición que monta el centro, y el corte de 1024px coincide', () => {
        const layout = src('src/components/dashboard/DashboardLayout.jsx');
        const acciones = layout.slice(layout.indexOf('className={styles.mobileHeaderActions}'), layout.indexOf('</header>'));
        expect(acciones).toContain('{showNotifCenter && <NotificationSlot />}');
        expect(acciones.indexOf('<NotificationSlot />')).toBeLessThan(acciones.indexOf('className={styles.menuBtn}'));
        // una sola condición para el centro y para su hueco
        expect(layout).toContain("const showNotifCenter = location.pathname.replace(");
        expect(layout.split(/\s+/).join(' ')).toContain('{showNotifCenter && ( <NotificationCenter hidden=');
        expect(src('src/components/dashboard/NotificationCenter.jsx')).toContain("useMediaQuery('(max-width: 1024px)')");
        const css = src('src/components/dashboard/DashboardLayout.module.css');
        const corte = css.slice(css.indexOf('@media (max-width: 1024px) {'));
        expect(corte.slice(0, corte.indexOf('.sidebar {')).split(/\s+/).join(' ')).toContain('.mobileHeader { display: flex; }');
    });

    it('el orbe: 40px como el menú, redondo, anillo que solo se mueve con algo sin leer, y sin movimiento si se pide', () => {
        const css = src('src/components/dashboard/NotificationCenter.module.css');
        const i = css.indexOf('.handle.handleDocked {');
        expect(i).toBeGreaterThan(-1);
        const regla = css.slice(i, css.indexOf('}', i));
        for (const decl of ['position: relative;', 'width: 40px;', 'height: 40px;', 'border-radius: 50%;', 'transform: none;']) {
            expect(regla).toContain(decl);
        }
        const plano = css.split(/\s+/).join(' ');
        expect(plano).toContain('.handleDocked.handleAlert::before { opacity: 1; animation: notifRingSpin');
        expect(plano).toContain('.handleAlert .handleOrbit { opacity: 1; animation: notifOrbit');
        expect(plano).toContain(':global(html:not([data-theme="dark"])) .handle.handleDocked {');
        const reducido = plano.slice(plano.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
        expect(reducido).toContain('.handleDocked.handleAlert::before, .handleAlert .handleOrbit { animation: none; }');
    });
});
