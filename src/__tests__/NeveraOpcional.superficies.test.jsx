// [P1-NEVERA-OPCIONAL · 2026-09-23 · Tarea F6] Escáner, registro manual, bienvenida del Agente y ayuda: las
// cuatro superficies que aún mencionaban la Nevera pierden esas menciones cuando el usuario la apagó (modo
// contador, Configuración → Capacidades apagada a mano o automáticamente tras 48 h vacía).
//
// Por qué este archivo y no uno de los que ya existen:
//   · `NeveraOpcional.contract.test.jsx` monta el Settings REAL con mocks a nivel de archivo (servidor falso,
//     sonner, TrackingProgress, WaterTracker) — un `vi.mock` de módulo de AssessmentContext ahí rompería ese
//     montaje. Este archivo usa en cambio `customContext` de `./utils/test-utils` (el mismo patrón que
//     `LogMealModal.p1_manual_food_log.test.jsx`), que sólo espía `useAssessment` por render.
//   · `generateIntelligentWelcome` es una función pura ya exportada (P1-AGENT-WELCOME-TRACKING): no hace falta
//     montar nada, así que su prueba vive aquí también en vez de en un archivo de fuente-como-texto.
//     `getSuggestions` NO se exporta a propósito — exportarla dispara `react-refresh/only-export-components`
//     (archivo mixto componente+helper) y el mandato de esta tarea es cero warnings nuevos; se prueba por fuente.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import LogMealModal from '../components/dashboard/LogMealModal';
import { fetchWithAuth } from '../config/api';
import { _resetPantryCacheForTests, setCachedMasterList, setCachedDishes } from '../utils/pantryCache';
import { generateIntelligentWelcome } from '../pages/AgentPage';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const leer = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const FOODS = [
    { id: '11', name: 'Arroz blanco', aliases: [], kcal_per_100g: 358.6, protein_g_per_100g: 7, carbs_g_per_100g: 80.3, fats_g_per_100g: 1,
      portions: [{ unit: 'g', grams_per_qty: 1, label: 'g', default: true }] },
];
const respuesta = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

// ── LogMealModal: el interruptor de la Nevera sigue al perfil, no a un estado propio ──────────────────────────────
// [Final fix wave] Los perfiles llevan `plan_mode: 'tracking'`: fuera del modo contador `neveraActiva` devuelve
// `true` siempre (la Nevera solo se apaga en modo contador), así que un perfil sin modo ya no la apaga.
describe('[P1-NEVERA-OPCIONAL] LogMealModal — el interruptor de la Nevera', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetPantryCacheForTests();
        setCachedMasterList(FOODS);
        setCachedDishes([]);
        fetchWithAuth.mockImplementation(async (url) => {
            if (String(url).includes('/api/diary/foods/frequent')) return respuesta({ items: [] });
            return respuesta({ success: true, totals: { kcal: 397 }, lines: [] });
        });
    });

    const agregarArroz = async (user) => {
        await user.type(screen.getByLabelText('Buscar alimento'), 'arroz');
        await user.click(await screen.findByText('Arroz blanco'));
    };

    it('con nevera_activa: false, el interruptor no se pinta', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={vi.fn()} />, { customContext: { userProfile: { plan_mode: 'tracking', nevera_activa: false } } });
        await agregarArroz(user);
        expect(screen.getByText('Tu plato')).toBeInTheDocument();
        expect(screen.queryByText('Descontar de mi Nevera')).toBeNull();
    });

    it('con nevera_activa: true, el interruptor existe', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={vi.fn()} />, { customContext: { userProfile: { plan_mode: 'tracking', nevera_activa: true } } });
        await agregarArroz(user);
        expect(screen.getByText('Descontar de mi Nevera')).toBeInTheDocument();
    });

    it('sin Nevera, el POST nunca pide la resta (aunque el estado interno quedara en `true`)', async () => {
        const user = userEvent.setup();
        render(<LogMealModal onClose={vi.fn()} />, { customContext: { userProfile: { plan_mode: 'tracking', nevera_activa: false } } });
        await agregarArroz(user);
        await user.click(screen.getByRole('button', { name: 'Registrar' }));
        await waitFor(() => {
            const post = fetchWithAuth.mock.calls.find(([u, o]) => String(u).includes('/consumed/manual') && o?.method === 'POST');
            expect(post, 'no salió el POST del componedor').toBeTruthy();
            expect(JSON.parse(post[1].body).deduct_pantry).toBe(false);
        });
    });
});

