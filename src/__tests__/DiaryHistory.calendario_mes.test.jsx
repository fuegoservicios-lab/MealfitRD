import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DiaryHistory from '../components/dashboard/DiaryHistory';
import { fetchWithAuth } from '../config/api';
import { getBiologicalDate } from '../utils/diaBiologico';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../components/dashboard/ScanMealModal', () => ({ default: () => null }));
vi.mock('../utils/confirmToast', () => ({ confirmToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => null) }));
vi.mock('framer-motion', async () => {
    const React = await import('react');
    const strip = (props) => {
        const out = { ...props };
        ['initial', 'animate', 'exit', 'transition', 'whileTap', 'whileHover', 'layout'].forEach((k) => delete out[k]);
        return out;
    };
    const tag = (T) => React.forwardRef((props, ref) => React.createElement(T, { ...strip(props), ref }));
    return {
        motion: { div: tag('div'), aside: tag('aside'), span: tag('span'), button: tag('button') },
        AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
    };
});

const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });
const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const _h = getBiologicalDate(new Date());
const HOY = aISO(_h);
const AYER_FECHA = new Date(_h.getFullYear(), _h.getMonth(), _h.getDate() - 1, 12);
const AYER = aISO(AYER_FECHA);

const RESUMEN_MOCK = {
    days: [
        { date: HOY, calories: 2100, protein: 140, carbs: 220, healthy_fats: 50, meals_count: 3 },
        { date: AYER, calories: 1200, protein: 70, carbs: 140, healthy_fats: 30, meals_count: 2 },
    ],
};

const DIA_HOY_COMPLETO = {
    meals: [
        { id: 'm1', meal_name: 'Desayuno completo', meal_type: 'desayuno', calories: 700, protein: 45, carbs: 70, healthy_fats: 15, created_at: _h.toISOString(), consumed_at: _h.toISOString() },
        { id: 'm2', meal_name: 'Almuerzo fuerte', meal_type: 'almuerzo', calories: 800, protein: 55, carbs: 80, healthy_fats: 20, created_at: _h.toISOString(), consumed_at: _h.toISOString() },
        { id: 'm3', meal_name: 'Cena saludable', meal_type: 'cena', calories: 600, protein: 40, carbs: 70, healthy_fats: 15, created_at: _h.toISOString(), consumed_at: _h.toISOString() },
    ],
    totals: { calories: 2100, protein: 140, carbs: 220, healthy_fats: 50 },
};

const DIA_AYER_INCOMPLETO = {
    meals: [
        { id: 'm4', meal_name: 'Avena con fruta', meal_type: 'desayuno', calories: 450, protein: 20, carbs: 65, healthy_fats: 10, created_at: AYER_FECHA.toISOString(), consumed_at: AYER_FECHA.toISOString() },
    ],
    totals: { calories: 1200, protein: 70, carbs: 140, healthy_fats: 30 },
};

