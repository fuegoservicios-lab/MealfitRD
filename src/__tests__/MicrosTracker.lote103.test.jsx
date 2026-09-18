// [P1-PLAN-LOTE-103 · 2026-09-18] «Micros de hoy» y la pestaña «Progreso» del modo plan.
//
//  · el contador de micros pinta los OCHO del dueño, con la cobertura honesta («con datos de 1 de 2 comidas») y el
//    sodio como techo (se pasa → rojo);
//  · sin metas no hay barra contra un cero inventado;
//  · vuelve a pedir el día al registrar/borrar y las metas al cambiar el perfil;
//  · en modo plan, «Progreso» es pestaña propia y el dashboard del plan ya no monta el contador ni la hidratación;
//    lo que sabe de hoy le llega por `useTodaysConsumedMeals` (adopta el evento del contador; si no, pide él).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import MicrosTracker from '../components/dashboard/MicrosTracker';
import { useTodaysConsumedMeals } from '../hooks/useTodaysConsumedMeals';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const respuesta = (body, ok = true) => ({ ok, json: async () => body });

const METAS = {
    fiber_g: { target: 38, kind: 'floor', unit: 'g' }, sodium_mg: { target: 2000, kind: 'ceiling', unit: 'mg' },
    potassium_mg: { target: 3400, kind: 'floor', unit: 'mg' }, calcium_mg: { target: 1000, kind: 'floor', unit: 'mg' },
    iron_mg: { target: 8, kind: 'floor', unit: 'mg' }, vit_c_mg: { target: 90, kind: 'floor', unit: 'mg' },
    vit_a_mcg: { target: 900, kind: 'floor', unit: 'mcg' }, vit_d_mcg: { target: 15, kind: 'floor', unit: 'mcg' },
};
const HOY = {
    meals: [{ id: 'a' }, { id: 'b' }],
    totals: {
        calories: 900, protein: 50, carbs: 100, healthy_fats: 20,
        micros: { fiber_g: 19.4, sodium_mg: 2310, potassium_mg: 2310.8, calcium_mg: 505, iron_mg: 2.6, vit_c_mg: 42.1, vit_a_mcg: 87, vit_d_mcg: 0 },
        micros_coverage: { con_datos: 1, total: 2 },
    },
};

const enrutar = ({ hoy = HOY, metas = METAS } = {}) => vi.fn(async (url) => {
    if (String(url).startsWith('/api/nutrition/targets')) return respuesta({ ok: true, calories: 2000, macros: {}, micros: metas });
    if (String(url).startsWith('/api/diary/consumed/')) return respuesta(hoy);
    return respuesta({});
});

