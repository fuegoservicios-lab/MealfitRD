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
    construirDias, diasEnMetaDeLaSemana, estadoDelDia, estrellasDeLaSemana, faltanParaLaSiguienteEstrella,
    fechasDeLaSemana, inicioDelViaje, numeroDeSemana, rachaEnMeta, ultimosDias,
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

describe('[SEMANAS-NUMERADAS] semana 1, semana 2… hasta el infinito', () => {
    it('la Semana 1 empieza el primer día con registros; cada 7 días, una nueva', () => {
        const filas = [fila('2026-11-03', 2000), fila('2026-10-28', 2000), fila(HOY, 500)];
        expect(inicioDelViaje(filas, HOY)).toBe('2026-10-28');
        expect(inicioDelViaje([], HOY)).toBe(HOY);                          // sin nada: hoy es el día 1
        expect(inicioDelViaje(filas, HOY, '2025-01-01')).toBe('2025-01-01'); // lo guardado gana si es más viejo
        expect(inicioDelViaje([fila('2027-01-01', 1)], HOY, 'basura')).toBe(HOY);
        expect(numeroDeSemana('2026-10-28', '2026-10-28')).toBe(1);
        expect(numeroDeSemana('2026-10-28', '2026-11-03')).toBe(1);
        expect(numeroDeSemana('2026-10-28', '2026-11-04')).toBe(2);
        expect(numeroDeSemana('2026-10-28', HOY)).toBe(3);
        expect(numeroDeSemana('2020-01-01', HOY)).toBeGreaterThan(350);     // no hay tope
        expect(fechasDeLaSemana('2026-10-28', 2)).toEqual([
            '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10',
        ]);
    });

    it('estrellas: 3, 5 y 7 días en meta', () => {
        expect([0, 2, 3, 4, 5, 6, 7].map(estrellasDeLaSemana)).toEqual([0, 0, 1, 1, 2, 2, 3]);
        expect([0, 2, 3, 5, 6, 7].map(faltanParaLaSiguienteEstrella)).toEqual([3, 1, 2, 2, 1, 0]);
    });

    it('los días de la semana que aún no llegan son «futuro», no fallados', () => {
        const dias = construirDias({ hoyISO: HOY, filas: [], targetCalories: 2000, fechas: fechasDeLaSemana('2026-11-12', 1) });
        expect(dias.map((d) => d.estado)).toEqual(['vacio', 'vacio', 'vacio', 'vacio', 'futuro', 'futuro', 'futuro']);
        expect(dias[3].esHoy).toBe(true);
    });
});

describe('[SEMANA-EN-PROGRESO] la tira en pantalla', () => {
    const hoyISO = getBiologicalDateStr(new Date());
    const [ayerISO, anteayerISO] = [ultimosDias(hoyISO, 3)[1], ultimosDias(hoyISO, 3)[0]];
    const hace9 = ultimosDias(hoyISO, 10)[0];

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
    const diasEnPantalla = () => screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));

    it('pinta la semana entera (7 días), pide el historial y dice cuántos van en meta', async () => {
        montar();
        expect(diasEnPantalla()).toHaveLength(7);
        await waitFor(() => expect(screen.getByText('1 de 7 días en meta')).toBeInTheDocument());
        expect(fetchWithAuth).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/diary\/consumed-range\/u-1\?days=365&tzOffset=/));
        // el primer registro fue anteayer: hoy es el día 3 de la Semana 1 y quedan 4 con candado
        expect(screen.getByRole('heading', { name: 'Semana 1' })).toBeInTheDocument();
        expect(screen.getByText('Día 3 de 7')).toBeInTheDocument();
        expect(diasEnPantalla().filter((b) => b.disabled)).toHaveLength(4);
        expect(screen.getByRole('img', { name: '0 de 3 estrellas' })).toBeInTheDocument();
        expect(screen.getByText('Faltan 2 días en meta para otra estrella')).toBeInTheDocument();
    });

    it('tocar un día abre su resumen y «Ver este día» lleva al cajón en ESE día', async () => {
        const onAbrirDia = vi.fn();
        montar({ onAbrirDia });
        await waitFor(() => expect(screen.getByText('1 de 7 días en meta')).toBeInTheDocument());
        const botones = diasEnPantalla();
        fireEvent.click(botones[1]);                                    // ayer
        expect(await screen.findByText('Meta cumplida')).toBeInTheDocument();
        expect(screen.getByText('3 comidas')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Ver este día/ }));
        expect(onAbrirDia).toHaveBeenCalledWith(ayerISO);
        fireEvent.click(botones[0]);                                    // anteayer: se pasó
        expect(await screen.findByText('600 kcal de más')).toBeInTheDocument();
        fireEvent.click(botones[2]);                                    // hoy, en curso
        expect(await screen.findByText(/^Te faltan 1[.,]100 kcal$/)).toBeInTheDocument();   // el separador es del locale
    });

    it('con más de 7 días de historia hay Semana 2 y las flechas vuelven a la Semana 1', async () => {
        fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ days: [fila(hace9, 2000, { target_calories: 2000 })] }) });
        montar();
        expect(await screen.findByRole('heading', { name: 'Semana 2' })).toBeInTheDocument();
        expect(screen.getByText('Día 3 de 7')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Semana siguiente' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
        expect(await screen.findByRole('heading', { name: 'Semana 1' })).toBeInTheDocument();
        expect(screen.getByText('1 de 7 días en meta')).toBeInTheDocument();
        expect(diasEnPantalla().filter((b) => b.disabled)).toHaveLength(0);       // una semana pasada no tiene candados
        expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeDisabled();
        expect(window.localStorage.getItem('mealfit_semana_inicio_u-1')).toBe(hace9);
    });

    it('lo guardado pinta al instante la próxima vez, aunque no haya red', () => {
        window.localStorage.setItem('mealfit_semana_progreso_u-1', JSON.stringify([fila(ayerISO, 2000, { target_calories: 2000 })]));
        fetchWithAuth.mockRejectedValue(new Error('sin red'));
        montar();
        expect(screen.getByText('1 de 7 días en meta')).toBeInTheDocument();
    });

    it('el «hoy» no late hacia afuera: gira dentro de su hueco (no pisa al día de al lado)', () => {
        const css = readFileSync(resolve(__dirname, '..', 'components/dashboard/SemanaEnProgreso.module.css'), 'utf8');
        const hoy = css.slice(css.indexOf('.diaHoy .anillo::after {'), css.indexOf('}', css.indexOf('.diaHoy .anillo::after {')));
        expect(hoy).toContain('animation: girar');
        expect(css).not.toContain('latido');
        expect(css).toMatch(/@keyframes girar \{ to \{ transform: rotate\(360deg\); \} \}/);
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
