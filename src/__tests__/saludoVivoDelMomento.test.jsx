import React from 'react';
import { render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateIntelligentWelcome } from '../pages/AgentPage';
import {
    momentoDelDia,
    soloAvisoProactivoVencido,
    actualizarMensajePredeterminado,
} from '../utils/saludoDelCoach';
import { useResumenDeHoy } from '../hooks/useResumenDeHoy';

vi.mock('../config/api', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        fetchWithAuth: vi.fn(async () => ({
            ok: true,
            json: async () => ({ meals: [], totals: null, ok: true, calories: 2050, macros: { protein: 134, carbs: 251, fats: 57 } }),
        })),
    };
});

describe('Saludo predeterminado vivo por momento (sin clonar ni variar dentro de la misma franja)', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('momentoDelDia separa cada momento incluyendo merienda AM y merienda PM', () => {
        expect(momentoDelDia(2)).toBe('madrugada');
        expect(momentoDelDia(4)).toBe('desayuno');
        expect(momentoDelDia(10)).toBe('desayuno');
        expect(momentoDelDia(11)).toBe('merienda-am');
        expect(momentoDelDia(13)).toBe('almuerzo');
        expect(momentoDelDia(16)).toBe('merienda-pm');
        expect(momentoDelDia(20)).toBe('cena');
    });

    it('generateIntelligentWelcome mantiene exactamente el mismo mensaje dentro del mismo momento', () => {
        const perfil = { id: 'usr-stable', full_name: 'Angelo Santana', plan_mode: 'tracking' };
        vi.setSystemTime(new Date(2026, 10, 15, 12, 5, 0));
        const aLas1205 = generateIntelligentWelcome(perfil, {}, null, null);
        vi.setSystemTime(new Date(2026, 10, 15, 12, 40, 0));
        const aLas1240 = generateIntelligentWelcome(perfil, {}, null, null);
        vi.setSystemTime(new Date(2026, 10, 15, 14, 50, 0));
        const aLas1450 = generateIntelligentWelcome(perfil, {}, null, null);

        expect(aLas1205).toBe(aLas1240);
        expect(aLas1240).toBe(aLas1450);

        vi.setSystemTime(new Date(2026, 10, 15, 20, 5, 0));
        const aLas2005 = generateIntelligentWelcome(perfil, {}, null, null);
        expect(aLas2005).not.toBe(aLas1450);
    });

    it('actualizarMensajePredeterminado reemplaza in-place al cambiar de momento y nunca clona burbujas', () => {
        const perfil = { id: 'usr-live', full_name: 'Angelo', plan_mode: 'tracking' };

        vi.setSystemTime(new Date(2026, 10, 15, 8, 30, 0));
        const inicial = [{
            role: 'model',
            content: generateIntelligentWelcome(perfil, {}, null, null),
            isWelcome: true,
            welcomeAt: Date.now(),
        }];

        // Misma franja (desayuno 10:15): misma referencia, sin re-render ni clones
        vi.setSystemTime(new Date(2026, 10, 15, 10, 15, 0));
        const mismoMomento = actualizarMensajePredeterminado({
            prev: inicial,
            crearSaludo: () => generateIntelligentWelcome(perfil, {}, null, null),
            ahora: new Date(),
        });
        expect(mismoMomento).toBe(inicial);

        // Pasa a almuerzo (12:30): reemplaza el mismo [0] manteniendo length === 1
        vi.setSystemTime(new Date(2026, 10, 15, 12, 30, 0));
        const enAlmuerzo = actualizarMensajePredeterminado({
            prev: mismoMomento,
            crearSaludo: () => generateIntelligentWelcome(perfil, {}, null, null),
            ahora: new Date(),
        });
        expect(enAlmuerzo).toHaveLength(1);
        expect(enAlmuerzo[0].isWelcome).toBe(true);
        expect(enAlmuerzo[0].content).not.toBe(inicial[0].content);
        expect(enAlmuerzo[0].content).toMatch(/almorz|almuerz/i);

        // Pasa a cena (20:00): vuelve a reemplazar in-place el mismo [0]
        vi.setSystemTime(new Date(2026, 10, 15, 20, 0, 0));
        const enCena = actualizarMensajePredeterminado({
            prev: enAlmuerzo,
            crearSaludo: () => generateIntelligentWelcome(perfil, {}, null, null),
            ahora: new Date(),
        });
        expect(enCena).toHaveLength(1);
        expect(enCena[0].content).toMatch(/cen/i);
    });

    it('reemplaza aviso proactivo previo sin respuesta cuando ya pasó su momento, pero respeta conversación real', () => {
        const desayunoAuto = [{
            id: 'nudge-1',
            role: 'model',
            content: '¡Buenos días! Es hora de desayunar.',
            created_at: new Date(2026, 10, 15, 8, 30, 0).toISOString(),
        }];

        // Todavía en desayuno (09:30): conserva el aviso vigente
        expect(soloAvisoProactivoVencido(desayunoAuto, new Date(2026, 10, 15, 9, 30, 0))).toBe(false);

        // Ya pasó a almuerzo (12:30): lo reemplaza in-place por el saludo de almuerzo
        const almuerzoRef = new Date(2026, 10, 15, 12, 30, 0);
        expect(soloAvisoProactivoVencido(desayunoAuto, almuerzoRef)).toBe(true);
        const actualizado = actualizarMensajePredeterminado({
            prev: desayunoAuto,
            crearSaludo: () => '¡Buenas tardes, Angelo! ¿Qué vas a almorzar?',
            ahora: almuerzoRef,
        });
        expect(actualizado).toHaveLength(1);
        expect(actualizado[0].isWelcome).toBe(true);
        expect(actualizado[0].content).toContain('almorzar');

        // Si el usuario ya escribió, no se toca jamás
        const conUsuario = [
            ...desayunoAuto,
            { role: 'user', content: 'Comí 2 huevos', created_at: new Date(2026, 10, 15, 9, 0, 0).toISOString() },
        ];
        expect(soloAvisoProactivoVencido(conUsuario, almuerzoRef)).toBe(false);
        expect(actualizarMensajePredeterminado({
            prev: conUsuario,
            crearSaludo: () => 'Nuevo',
            ahora: almuerzoRef,
        })).toBe(conUsuario);
    });

    it('useResumenDeHoy limpia totales del día anterior al cruzar las 4:00 AM', async () => {
        // Guardar caché del día biológico anterior (3:45 AM = 2026-11-14) con exceso calórico
        vi.setSystemTime(new Date(2026, 10, 15, 3, 45, 0));
        window.localStorage.setItem('mealfit_resumen_hoy', JSON.stringify({
            uid: 'u-rollover',
            fecha: '2026-11-14',
            resumen: {
                totales: { calories: 3061, protein: 136, carbs: 300, fats: 90 },
                comidas: ['almuerzo'],
                metas: { ok: true, calories: 2050, macros: { protein: 134, carbs: 251, fats: 57 } },
            },
        }));

        function Probe({ userId }) {
            const res = useResumenDeHoy(userId, true);
            return <pre data-testid="resumen">{JSON.stringify(res)}</pre>;
        }

        const { getByTestId } = render(<Probe userId="u-rollover" />);
        expect(JSON.parse(getByTestId('resumen').textContent).totales?.calories).toBe(3061);

        // Cruza las 4:00 AM -> nuevo día biológico 2026-11-15: los totales de ayer deben limpiarse de inmediato
        await act(async () => {
            vi.setSystemTime(new Date(2026, 10, 15, 4, 4, 0));
            vi.advanceTimersByTime(31000);
        });

        expect(JSON.parse(getByTestId('resumen').textContent).totales).toBeNull();
    });
});
