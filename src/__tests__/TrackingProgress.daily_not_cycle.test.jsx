// [P1-DAILY-NOT-CYCLE · 2026-07-28] Antes este archivo se llamaba
// `TrackingProgress.plan_cycle_reset.test.jsx` y ANCLABA el bug: esperaba que
// una comida registrada antes de `cycle_start_date` desapareciera del card
// "Progreso en Tiempo Real". Verificado en producción: el owner desayunó
// (750 kcal, `consumed_at` 17:44 UTC) y renovó su plan a las 18:41 UTC — 57
// minutos después, MISMO día local. El card mostró "0 comidas registradas
// hoy", 0/2050 kcal. La fila nunca se borró de la DB — el card la escondía.
//
// Por qué esto NUNCA puede ser correcto: el card es day-scoped en TODAS las
// demás dimensiones (título, subtítulo "N comidas registradas hoy", estado
// vacío, denominador = meta de UN día completo). Y el endpoint que lo
// alimenta (`backend/routers/diary.py` → `db_facts.get_consumed_meals_today`)
// YA acota a `consumed_at >= <inicio del día local> AND < <fin del día
// local>` — confirmado leyendo `db_facts.py:741-745`. El filtro adicional por
// `cycle_start_date`/`created_at` en el frontend era un paso estrictamente
// SUSTRACTIVO sobre un conjunto ya correcto: nunca podía agregar una comida
// que no debiera estar, solo esconder una que sí debía.
//
// Este archivo invierte los dos casos originales (ahora deben CONTAR todas
// las comidas de hoy, sin importar `cycle_start_date`/`created_at`), añade el
// caso de producción como fixture, y ancla dos invariantes nuevas: la cache
// key ya no varía con `cycle_start_date` (misma key para el mismo user+día
// aunque el plan cambie) y el sweep de keys huérfanas funciona.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TrackingProgress from '../components/dashboard/TrackingProgress';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(),
}));

vi.mock('../components/dashboard/ScanMealModal', () => ({
    default: () => null,
}));

const _PLAN_DATA = {
    calories: 2100,
    macros: { protein: 125, carbs: 269, fats: 58 },
};

