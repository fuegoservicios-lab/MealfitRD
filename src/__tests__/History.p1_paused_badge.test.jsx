/**
 * [P1-HIST-PAUSED-BADGE · 2026-08-14] El Historial no jura «Plan activo» cuando
 * el usuario lo PAUSÓ.
 *
 * EL BUG, reportado con captura: con la generación de planes desactivada (modo
 * contador), el hero del Historial seguía luciendo la insignia verde «Plan
 * activo» con su punto brillante. Tercera superficie de la misma familia en el
 * día — el saludo del agente y el contexto del chat cayeron horas antes: la
 * pausa conserva `plan_data` a propósito (para poder «Reanudar»), y cada
 * superficie que deriva «activo» de la mera existencia del plan miente en modo
 * contador. *Una defensa que vive en un camino y no en el dato desaparece al
 * abrir un camino nuevo.*
 *
 * EL CONTRATO DE FONDO es explícito: P1-TRACKING-WINS dice que el plan pausado
 * «queda en Historial con "Reanudar"» — el Historial es precisamente donde la
 * pausa se DECLARA, no donde se disimula. El hero sigue siendo el hero (ese plan
 * ES el más reciente y el reanudable; esconderlo sería otra mentira), lo que
 * cambia es la palabra.
 *
 * Cubre los DOS paneles (desktop y móvil): la insignia vive duplicada en ambos,
 * y arreglar solo el que salió en la captura es arreglar el caso y no la clase.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HistoryDesktopPanel from '../components/history/HistoryDesktopPanel';
import HistoryMobilePanel from '../components/history/HistoryMobilePanel';

const PLAN = {
    id: 'p1',
    name: 'Fuerza y Sabor Caribeño',
    created_at: new Date().toISOString(),
    calories: 2100,
    macros: { protein: '125g', carbs: '269g', fats: '58g' },
    preview_meals: [{ meal: 'Cena', name: 'Pasta Integral Salteada' }],
};

const noop = () => {};
const props = {
    plans: [PLAN],
    total: 1,
    activePlanId: 'p1',
    searchQuery: '',
    setSearchQuery: noop,
    onOpen: noop,
    onEdit: noop,
    onDelete: noop,
    editingId: null,
    tempName: '',
    setTempName: noop,
    onEditSave: noop,
    onEditCancel: noop,
};

const pinta = (Panel, extra = {}) =>
    render(
        <MemoryRouter>
            <Panel {...props} {...extra} />
        </MemoryRouter>,
    );

describe('[P1-HIST-PAUSED-BADGE] panel de escritorio', () => {
    it('sin pausa, la insignia dice «Plan activo» — el contrato de siempre', () => {
        pinta(HistoryDesktopPanel, { paused: false });
        expect(screen.getByText(/plan activo/i)).toBeTruthy();
    });

    it('en PAUSA la insignia dice «en pausa» y deja de jurar «activo»', () => {
        pinta(HistoryDesktopPanel, { paused: true });
        expect(screen.getByText(/en pausa/i)).toBeTruthy();
        expect(screen.queryByText(/plan activo/i)).toBeNull();
    });

    it('en pausa el hero SIGUE siendo el hero (el plan no se esconde)', () => {
        // Esconder el plan pausado sería la otra mentira: ese plan es el
        // reanudable, y el Historial es su puerta de vuelta (P1-TRACKING-WINS).
        pinta(HistoryDesktopPanel, { paused: true });
        expect(screen.getByText('Fuerza y Sabor Caribeño')).toBeTruthy();
    });
});

describe('[P1-HIST-PAUSED-BADGE] panel móvil', () => {
    it('sin pausa conserva su chip «Activo»', () => {
        pinta(HistoryMobilePanel, { paused: false });
        expect(screen.getByText(/activo/i)).toBeTruthy();
    });

    it('en pausa el chip dice «en pausa»', () => {
        pinta(HistoryMobilePanel, { paused: true });
        expect(screen.getByText(/en pausa/i)).toBeTruthy();
        expect(screen.queryByText(/^activo$/i)).toBeNull();
    });
});

describe('[P1-HIST-PAUSED-BADGE] el cableado en History.jsx', () => {
    it('History pasa `paused` desde el SSOT del modo, no lo inventa local', async () => {
        // La lección de las cuartas tablas: si History decide el modo por su
        // cuenta, drifteará del dashboard y del agente. Debe importar
        // `isTrackingMode` (config/dashboardNav.js) y pasarlo a ambos paneles.
        const fs = await import('node:fs');
        const path = await import('node:path');
        // Ruta plana desde el cwd (frontend/): `new URL(..., import.meta.url)`
        // muere en vitest/Windows con «URL must be of scheme file».
        const src = fs.readFileSync(
            path.resolve(process.cwd(), 'src/pages/History.jsx'), 'utf-8',
        );
        expect(src).toMatch(/isTrackingMode/);
        expect((src.match(/paused=\{/g) || []).length).toBeGreaterThanOrEqual(2);
    });
});
