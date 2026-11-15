/**
 * [SEMANA-EN-PROGRESO · 2026-11-15] «Tu semana»: el progreso de los días a la vista en la pestaña Progreso.
 * El dueño: «que el usuario pueda ver el progreso de los días desde afuera, qué día ha completado».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import { fetchWithAuth } from '../config/api';
import SemanaEnProgreso from '../components/dashboard/SemanaEnProgreso';
import { getBiologicalDateStr } from '../utils/diaBiologico';
import {
    construirDias, diasEnMetaDeLaSemana, estadoDelDia, rachaEnMeta, ultimosDias,
} from '../utils/progresoDeLosDias';

const HOY = '2026-11-15';
const fila = (date, calories, extra = {}) => ({ date, calories, protein: 100, carbs: 200, healthy_fats: 60, meals_count: 3, ...extra });

describe('[SEMANA-EN-PROGRESO] las cuentas de los días', () => {
    it('la tira son los n días que terminan en hoy, sin saltos al cruzar de mes', () => {
        expect(ultimosDias('2026-11-02', 4)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
        expect(ultimosDias(HOY)).toHaveLength(14);
    });

    it('día completado = la misma banda que la barra de calorías de hoy', () => {
        expect(estadoDelDia({ calories: 0, mealsCount: 0, target: 2000 })).toBe('vacio');
        expect(estadoDelDia({ calories: 1500, mealsCount: 2, target: 2000 })).toBe('bajo');
        expect(estadoDelDia({ calories: 2000, mealsCount: 3, target: 2000 })).toBe('meta');
        expect(estadoDelDia({ calories: 2431, mealsCount: 5, target: 2050 })).toBe('pasado');
        // perdiendo grasa la banda es 80–105 %: 1.650 de 2.000 ya cuenta
        expect(estadoDelDia({ calories: 1650, mealsCount: 3, target: 2000, mainGoal: 'lose_fat' })).toBe('meta');
    });

    it('cada día se juzga con SU meta, y hoy con lo que la tarjeta tiene en vivo', () => {
        const dias = construirDias({
            hoyISO: HOY,
            filas: [fila('2026-11-14', 1800, { target_calories: 1800 }), fila(HOY, 100)],
            hoy: { calories: 2050, protein: 150, carbs: 210, fats: 70, mealsCount: 4 },
            targetCalories: 2050,
        });
        const ayer = dias.find((d) => d.iso === '2026-11-14');
        expect(ayer.estado).toBe('meta');           // con la meta de hoy (2.050) habría sido «bajo»
        expect(ayer.target).toBe(1800);
        const hoy = dias[dias.length - 1];
        expect(hoy).toMatchObject({ esHoy: true, calories: 2050, mealsCount: 4, estado: 'meta' });
        expect(dias[0].estado).toBe('vacio');       // sin fila en el endpoint = sin registros
    });

    it('hoy en curso no rompe la racha; un día fallado sí', () => {
        const base = { hoyISO: HOY, targetCalories: 2000 };
        const tres = [fila('2026-11-12', 2000), fila('2026-11-13', 2000), fila('2026-11-14', 2000)];
        const enCurso = construirDias({ ...base, filas: tres, hoy: { calories: 600, mealsCount: 1 } });
        expect(rachaEnMeta(enCurso)).toBe(3);
        const cumplido = construirDias({ ...base, filas: tres, hoy: { calories: 2000, mealsCount: 3 } });
        expect(rachaEnMeta(cumplido)).toBe(4);
        const roto = construirDias({ ...base, filas: [tres[0], fila('2026-11-13', 900), tres[2]], hoy: { calories: 0, mealsCount: 0 } });
        expect(rachaEnMeta(roto)).toBe(1);
        expect(diasEnMetaDeLaSemana(roto)).toBe(2);
    });
});

describe('[SEMANA-EN-PROGRESO] la tira en pantalla', () => {
    const hoyISO = getBiologicalDateStr(new Date());
    const [ayerISO, anteayerISO] = [ultimosDias(hoyISO, 3)[1], ultimosDias(hoyISO, 3)[0]];

    beforeEach(() => {
        window.localStorage.clear();
        fetchWithAuth.mockReset();
        fetchWithAuth.mockResolvedValue({
            ok: true,
            json: async () => ({ days: [fila(ayerISO, 2000, { target_calories: 2000 }), fila(anteayerISO, 2600, { target_calories: 2000 })] }),
        });
    });

    const montar = (props = {}) => render(
        <SemanaEnProgreso
            userId="u-1"
            hoy={{ calories: 900, protein: 60, carbs: 90, fats: 30, mealsCount: 2 }}
            targetCalories={2000}
            targetMacros={{ protein: 150, carbs: 200, fats: 60 }}
            {...props}
        />,
    );

    it('pinta 14 días, pide el rango al servidor y dice cuántos van en meta', async () => {
        montar();
        expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(14);
        await waitFor(() => expect(screen.getByText('1 de 7 días en meta')).toBeInTheDocument());
        expect(fetchWithAuth).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/diary\/consumed-range\/u-1\?days=14&tzOffset=/));
    });

    it('tocar un día abre su resumen y «Ver este día» lleva al cajón en ESE día', async () => {
        const onAbrirDia = vi.fn();
        montar({ onAbrirDia });
        await waitFor(() => expect(screen.getByText('1 de 7 días en meta')).toBeInTheDocument());
        const botones = screen.getAllByRole('button');
        fireEvent.click(botones[12]);                                   // ayer
        expect(await screen.findByText('Meta cumplida')).toBeInTheDocument();
        expect(screen.getByText('3 comidas')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Ver este día/ }));
        expect(onAbrirDia).toHaveBeenCalledWith(ayerISO);
        fireEvent.click(botones[11]);                                   // anteayer: se pasó
        expect(await screen.findByText('600 kcal de más')).toBeInTheDocument();
        fireEvent.click(botones[13]);                                   // hoy, en curso
        expect(await screen.findByText(/^Te faltan 1[.,]100 kcal$/)).toBeInTheDocument();   // el separador es del locale
    });

    it('lo guardado pinta al instante la próxima vez, aunque no haya red', () => {
        window.localStorage.setItem('mealfit_semana_progreso_u-1', JSON.stringify([fila(ayerISO, 2000, { target_calories: 2000 })]));
        fetchWithAuth.mockRejectedValue(new Error('sin red'));
        montar();
        expect(screen.getByText('1 de 7 días en meta')).toBeInTheDocument();
    });
});

describe('[SEMANA-EN-PROGRESO] cableado', () => {
    const src = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');

    it('la tarjeta de Progreso la monta fuera del ternario vacío/no-vacío y abre el cajón en el día tocado', () => {
        const tp = src('components/dashboard/TrackingProgress.jsx');
        expect(tp).toContain('<SemanaEnProgreso');
        expect(tp.indexOf('<SemanaEnProgreso')).toBeLessThan(tp.indexOf('_todaysMeals.length === 0 ?'));
        expect(tp).toContain('onAbrirDia={(iso) => { setHistoryDia(iso); setHistoryOpen(true); }}');
        expect(tp).toContain('diaInicial={historyDia}');
        expect(tp).toContain('<DiaryHistoryTrigger compacto');
    });

    it('el cajón abre en `diaInicial` y, sin él, en hoy', () => {
        expect(src('components/dashboard/DiaryHistory.jsx'))
            .toContain('if (open) setSelected(diaInicial || getBiologicalDateStr(new Date()));');
    });
});