describe('TrackingProgress cuenta el día, no el ciclo del plan', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(fetchWithAuth).mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('cuenta TODAS las comidas de hoy que devuelve el backend, aunque una sea anterior a cycle_start_date', async () => {
        // Antes (invertido): esperaba solo la comida posterior a cycle_start_date
        // (200 kcal) y explícitamente rechazaba ver la de 955 kcal combinada.
        // Ahora: el backend ya filtró por día — ambas comidas de "hoy" cuentan,
        // sin importar que una haya sido registrada antes de que el usuario
        // renovara el plan a mitad del día.
        vi.mocked(fetchWithAuth).mockResolvedValue({
            json: async () => ({
                totals: {
                    calories: 955,
                    protein: 33,
                    carbs: 92,
                    healthy_fats: 45,
                },
                meals: [
                    {
                        meal_name: 'Comida antes de renovar',
                        calories: 755,
                        protein: 25,
                        carbs: 70,
                        healthy_fats: 35,
                        consumed_at: '2026-07-12T10:00:00.000Z',
                    },
                    {
                        meal_name: 'Comida después de renovar',
                        calories: 200,
                        protein: 8,
                        carbs: 22,
                        healthy_fats: 10,
                        consumed_at: '2026-07-12T12:30:00.000Z',
                    },
                ],
            }),
        });

        const { container } = render(
            <TrackingProgress
                userId="user-1"
                planData={{
                    ..._PLAN_DATA,
                    cycle_start_date: '2026-07-12T12:00:00.000Z',
                }}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('2 comidas registradas hoy')).toBeInTheDocument();
        });

        expect(container).toHaveTextContent(/955\s*\/\s*2100 kcal/);
        expect(container).not.toHaveTextContent(/200\s*\/\s*2100 kcal/);
    });

    it('NO arranca en cero cuando la única comida de hoy es anterior a created_at del plan', async () => {
        // Antes (invertido): esperaba "0 comidas registradas hoy" — la comida de
        // 955 kcal quedaba invisible por ser anterior a `created_at`. Ese era
        // exactamente el modo de fallo: una fila viva en la DB, inalcanzable
        // desde el botón de borrar (P1-DIARY-EDITABLE) porque éste solo puede
        // apuntar a filas que el card renderiza.
        vi.mocked(fetchWithAuth).mockResolvedValue({
            json: async () => ({
                totals: {
                    calories: 955,
                    protein: 33,
                    carbs: 92,
                    healthy_fats: 45,
                },
                meals: [
                    {
                        meal_name: 'Comida antes de renovar',
                        calories: 955,
                        protein: 33,
                        carbs: 92,
                        healthy_fats: 45,
                        consumed_at: '2026-07-12T10:00:00.000Z',
                    },
                ],
            }),
        });

        const { container } = render(
            <TrackingProgress
                userId="user-1"
                planData={{
                    ..._PLAN_DATA,
                    created_at: '2026-07-12T12:00:00.000Z',
                }}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('1 comida registrada hoy')).toBeInTheDocument();
        });

        expect(container).toHaveTextContent(/955\s*\/\s*2100 kcal/);
        expect(container).not.toHaveTextContent(/0\s*\/\s*2100 kcal/);
    });

    it('caso de producción: desayuno a las 17:44 UTC + renovación 57 min después (18:41 UTC), mismo día local — sigue contando 1 comida, 750 kcal', async () => {
        // Reproduce el reporte exacto: tz offset 240 (UTC-4, RD). El fetch está
        // mockeado por completo (no ejecuta el cálculo de tzOffset real del
        // componente), así que lo que importa aquí es que `cycle_start_date`
        // quede DESPUÉS de `consumed_at` — la condición que antes vaciaba el card.
        vi.mocked(fetchWithAuth).mockResolvedValue({
            json: async () => ({
                totals: { calories: 750, protein: 40, carbs: 60, healthy_fats: 20 },
                meals: [
                    {
                        meal_name: 'Desayuno',
                        calories: 750,
                        protein: 40,
                        carbs: 60,
                        healthy_fats: 20,
                        consumed_at: '2026-07-27T17:44:00.000Z',
                    },
                ],
            }),
        });

        const { container } = render(
            <TrackingProgress
                userId="user-prod"
                planData={{
                    ..._PLAN_DATA,
                    calories: 2050,
                    cycle_start_date: '2026-07-27T18:41:00.000Z',
                }}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('1 comida registrada hoy')).toBeInTheDocument();
        });

        // Nota: NO se agrega un `not.toHaveTextContent(/0\s*\/\s*2050 kcal/)` —
        // "750" termina en "0", así que ese regex coincidiría como substring de
        // "750/ 2050 kcal" (falso positivo de matcher, no del componente). La
        // aserción positiva de arriba + `getByText('1 comida registrada hoy')`
        // (exact single-node match) ya prueban que NO quedó en 0.
        expect(container).toHaveTextContent(/750\s*\/\s*2050 kcal/);
    });

    it('la cache key NO varía con cycle_start_date — mismo user + mismo día + plan distinto → misma key', async () => {
        vi.mocked(fetchWithAuth).mockResolvedValue({
            json: async () => ({
                totals: { calories: 300, protein: 10, carbs: 30, healthy_fats: 8 },
                meals: [{
                    meal_name: 'Merienda',
                    calories: 300,
                    protein: 10,
                    carbs: 30,
                    healthy_fats: 8,
                    consumed_at: new Date().toISOString(),
                }],
            }),
        });

        const { unmount } = render(
            <TrackingProgress userId="user-2" planData={{ ..._PLAN_DATA, cycle_start_date: '2026-01-01T00:00:00.000Z' }} />
        );
        await waitFor(() => {
            expect(screen.getByText('1 comida registrada hoy')).toBeInTheDocument();
        });
        // [P1-CACHE-ASSERT-RACE · 2026-08-09] Dentro de `waitFor`: la key la
        // escribe un `useEffect` de persistencia, y el `waitFor` de arriba solo
        // garantiza el DOM. Leer localStorage una vez y de forma SÍNCRONA tras
        // una espera gateada por el DOM es una carrera por construcción — bajo
        // carga paralela caía ~1 de cada 4 corridas completas. La aserción no se
        // debilita: sigue exigiendo exactamente 1 key.
        let firstKey;
        await waitFor(() => {
            const keys = Object.keys(localStorage).filter((k) => k.startsWith('mealfit_tracking_consumed_'));
            expect(keys).toHaveLength(1);
            firstKey = keys[0];
        });
        unmount();

        // Mismo user, mismo día — plan distinto (otro cycle_start_date, como
        // sería tras una renovación).
        render(
            <TrackingProgress userId="user-2" planData={{ ..._PLAN_DATA, cycle_start_date: '2026-06-15T00:00:00.000Z' }} />
        );
        await waitFor(() => {
            expect(screen.getByText('1 comida registrada hoy')).toBeInTheDocument();
        });
        // [P1-CACHE-ASSERT-RACE] Ídem que arriba — y aquí importa el doble,
        // porque es la aserción que da nombre al test.
        await waitFor(() => {
            const keys = Object.keys(localStorage).filter((k) => k.startsWith('mealfit_tracking_consumed_'));
            expect(keys).toHaveLength(1);
            expect(keys[0]).toBe(firstKey);
        });
    });

    it('el sweep al montar borra una key huérfana con prefijo viejo sin tocar la key fresca del render actual', async () => {
        // Simula una key sobrante de ANTES de este fix (llevaba un segmento de
        // ciclo de plan codificado). Nunca podrá coincidir con la key fresca
        // que calcula el componente hoy (userId + fecha real), así que el
        // sweep debe eliminarla.
        localStorage.setItem(
            'mealfit_tracking_consumed_user-3_2020-01-01_old-cycle-segment',
            JSON.stringify({ calories: 0, protein: 0, carbs: 0, fats: 0, meals: [], _fetched: true })
        );

        vi.mocked(fetchWithAuth).mockResolvedValue({
            json: async () => ({
                totals: { calories: 500, protein: 20, carbs: 50, healthy_fats: 15 },
                meals: [{
                    meal_name: 'Almuerzo',
                    calories: 500,
                    protein: 20,
                    carbs: 50,
                    healthy_fats: 15,
                    consumed_at: new Date().toISOString(),
                }],
            }),
        });

        render(<TrackingProgress userId="user-3" planData={_PLAN_DATA} />);

        await waitFor(() => {
            expect(screen.getByText('1 comida registrada hoy')).toBeInTheDocument();
        });

        // [P1-CACHE-ASSERT-RACE] El sweep y la escritura de la key fresca son
        // dos efectos; el DOM no da fe de ninguno de los dos.
        await waitFor(() => {
            const prefixedKeys = Object.keys(localStorage).filter((k) => k.startsWith('mealfit_tracking_consumed_'));
            expect(prefixedKeys).toHaveLength(1);
            expect(prefixedKeys[0]).not.toBe('mealfit_tracking_consumed_user-3_2020-01-01_old-cycle-segment');
        });
    });
});
