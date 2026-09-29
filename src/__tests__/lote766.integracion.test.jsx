/**
 * [P1-PLAN-LOTE-766 · 2026-09-29] La Nevera de verdad (backend simulado), en el teléfono: con un suplemento guardado y
 * ningún alimento, la Alacena NO dice «Tu alacena está vacía» —el dueño lo vio encima de su ganador de peso recién
 * guardado por el coach—; pinta la tarjeta del pote y una línea discreta de lo que vive aquí. Sin suplementos, el vacío
 * de siempre.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const UID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const estado = {
    session: { user: { id: UID } },
    userProfile: { id: UID, nevera_activa: true },
    planData: null,
    formData: { name: 'Angelo', country: 'DO' },
    updateData: vi.fn(),
    saveGeneratedPlan: vi.fn(),
    restoreSessionData: vi.fn(),
};
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => estado }));

const POTE = {
    id: 91, ingredient_name: 'Atlas Gainer Advanced Mass Vanilla', brand: 'Patriot Nutrition', quantity: 0,
    unit: 'sup_scoop', kind: 'supplement', serving_unit: 'scoop', serving_label: null, label_source: null,
};
let filas = [POTE];
vi.mock('../config/api', async (importOriginal) => {
    const real = await importOriginal();
    const json = (body) => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });
    return {
        ...real,
        fetchWithAuth: vi.fn(async (url) => {
            if (String(url).startsWith('/api/inventory?incluir_suplementos=1')) return json({ items: filas });
            return json({ items: [] });
        }),
    };
});

import Pantry from '../pages/Pantry';
import { invalidateInventoryCache } from '../utils/pantryCache';

vi.setConfig({ testTimeout: 25000 });

let matchMediaOriginal;
beforeAll(() => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    if (!globalThis.IntersectionObserver) {
        globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
    }
});
beforeEach(() => {
    window.localStorage.clear();
    try { invalidateInventoryCache(); } catch { /* sin caché */ }
    matchMediaOriginal = window.matchMedia;
    // el corte del teléfono de la Nevera (760 px); el resto de consultas, no
    window.matchMedia = vi.fn((query) => ({
        matches: query === '(max-width: 760px)', media: query, onchange: null,
        addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => true,
    }));
});
afterEach(() => { window.matchMedia = matchMediaOriginal; });

const abrirAlacena = async () => {
    render(<MemoryRouter initialEntries={['/dashboard/pantry']}><Pantry /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('tab', { name: /Alacena/ }, { timeout: 10000 }));
};

describe('[766] la Alacena con un suplemento y sin alimentos', () => {
    it('no dice «vacía»: pinta el pote y una línea discreta', async () => {
        filas = [POTE];
        await abrirAlacena();
        expect(await screen.findByText('Atlas Gainer Advanced Mass Vanilla', {}, { timeout: 10000 })).toBeInTheDocument();
        expect(screen.queryByText('Tu alacena está vacía')).toBeNull();
        expect(screen.getByText('Arroz, granos, especias y conservas viven aquí.')).toBeInTheDocument();
        // la tarjeta: marca, «Sin etiqueta» con cómo completarla, y la pregunta de las porciones con su campo
        expect(screen.getByText('Patriot Nutrition')).toBeInTheDocument();
        expect(screen.getByText('Sin etiqueta')).toBeInTheDocument();
        expect(screen.getByText('Mándale al coach una foto de la tabla nutricional para completar sus cifras.')).toBeInTheDocument();
        expect(screen.getByText('¿Cuántas porciones trae el pote?')).toBeInTheDocument();
        expect(screen.getByLabelText('Porciones de Atlas Gainer Advanced Mass Vanilla')).toBeInTheDocument();
    });

    it('sin suplementos, el vacío de siempre', async () => {
        filas = [];
        await abrirAlacena();
        expect(await screen.findByText('Tu alacena está vacía', {}, { timeout: 10000 })).toBeInTheDocument();
        expect(screen.queryByText('Sin etiqueta')).toBeNull();
    });
});
