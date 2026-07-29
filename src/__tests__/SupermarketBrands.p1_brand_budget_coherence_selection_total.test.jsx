/* [P1-BRAND-BUDGET-COHERENCE · 2026-07-29] `selectionTotal` (badge "Tu selección"
   de SupermarketBrands.jsx) debe multiplicar precio × conteo de paquetes, no
   solo sumar el precio unitario del producto elegido. Bug real hallado en el
   análisis brand↔budget: para un ítem que el costeo YA compra en más de un
   paquete (ej. "2 malla (Petite 1 Lb) c/u" — la lista necesita 2 paquetes de
   1 lb), el badge mostraba RD$34 (1 paquete) mientras la lista/PDF cobraban
   correctamente RD$68 (2 paquetes) — el mismo caso citado en la verificación
   contra producción (plan deefa5f0, ítem "Papa").

   Fórmula correcta (espejo de `_rebuildItemFromVariant` en Dashboard.jsx):
   count = ceil(curCount × package_grams_actual / size_g_del_variant_elegido). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SupermarketBrands from '../components/dashboard/SupermarketBrands';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({
    api: (path) => path,
    fetchWithAuth: vi.fn(),
}));

// Números reales citados en el análisis: 1 lb = 453.59 g, precio RD$34 el
// paquete de 1 lb, la lista necesita 2 paquetes → total real RD$68.
const PAPA_VARIANT = {
    id: 'papa-1lb-generico',
    brand: null,
    presentation: 'Malla Petite 1 Lb',
    size_g: 453.59,
    price_rd: 34,
};

const MATCH_RESPONSE = {
    matches: {
        Papa: [
            {
                food_name: 'Papa',
                variants: [PAPA_VARIANT],
            },
        ],
    },
};

const PREFS_RESPONSE = {
    preferences: {
        papa: { product_id: PAPA_VARIANT.id },
    },
};

const shoppingList = [
    {
        name: 'Papa',
        package_grams: 453.59, // el envase (1 lb) que el costeo ya usa
        display_qty: '2 malla (Petite 1 Lb) c/u', // el costeo necesita 2 paquetes
        estimated_cost_rd: 68,
    },
];

describe('P1-BRAND-BUDGET-COHERENCE — SupermarketBrands selectionTotal', () => {
    beforeEach(() => {
        vi.mocked(fetchWithAuth).mockReset().mockImplementation(async (path) => {
            if (String(path).includes('/api/supermarket/preferences')) {
                return { ok: true, json: async () => PREFS_RESPONSE };
            }
            return { ok: false, json: async () => ({}) };
        });
        global.fetch = vi.fn(async (url) => {
            if (String(url).includes('/api/supermarket/match')) {
                return { ok: true, json: async () => MATCH_RESPONSE };
            }
            return { ok: false, json: async () => ({}) };
        });
    });

    it('multiplica precio×conteo de paquetes (RD$68), no solo el precio unitario (RD$34)', async () => {
        render(<SupermarketBrands shoppingList={shoppingList} activeList={shoppingList} />);

        fireEvent.click(await screen.findByText(/Marcas del súper/i));

        await waitFor(() => {
            expect(screen.getByText(/Tu selección/i)).toBeInTheDocument();
        });

        // RD$68 = 2 paquetes × RD$34 — el número que el PDF/lista realmente cobra.
        expect(screen.getByText('RD$68')).toBeInTheDocument();
        // RD$34 sería el bug pre-fix (solo el precio unitario, sin multiplicar).
        expect(screen.queryByText('RD$34')).not.toBeInTheDocument();
    });
});
