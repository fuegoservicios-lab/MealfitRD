/**
 * [P1-PLAN-LOTE-1161 · 2026-11-22] «Tu semana» con el juego por puntos: rango con división y barra, marcador de hoy
 * (puntos en vivo con el multiplicador de la racha, escudos y logros) y estrellas por puntos.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import { fetchWithAuth } from '../config/api';
import SemanaEnProgreso from '../components/dashboard/SemanaEnProgreso';

const fila = (date, calories) => ({ date, calories, protein: 100, carbs: 200, healthy_fats: 60, meals_count: 3, target_calories: 2000 });
const RESUMEN = {
    dia_1: '2026-09-15', semana_1_empieza: '2026-09-13', hoy: '2026-11-18',
    semana: {
        numero: 10, empieza: '2026-11-15', termina: '2026-11-21', dia: 4, dias_en_meta: 1, dias_registrados: 3, estrellas: 1,
        faltan_para_otra_estrella: 2, puntos: 140, faltan_puntos_para_otra_estrella: 30,
        dias: [
            { iso: '2026-11-15', puntos: 0, estado: 'vacio', escudo: true },
            { iso: '2026-11-16', puntos: 50, estado: 'pasado' },
            { iso: '2026-11-17', puntos: 55, estado: 'meta' },
            { iso: '2026-11-18', puntos: 0, estado: 'vacio' },
            { iso: '2026-11-19', puntos: null, estado: null },
            { iso: '2026-11-20', puntos: null, estado: null },
            { iso: '2026-11-21', puntos: null, estado: null },
        ],
    },
    racha: 8, racha_hasta_ayer: 8, mejor_racha: 12, racha_tramo: { mult: 1.3, clave: 'en_llamas' },
    escudos: 2, escudos_max: 2, escudos_usados: ['2026-11-15'],
    hoy_puntos: { puntos: 0, base: 0, mult: 1.3, logros: { registro: false, completo: false, banda: false, proteina: false, proteina_parcial: false, agua: null } },
    puntos: { total: 960, semana: 140, record_dia: 50 },
    total: { semanas: 10, estrellas: 9, puntos: 960, semanas_perfectas: 0, dias_en_meta: 21 },
    rango: { clave: 'plata', division: 1, siguiente: { clave: 'plata', division: 2 }, puntos_para_la_siguiente: 40, avance: 0.87, estrellas_para_el_siguiente: null },
    eventos: [], eventos_de_hoy: [],
};

const respuestas = (resumen) => async (url) => {
    if (String(url).startsWith('/api/progress/summary/')) return { ok: true, json: async () => resumen };
    if (String(url).startsWith('/api/progress/weeks/')) return { ok: true, json: async () => ({ semanas: [] }) };
    return { ok: true, json: async () => ({ days: [fila('2026-11-17', 2000), fila('2026-11-16', 2600)] }) };
};

describe('[1161] la tarjeta de la semana por puntos', () => {
    beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 18, 15, 0, 0)); });
    afterAll(() => { vi.useRealTimers(); });
    beforeEach(() => { window.localStorage.clear(); fetchWithAuth.mockReset(); fetchWithAuth.mockImplementation(respuestas(RESUMEN)); });

    const montar = (hoy) => render(
        <SemanaEnProgreso userId="u-1" hoy={hoy} targetCalories={2000} targetMacros={{ protein: 120, carbs: 200, fats: 60 }} />,
    );

    it('hoy registrado: puntos en vivo con ×1.3, la división sube, nuevo récord y estrellas por puntos', async () => {
        montar({ calories: 1900, protein: 110, carbs: 200, fats: 60, mealsCount: 3 });
        // 45 base × 1.3 (racha 9) = 59; total 960 + 59 = 1019 ⇒ Plata III (1000-1350), 331 pts para Plata II
        expect(await screen.findByText('Plata III')).toBeInTheDocument();
        expect(screen.getByText('331 pts para Plata II')).toBeInTheDocument();
        const llama = screen.getByRole('button', { name: /9 días seguidos registrando, multiplicador ×1\.3, 2 escudos de racha/ });
        expect(llama).toBeInTheDocument();
        expect(screen.getByText('En llamas')).toBeInTheDocument();
        expect(screen.getByText('2/2')).toBeInTheDocument();
        expect(screen.getByText('Tu racha multiplica ×1.3 tus puntos de hoy')).toBeInTheDocument();
        expect(screen.getByText('¡Nuevo récord!')).toBeInTheDocument();
        // semana: 140 − 0 + 59 = 199 ⇒ 2 ★ (faltan 21 pts para 3.ª estrella @ 220)
        expect(screen.getByText('199')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: '2 de 3 estrellas' })).toBeInTheDocument();
        expect(screen.getByText('Faltan 21 pts para tu 3.ª estrella')).toBeInTheDocument();
    });

    it('logros: muestran los puntos multiplicados, progreso parcial y el ahorro de 0★ dice primera estrella', async () => {
        const resCero = {
            ...RESUMEN,
            semana: { ...RESUMEN.semana, puntos: 0, estrellas: 0, dias: RESUMEN.semana.dias.map((d) => ({ ...d, puntos: 0 })) },
            puntos: { total: 400, semana: 0, record_dia: 55 },
        };
        fetchWithAuth.mockImplementation(respuestas(resCero));
        montar({ calories: 900, protein: 40, carbs: 90, fats: 30, mealsCount: 2 });
        const lista = await screen.findByRole('list', { name: 'Logros de hoy' });
        const items = within(lista).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'));
        expect(items).toEqual([
            'Registrar: conseguido',
            'Día completo: +7 puntos si lo consigues',
            'Calorías en meta: +26 puntos si lo consigues',
            'Proteína: +13 puntos si lo consigues',
            'Día perfecto: +13 puntos si lo consigues',
        ]);
        expect(screen.getByText('Faltan 60 pts para tu primera estrella')).toBeInTheDocument();
    });

    it('nunca baja de división en el día aunque en la cena se pase de calorías', async () => {
        const { rerender } = montar({ calories: 1900, protein: 110, carbs: 200, fats: 60, mealsCount: 3 });
        expect(await screen.findByText('Plata III')).toBeInTheDocument();
        rerender(<SemanaEnProgreso userId="u-1" hoy={{ calories: 2800, protein: 110, carbs: 320, fats: 90, mealsCount: 4 }} targetCalories={2000} targetMacros={{ protein: 120, carbs: 200, fats: 60 }} />);
        expect(screen.getByText('Plata III')).toBeInTheDocument();
    });

    it('escudo salvó un día pasado: lo marca en la tira y lo explica al tocarlo', async () => {
        montar({ calories: 0, protein: 0, mealsCount: 0 });
        const diaSalvado = await screen.findByRole('button', { name: /Escudo protegió tu racha/ });
        fireEvent.click(diaSalvado);
        expect(await screen.findByText('Un escudo protegió tu racha este día.')).toBeInTheDocument();
    });

    it('con un resumen de AYER: su racha entera es la de hasta ayer y sus puntos de «hoy» no se restan', async () => {
        const deAyer = { ...RESUMEN, hoy: '2026-11-17', racha: 9, racha_hasta_ayer: 8, hoy_puntos: { ...RESUMEN.hoy_puntos, puntos: 55 } };
        fetchWithAuth.mockImplementation(respuestas(deAyer));
        montar({ calories: 1900, protein: 110, carbs: 200, fats: 60, mealsCount: 3 });
        // racha 9 (hasta ayer) + hoy = 10 ⇒ ×1.3 · 59 pts; total 960 + 59 = 1019 ⇒ Plata III, 331 pts para Plata II
        expect(await screen.findByRole('button', { name: /10 días seguidos registrando/ })).toBeInTheDocument();
        expect(screen.getByText('Plata III')).toBeInTheDocument();
        expect(screen.getByText('331 pts para Plata II')).toBeInTheDocument();
    });

    it('cada día cerrado de la semana enseña sus puntos y avisa por la tarde si llevas 0 pts', async () => {
        vi.setSystemTime(new Date(2026, 10, 18, 19, 0, 0));
        montar({ calories: 0, protein: 0, mealsCount: 0 });
        expect(await screen.findByText('+55')).toBeInTheDocument();
        expect(screen.getByText('+50')).toBeInTheDocument();
        expect(screen.getByText('Registra hoy para no gastar un escudo (×1.3).')).toBeInTheDocument();
        const lista = screen.getByRole('list', { name: 'Logros de hoy' });
        expect(within(lista).getByLabelText('Calorías en meta: +26 puntos si lo consigues')).toBeInTheDocument();
        vi.setSystemTime(new Date(2026, 10, 18, 15, 0, 0));
    });
});
