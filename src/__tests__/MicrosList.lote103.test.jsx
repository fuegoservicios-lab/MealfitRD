// [P1-PLAN-LOTE-103 · 2026-09-18 · reanclado P1-PLAN-LOTE-105] «Micros de hoy» y la pestaña «Progreso» del modo plan.
//
//  · la lista de micros pinta los OCHO del dueño, con la cobertura honesta («con datos de 1 de 2 comidas») y el
//    sodio como techo (se pasa → rojo);
//  · sin metas no hay barra contra un cero inventado;
//  · [lote 105] ya no pide nada: la tarjeta fusionada (TrackingProgress) le pasa los micros del MISMO fetch del
//    día; `resumirMicros` es la aritmética del servidor para el borrado optimista;
//  · en modo plan, «Progreso» es pestaña propia y el dashboard del plan ya no monta el contador ni la hidratación;
//    lo que sabe de hoy le llega por `useTodaysConsumedMeals` (adopta el evento del contador; si no, pide él).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import MicrosList from '../components/dashboard/MicrosList';
import { resumirMicros } from '../components/dashboard/microsShared';
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

describe('MicrosList', () => {
    beforeEach(() => { fetchWithAuth.mockReset(); });

    it('pinta los ocho con sus metas, la cobertura honesta y el sodio como techo pasado', async () => {
        render(<MicrosList micros={HOY.totals.micros} coverage={HOY.totals.micros_coverage} metas={METAS} />);
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

    it('sin metas no hay barra ni meta inventada', async () => {
        render(<MicrosList micros={HOY.totals.micros} coverage={HOY.totals.micros_coverage} metas={{}} />);
        await screen.findByText('Sin metas todavía: completa sexo y edad en Configuración.');
        expect(screen.getByRole('progressbar', { name: 'Fibra' }).firstChild.style.width).toBe('0%');
        expect(screen.queryByText('/ 38 g')).toBeNull();
    });

    it('resumirMicros suma solo las comidas con datos y cuenta la cobertura como el servidor', () => {
        const meals = [
            { id: 'a', micros: { values: { fiber_g: 10, sodium_mg: 500 }, resolved: 2, total: 2 } },
            { id: 'b', micros: null },
            { id: 'c', micros: { values: { fiber_g: 5.5, sodium_mg: 100 }, resolved: 1, total: 1 } },
        ];
        expect(resumirMicros(meals)).toEqual({ micros: { fiber_g: 15.5, sodium_mg: 600 }, coverage: { con_datos: 2, total: 3 } });
        expect(resumirMicros([{ id: 'x', micros: null }])).toEqual({ micros: null, coverage: { con_datos: 0, total: 1 } });
        expect(resumirMicros(undefined)).toEqual({ micros: null, coverage: { con_datos: 0, total: 0 } });
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
        // al borrar en el contador, quien esté escuchando vuelve a pedir el día ([lote 105] con `source`, para que
        // la propia tarjeta no reaccione a su borrado)
        expect(src('src/components/dashboard/TrackingProgress.jsx')).toContain("window.dispatchEvent(new CustomEvent('mealfit:diary-changed', { detail: { source: 'tracking-progress' } }))");
    });

    it('en modo plan las metas de macros son las del plan y no hay invitación a encenderlo', () => {
        const s = src('src/components/dashboard/DashboardTracking.jsx');
        expect(s).toContain("const metasMacros = modo === 'plan' && planData?.calories ? { ok: true, ...planData } : targets;");
        expect(s).toContain("{modo === 'contador' && <TurnOnPlanCard formData={formData} hayPlanPausado={!!planData} />}");
        // [lote 105] los micros van dentro de TrackingProgress; DashboardTracking solo pasa las metas
        expect(s).toContain('microTargets={targets?.micros || null}');
        expect(s).not.toContain('MicrosTracker');
    });
});