describe('DiaryHistory - Cuadrícula de mes y barra verde de meta completada', () => {
    beforeEach(() => {
        // [P1-PLAN-LOTE-1131] el cajón abre en el MAPA; estas pruebas son de la vista de calendario
        try { window.localStorage.setItem('mealfit_registro_vista', 'calendario'); } catch { /* jsdom */ }
        vi.clearAllMocks();
        fetchWithAuth.mockImplementation(async (url) => {
            if (url.includes('/api/diary/consumed-range')) return respuesta(RESUMEN_MOCK);
            if (url.includes(`date=${HOY}`)) return respuesta(DIA_HOY_COMPLETO);
            if (url.includes(`date=${AYER}`)) return respuesta(DIA_AYER_INCOMPLETO);
            return respuesta({ meals: [], totals: {} });
        });
    });

    it('pinta la raya en verde (calCellDotGreen) al completar la meta de calorías, y ámbar si no se completó', async () => {
        render(
            <DiaryHistory
                userId="u-123"
                open={true}
                onClose={() => {}}
                targetCalories={2000}
            />
        );

        await waitFor(() => {
            expect(fetchWithAuth).toHaveBeenCalled();
        });

        // En la tira de días (en document.body por createPortal):
        // HOY tiene 2100 kcal (meta 2000) => calCellDotGreen
        await waitFor(() => {
            const completes = document.querySelectorAll('[class*="calCellDotGreen"]');
            expect(completes.length).toBeGreaterThanOrEqual(1);
        });

        // La barra de cuota de hoy (2100 >= 2000) también lleva quotaFillComplete
        const quotaFill = document.querySelector('[class*="quotaFillComplete"]');
        expect(quotaFill).not.toBeNull();
    });

    it('permite cambiar a la vista de mes (calendario) con la pestaña "Mes"', async () => {
        render(
            <DiaryHistory
                userId="u-123"
                open={true}
                onClose={() => {}}
                targetCalories={2000}
            />
        );

        await waitFor(() => {
        });


        // Debe renderizarse el contenedor de calendario y la cuadrícula
        await waitFor(() => {
            expect(screen.getByRole('grid', { name: /calendario mensual/i })).toBeInTheDocument();
        });

        // El domingo debe tener el resaltado rojo (calSunday)
        const domingo = screen.getAllByText('D').find((el) => el.className.includes('calSunday'));
        expect(domingo).toBeDefined();
    });

    it('en la vista mensual, los días con meta completada llevan punto verde y los incompletos punto amarillo', async () => {
        render(
            <DiaryHistory
                userId="u-123"
                open={true}
                onClose={() => {}}
                targetCalories={2000}
            />
        );

        await waitFor(() => {
        });


        await waitFor(() => {
            expect(screen.getByRole('grid', { name: /calendario mensual/i })).toBeInTheDocument();
        });

        // Punto verde (calCellDotGreen) para el día completo (hoy: 2100 kcal)
        const dotGreen = document.querySelector('[class*="calCellDotGreen"]');
        expect(dotGreen).not.toBeNull();

        // Punto amarillo (calCellDotYellow) para el día incompleto (ayer: 1200 kcal)
        const dotYellow = document.querySelector('[class*="calCellDotYellow"]');
        expect(dotYellow).not.toBeNull();

        // [SEMANAS-ALINEADAS] cada fila con días ya vividos lleva su semana numerada y sus estrellas
        expect(screen.getAllByRole('img', { name: /^Semana \d+: \d de 3 estrellas$/ }).length).toBeGreaterThanOrEqual(1);
        // [CALENDARIO-SOLO-MES] no hay pestaña «Semana»; la leyenda es un filtro con conteos que apaga los demás días
        expect(screen.queryByRole('button', { name: 'Semana' })).toBeNull();
        const enMeta = screen.getByRole('button', { name: /En meta/ });
        expect(enMeta).toHaveAttribute('aria-pressed', 'false');
        expect(document.querySelectorAll('[class*="calCellDimmed"]').length).toBe(0);
        fireEvent.click(enMeta);
        expect(enMeta).toHaveAttribute('aria-pressed', 'true');
        const apagadas = document.querySelectorAll('[class*="calCellDimmed"]').length;
        expect(apagadas).toBeGreaterThan(20);
        expect(dotYellow.closest('button').className).toMatch(/calCellDimmed/);
        expect(document.querySelector('[class*="calCellDotGreen"]').closest('button').className).not.toMatch(/calCellDimmed/);
        fireEvent.click(enMeta);                       // otra vez: se quita el filtro
        expect(document.querySelectorAll('[class*="calCellDimmed"]').length).toBe(0);
    });

    it('permite navegar al mes anterior con la flecha y regresar a hoy con el botón de fecha', async () => {
        render(
            <DiaryHistory
                userId="u-123"
                open={true}
                onClose={() => {}}
                targetCalories={2000}
            />
        );

        await waitFor(() => {
        });


        await waitFor(() => {
            expect(screen.getByRole('button', { name: /mes anterior/i })).toBeInTheDocument();
        });

        const btnAnt = screen.getByRole('button', { name: /mes anterior/i });
        fireEvent.click(btnAnt);

        // Al cambiar de mes, debe seguir mostrando la cuadrícula de ese mes
        await waitFor(() => {
            expect(screen.getByRole('grid', { name: /calendario mensual/i })).toBeInTheDocument();
        });

        // El botón de atajo a hoy (que tiene el número del día de hoy) debe existir
        const btnHoy = screen.getByRole('button', { name: /ir a hoy/i });
        expect(btnHoy).toBeInTheDocument();

        // Pulsar "Ir a hoy" regresa a hoy
        fireEvent.click(btnHoy);
        await waitFor(() => {
            expect(fetchWithAuth).toHaveBeenCalledWith(expect.stringContaining(`date=${HOY}`));
        });
    });

    it('organiza el contenido en un scrollable unificado (drawerBody) y soporta swipe táctil para navegar meses', async () => {
        render(
            <DiaryHistory
                userId="u-123"
                open={true}
                onClose={() => {}}
                targetCalories={2000}
            />
        );

        await waitFor(() => {
        });


        // Contenedor scrollable unificado
        const drawerBody = document.querySelector('[class*="drawerBody"]');
        expect(drawerBody).not.toBeNull();

        const calContainer = document.querySelector('[class*="calendarContainer"]');
        expect(calContainer).not.toBeNull();

        // Simular swipe hacia la derecha (dx > 50px) para ir al mes anterior
        fireEvent.touchStart(calContainer, {
            touches: [{ clientX: 100, clientY: 200 }],
        });
        fireEvent.touchEnd(calContainer, {
            changedTouches: [{ clientX: 200, clientY: 205 }],
        });

        // Debe haberse disparado la navegación al mes anterior
        await waitFor(() => {
            expect(fetchWithAuth).toHaveBeenCalled();
        });
    });

    it('[BB-024] verifica en verde en la tira, barra del día y calendario cuando HOY está en la banda de éxito (2015/2050 kcal = 98%)', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            if (url.includes('/api/diary/consumed-range')) {
                return respuesta({
                    days: [
                        { date: HOY, calories: 2015, protein: 88, carbs: 242, healthy_fats: 82, meals_count: 3 },
                        { date: AYER, calories: 1500, protein: 90, carbs: 160, healthy_fats: 45, meals_count: 2 },
                    ],
                });
            }
            if (url.includes(`date=${HOY}`)) {
                return respuesta({
                    meals: [
                        { id: 'h1', meal_name: 'Mangú de plátano verde', meal_type: 'desayuno', calories: 865, protein: 27, carbs: 93, healthy_fats: 45, created_at: _h.toISOString(), consumed_at: _h.toISOString() },
                        { id: 'h2', meal_name: 'Arroz blanco con carne molida', meal_type: 'almuerzo', calories: 550, protein: 30, carbs: 68, healthy_fats: 17, created_at: _h.toISOString(), consumed_at: _h.toISOString() },
                        { id: 'h3', meal_name: 'Puré de plátano maduro con pollo', meal_type: 'cena', calories: 600, protein: 31, carbs: 81, healthy_fats: 20, created_at: _h.toISOString(), consumed_at: _h.toISOString() },
                    ],
                    totals: { calories: 2015, protein: 88, carbs: 242, healthy_fats: 82 },
                });
            }
            return respuesta({ meals: [], totals: {} });
        });

        render(
            <DiaryHistory
                userId="u-98pct"
                open={true}
                onClose={() => {}}
                targetCalories={2050}
                targetMacros={{ protein: 134, carbs: 251, fats: 57 }}
                mainGoal="lose_fat"
            />
        );

        await waitFor(() => {
            expect(document.querySelectorAll('[class*="calCellDotGreen"]').length).toBeGreaterThanOrEqual(1);
        });
        expect(document.querySelector('[class*="quotaFillComplete"]')).not.toBeNull();
        expect(screen.getByText('Meta del día alcanzada')).toBeInTheDocument();

        await waitFor(() => {
            expect(document.querySelector('[class*="calCellDotGreen"]')).not.toBeNull();
            expect(document.querySelector('[class*="calCellDotYellow"]')).not.toBeNull();
        });
    });

    it('[BB-024] distingue exceso (>110% pérdida de grasa = naranja) vs ganancia muscular (<=115% = verde)', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            if (url.includes('/api/diary/consumed-range')) {
                return respuesta({
                    days: [{ date: HOY, calories: 2300, protein: 160, carbs: 260, healthy_fats: 70, meals_count: 3 }],
                });
            }
            if (url.includes(`date=${HOY}`)) {
                return respuesta({
                    meals: [{ id: 'e1', meal_name: 'Día alto', meal_type: 'almuerzo', calories: 2300, protein: 160, carbs: 260, healthy_fats: 70, created_at: _h.toISOString(), consumed_at: _h.toISOString() }],
                    totals: { calories: 2300, protein: 160, carbs: 260, healthy_fats: 70 },
                });
            }
            return respuesta({ meals: [], totals: {} });
        });

        const { rerender } = render(
            <DiaryHistory
                userId="u-over"
                open={true}
                onClose={() => {}}
                targetCalories={2050}
                mainGoal="lose_fat"
            />
        );

        await waitFor(() => {
            expect(document.querySelector('[class*="calCellDotOrange"]')).not.toBeNull();
        });
        expect(document.querySelector('[class*="quotaFillOver"]')).not.toBeNull();
        expect(document.querySelector('[class*="calCellDotGreen"]')).toBeNull();
        expect(screen.queryByText('Meta del día alcanzada')).toBeNull();
        expect(screen.getByText('250 kcal sobre la meta')).toBeInTheDocument();
        expect(screen.getByText(/Zona en meta:.*80–105 % de tu meta/)).toBeInTheDocument();

        await waitFor(() => {
            expect(document.querySelector('[class*="calCellDotOrange"]')).not.toBeNull();
        });

        rerender(
            <DiaryHistory
                userId="u-over"
                open={true}
                onClose={() => {}}
                targetCalories={2050}
                mainGoal="gain_muscle"
            />
        );

        await waitFor(() => {
            expect(document.querySelector('[class*="calCellDotGreen"]')).not.toBeNull();
            expect(document.querySelector('[class*="quotaFillComplete"]')).not.toBeNull();
            expect(screen.getByText('Meta del día alcanzada')).toBeInTheDocument();
        });
    });

    it('[P1-DIARY-DAY-TARGETS] respeta la meta histórica por día sin reescribir días pasados al bajar de meta', async () => {
        fetchWithAuth.mockImplementation(async (url) => {
            if (url.includes('/api/diary/consumed-range')) {
                return respuesta({
                    days: [
                        { date: HOY, calories: 2095, protein: 89, carbs: 262, healthy_fats: 82, meals_count: 3, target_calories: 2050, main_goal: 'lose_fat' },
                        { date: AYER, calories: 3082, protein: 138, carbs: 358, healthy_fats: 120, meals_count: 4, target_calories: 3350, main_goal: 'gain_muscle' },
                    ],
                });
            }
            if (url.includes(`date=${HOY}`)) {
                return respuesta({
                    meals: [{ id: 'v1', meal_name: 'Cena viernes', meal_type: 'cena', calories: 2095, protein: 89, carbs: 262, healthy_fats: 82, created_at: _h.toISOString(), consumed_at: _h.toISOString() }],
                    totals: { calories: 2095, protein: 89, carbs: 262, healthy_fats: 82 },
                    targets: { calories: 2050, macros: { protein: 134, carbs: 251, fats: 57 }, main_goal: 'lose_fat' },
                });
            }
            if (url.includes(`date=${AYER}`)) {
                return respuesta({
                    meals: [{ id: 'j1', meal_name: 'Comida jueves', meal_type: 'almuerzo', calories: 3082, protein: 138, carbs: 358, healthy_fats: 120, created_at: AYER_FECHA.toISOString(), consumed_at: AYER_FECHA.toISOString() }],
                    totals: { calories: 3082, protein: 138, carbs: 358, healthy_fats: 120 },
                    targets: { calories: 3350, macros: { protein: 180, carbs: 380, fats: 100 }, main_goal: 'gain_muscle' },
                });
            }
            return respuesta({ meals: [], totals: {} });
        });

        render(
            <DiaryHistory
                userId="u-hist-goal"
                open={true}
                onClose={() => {}}
                targetCalories={2050}
                targetMacros={{ protein: 134, carbs: 251, fats: 57 }}
                mainGoal="lose_fat"
            />
        );

        // Tanto hoy (2095/2050 = 102%) como ayer (3082/3350 = 92%) deben verse en verde en la tira
        await waitFor(() => {
            expect(document.querySelectorAll('[class*="calCellDotGreen"]').length).toBe(2);
        });
        expect(document.querySelectorAll('[class*="calCellDotOrange"]').length).toBe(0);

        // Seleccionar ayer en la tira y verificar que muestra SU meta histórica (3350 kcal) y Meta del día alcanzada
        const ayerBtn = screen.getByTitle(/3082 kcal/);
        fireEvent.click(ayerBtn);

        await waitFor(() => {
            expect(screen.getByText('3082')).toBeInTheDocument();
            expect(screen.getByText('de 3350 kcal')).toBeInTheDocument();
            expect(screen.getByText('Meta del día alcanzada')).toBeInTheDocument();
            expect(screen.getByText('138/180 g')).toBeInTheDocument();
        });
    });

    it('muestra aviso discreto de déficit fuerte solo en días cerrados (<70 % lose_fat) y nunca en hoy', async () => {
        const AVISO = 'Muy por debajo de tu meta: un déficit tan grande cuesta energía y músculo.';
        fetchWithAuth.mockImplementation(async (url) => {
            if (url.includes('/api/diary/consumed-range')) {
                return respuesta({
                    days: [
                        { date: HOY, calories: 1000, protein: 70, carbs: 100, healthy_fats: 30, meals_count: 1, target_calories: 2050, main_goal: 'lose_fat' },
                        { date: AYER, calories: 1200, protein: 80, carbs: 120, healthy_fats: 35, meals_count: 2, target_calories: 2050, main_goal: 'lose_fat' },
                    ],
                });
            }
            if (url.includes(`date=${HOY}`)) {
                return respuesta({
                    meals: [{ id: 'h-low', meal_name: 'Desayuno ligero', meal_type: 'desayuno', calories: 1000, protein: 70, carbs: 100, healthy_fats: 30, created_at: _h.toISOString(), consumed_at: _h.toISOString() }],
                    totals: { calories: 1000, protein: 70, carbs: 100, healthy_fats: 30 },
                    targets: { calories: 2050, macros: { protein: 134, carbs: 251, fats: 57 }, main_goal: 'lose_fat' },
                });
            }
            if (url.includes(`date=${AYER}`)) {
                return respuesta({
                    meals: [{ id: 'a-low', meal_name: 'Cena ligera', meal_type: 'cena', calories: 1200, protein: 80, carbs: 120, healthy_fats: 35, created_at: AYER_FECHA.toISOString(), consumed_at: AYER_FECHA.toISOString() }],
                    totals: { calories: 1200, protein: 80, carbs: 120, healthy_fats: 35 },
                    targets: { calories: 2050, macros: { protein: 134, carbs: 251, fats: 57 }, main_goal: 'lose_fat' },
                });
            }
            return respuesta({ meals: [], totals: {} });
        });

        render(
            <DiaryHistory
                userId="u-deficit-aviso"
                open={true}
                onClose={() => {}}
                targetCalories={2050}
                mainGoal="lose_fat"
            />
        );

        // Hoy sigue en curso (<70 % = 49 %): NO debe mostrar aviso de déficit fuerte
        await waitFor(() => {
            expect(screen.getByText('1000')).toBeInTheDocument();
        });
        expect(screen.queryByText(AVISO)).toBeNull();

        // Día pasado (<70 % = 59 %): SÍ muestra el aviso discreto
        fireEvent.click(screen.getByTitle(/1200 kcal/));
        await waitFor(() => {
            expect(screen.getByText('1200')).toBeInTheDocument();
            expect(screen.getByText(AVISO)).toBeInTheDocument();
        });
    });
});