describe('MicrosTracker', () => {
    beforeEach(() => { fetchWithAuth.mockReset(); });

    it('pinta los ocho con sus metas, la cobertura honesta y el sodio como techo pasado', async () => {
        fetchWithAuth.mockImplementation(enrutar());
        render(<MicrosTracker userId="u1" />);
        await screen.findByText('Con datos de 1 de 2 comidas');
        for (const l of ['Fibra', 'Sodio', 'Potasio', 'Calcio', 'Hierro', 'Vitamina C', 'Vitamina A', 'Vitamina D']) {
            expect(screen.getByText(l)).toBeInTheDocument();
        }
        expect(screen.getByText('máx.')).toBeInTheDocument();
        const sodio = screen.getByRole('progressbar', { name: 'Sodio' });
        expect(sodio.getAttribute('aria-valuenow')).toBe('2310');
        expect(sodio.getAttribute('aria-valuemax')).toBe('2000');
        expect(sodio.firstChild.className).toMatch(/over/);
        expect(sodio.firstChild.style.width).toBe('100%');
        const fibra = screen.getByRole('progressbar', { name: 'Fibra' });
        expect(fibra.firstChild.style.width).toBe('51%');
        expect(screen.getByText('Las comidas registradas por foto o con macros propias no traen micros.')).toBeInTheDocument();
    });

    it('sin metas no hay barra ni meta inventada; sin comidas invita a registrar', async () => {
        fetchWithAuth.mockImplementation(enrutar({ metas: {} }));
        render(<MicrosTracker userId="u1" />);
        await screen.findByText('Sin metas todavía: completa sexo y edad en Configuración.');
        expect(screen.getByRole('progressbar', { name: 'Fibra' }).firstChild.style.width).toBe('0%');
        expect(screen.queryByText('/ 38 g')).toBeNull();
    });

    it('vuelve a pedir el día al registrar o borrar y las metas al cambiar el perfil', async () => {
        fetchWithAuth.mockImplementation(enrutar());
        render(<MicrosTracker userId="u1" />);
        await screen.findByText('Con datos de 1 de 2 comidas');
        const antes = fetchWithAuth.mock.calls.length;
        await act(async () => { window.dispatchEvent(new Event('mealfit:diary-changed')); });
        await act(async () => { window.dispatchEvent(new Event('mealfit:refresh-inventory')); });
        await act(async () => { window.dispatchEvent(new Event('mealfit:targets-changed')); });
        await waitFor(() => expect(fetchWithAuth.mock.calls.length).toBe(antes + 3));
        const urls = fetchWithAuth.mock.calls.slice(antes).map((c) => String(c[0]));
        expect(urls.filter((u) => u.startsWith('/api/diary/consumed/'))).toHaveLength(2);
        expect(urls.filter((u) => u.startsWith('/api/nutrition/targets'))).toHaveLength(1);
    });
});

describe('useTodaysConsumedMeals', () => {
    beforeEach(() => { fetchWithAuth.mockReset(); });

    it('pide el diario al montar y adopta lo que emite el contador; un fetch en vuelo no pisa lo adoptado', async () => {
        let resolver;
        fetchWithAuth.mockImplementation(() => new Promise((r) => { resolver = r; }));
        const { result } = renderHook(() => useTodaysConsumedMeals('u1'));
        expect(result.current).toEqual([]);
        await act(async () => {
            window.dispatchEvent(new CustomEvent('mealfit:today-consumed-updated', { detail: { meals: [{ id: 'x' }] } }));
        });
        expect(result.current).toEqual([{ id: 'x' }]);
        await act(async () => { resolver(respuesta({ meals: [] })); });
        expect(result.current).toEqual([{ id: 'x' }]);
    });
});

describe('la división Plan / Progreso', () => {
    it('el dashboard del plan ya no monta el contador ni la hidratación y toma el diario del hook', () => {
        const dash = src('src/pages/Dashboard.jsx');
        expect(dash).not.toContain('<TrackingProgress');
        expect(dash).not.toContain('<WaterTracker');
        expect(dash).toContain("const todaysConsumedMeals = useTodaysConsumedMeals(session?.user?.id || userProfile?.id);");
        expect(src('src/pages/ProgressPage.jsx')).toContain('<DashboardTracking modo="plan" />');
        expect(src('src/App.jsx')).toContain('<Route path="/dashboard/progress" element={<ProgressPage />} />');
        // al borrar en el contador, quien esté escuchando vuelve a pedir el día
        expect(src('src/components/dashboard/TrackingProgress.jsx')).toContain("window.dispatchEvent(new Event('mealfit:diary-changed'))");
    });

    it('en modo plan las metas de macros son las del plan y no hay invitación a encenderlo', () => {
        const s = src('src/components/dashboard/DashboardTracking.jsx');
        expect(s).toContain("const metasMacros = modo === 'plan' && planData?.calories ? { ok: true, ...planData } : targets;");
        expect(s).toContain("{modo === 'contador' && <TurnOnPlanCard formData={formData} hayPlanPausado={!!planData} />}");
        expect(s).toContain('<MicrosTracker userId={userProfile?.id} flatOnMobile />');
    });
});
