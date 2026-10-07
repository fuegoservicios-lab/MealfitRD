import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithAuth } from '../config/api';
import { borrarCacheDeInventario, setCachedMasterList, _resetPantryCacheForTests } from '../utils/pantryCache';
import Pantry from '../pages/Pantry';

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('../hooks/useMediaQuery', () => ({ useMediaQuery: () => viewport.mobile }));
vi.mock('../config/api', () => ({ API_BASE: '', fetchWithAuth: vi.fn() }));
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => ({
    session: { user: { id: 'test-user' } }, userProfile: { nevera_activa: true, plan_mode: 'tracking' },
    planData: null, formData: {}, setPlanData: vi.fn(),
}) }));
vi.mock('../components/pantry/PantryScanButton', () => ({ PantryScanButton: () => null }));

const deferred = () => {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
};
const jsonResponse = (json, status = 200) => ({ ok: status === 200, status, json: async () => json });
let inventory;
let catalog;
beforeEach(() => {
    localStorage.clear();
    borrarCacheDeInventario();
    _resetPantryCacheForTests();
    inventory = deferred();
    catalog = deferred();
    fetchWithAuth.mockImplementation(path => {
        if (path === '/api/inventory?incluir_suplementos=1') return inventory.promise;
        if (path === '/api/catalog') return catalog.promise;
        return Promise.resolve(jsonResponse({ items: [], candidates: [], brands: [], status: {} }));
    });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('primera apertura de Nevera', () => {
    it('encuentra Arroz desde la copia guardada sin esperar otra descarga', async () => {
        viewport.mobile = true;
        setCachedMasterList([{ id: 'arroz', name: 'Arroz', market_container: 'libra', default_unit: 'lb' }]);
        render(<MemoryRouter><Pantry /></MemoryRouter>);
        await act(async () => { inventory.resolve(jsonResponse({ items: [] })); });
        fireEvent.click(screen.getByRole('button', { name: 'Añadir alimento' }));
        fireEvent.change(screen.getByPlaceholderText('¿Qué vas a añadir? (ej: vinagre, aceite, pollo)'), { target: { value: 'Arroz' } });
        expect(screen.getAllByText('Arroz').length).toBeGreaterThan(0);
        expect(screen.queryByText('Cargando catálogo…')).toBeNull();
        expect(fetchWithAuth.mock.calls.filter(([path]) => path === '/api/catalog')).toHaveLength(0);
    });

    it('ofrece reintentar si la descarga falla', async () => {
        viewport.mobile = true;
        render(<MemoryRouter><Pantry /></MemoryRouter>);
        await act(async () => {
            catalog.resolve(jsonResponse({ detail: 'offline' }, 503));
            inventory.resolve(jsonResponse({ items: [] }));
        });
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Añadir alimento' })); });
        fireEvent.change(screen.getByPlaceholderText('¿Qué vas a añadir? (ej: vinagre, aceite, pollo)'), { target: { value: 'Arroz' } });
        await act(async () => {});
        expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
        expect(screen.queryByText('Cargando catálogo…')).toBeNull();
    });

    it.each([
        { mobile: false, state: 'pending' }, { mobile: false, state: 'failed' },
        { mobile: true, state: 'pending' }, { mobile: true, state: 'failed' },
    ])('muestra alimentos con móvil=$mobile y catálogo=$state', async ({ mobile, state }) => {
        viewport.mobile = mobile;
        render(<MemoryRouter><Pantry /></MemoryRouter>);
        await act(async () => {
            if (state === 'failed') catalog.resolve(jsonResponse({ detail: 'offline' }, 503));
            inventory.resolve(jsonResponse({ items: [{
                id: 'pollo', ingredient_name: 'Pollo', quantity: 2, unit: 'lb',
                master_ingredients: { id: 'master-pollo', name: 'Pollo', category: 'Proteínas' },
            }] }));
        });
        expect(screen.getAllByText('Pollo').length).toBeGreaterThan(0);
        if (state === 'pending') await act(async () => { catalog.resolve(jsonResponse({ items: [] })); });
    });
});