// ── HelpChatWidget: getSuggestions (fuente — no exportada, ver nota de cabecera) ───────────────────────────────────
describe('[P1-NEVERA-OPCIONAL] HelpChatWidget.getSuggestions — filtra «¿Para qué sirve la Nevera?»', () => {
    const w = leer('src/components/dashboard/HelpChatWidget.jsx');

    it('el helper acepta `nevera` (default true) y solo agrega la sugerencia cuando está activa', () => {
        expect(w).toContain('const getSuggestions = (t, contador = false, nevera = true) => {');
        expect(w).toContain("...(nevera ? [t('¿Para qué sirve la Nevera?')] : []),");
    });

    it('la rama de contador sigue intacta (no se pisaron al añadir la de Nevera)', () => {
        expect(w).toContain("if (contador) return [t('¿Cómo registro lo que como?'), ...base];");
    });

    it('el llamador real pasa neveraActiva(null), igual que ya obtiene isTrackingMode(null)', () => {
        expect(w).toContain('getSuggestions(t, isTrackingMode(null), neveraActiva(null))');
    });
});

// ── AgentPage: generateIntelligentWelcome — la variante de almuerzo sin plato ──────────────────────────────────────
describe('[P1-NEVERA-OPCIONAL] generateIntelligentWelcome — el almuerzo sin plato respeta la Nevera', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.useFakeTimers();
        // Hora fija dentro de la franja de almuerzo (12:00-15:00); el día es irrelevante porque `planData` es
        // `null` en estos casos (no hay plato exacto que recitar, así que cae siempre a las variantes genéricas).
        vi.setSystemTime(new Date(2026, 8, 23, 13, 0, 0));
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // El saludo completo es `${timeGreeting}${firstName}! ${mealContext}` (P1-WELCOME-TEST-CLOCK): se comprueba
    // el mealContext por `toContain`, no por igualdad exacta del saludo entero.
    it('con la Nevera activa, la variante puede mencionarla', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99); // fuerza la 3ª (última) variante del array de 3
        const saludo = generateIntelligentWelcome({ id: 'u1', plan_mode: 'tracking', nevera_activa: true }, {}, null);
        expect(saludo).toContain('¿Necesitas ideas para tu comida del mediodía? Dime qué hay en tu nevera.');
    });

    it('con la Nevera apagada, no la menciona', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        const saludo = generateIntelligentWelcome({ id: 'u1', plan_mode: 'tracking', nevera_activa: false }, {}, null);
        expect(saludo).toContain('¿Necesitas ideas para tu comida del mediodía? Cuéntame qué se te antoja.');
        expect(saludo.toLowerCase()).not.toContain('nevera');
    });

    it('sin perfil (invitado), la Nevera se asume activa: no rompe el saludo por defecto', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        const saludo = generateIntelligentWelcome(null, {}, null);
        expect(saludo).toContain('¿Necesitas ideas para tu comida del mediodía? Dime qué hay en tu nevera.');
    });
});

// ── ScanMealModal: fuente (el brief acepta pin de fuente para este archivo) ────────────────────────────────────────
describe('[P1-NEVERA-OPCIONAL] ScanMealModal — fuente', () => {
    it('consulta el mismo SSOT que la nav y tiene el aviso sin Nevera', () => {
        const src = leer('src/components/dashboard/ScanMealModal.jsx');
        expect(src).toContain('neveraActiva(');
        expect(src).toContain('Fotografía el plato ya servido para registrarlo.');
    });
});
