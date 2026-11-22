/**
 * [P1-PLAN-LOTE-1161 · 2026-11-22] «Tu semana» con el juego por puntos: rango con división y barra, marcador de hoy
 * (puntos en vivo con el multiplicador de la racha, escudos y logros) y estrellas por puntos.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import { fetchWithAuth } from '../config/api';
import SemanaEnProgreso from '../components/dashboard/SemanaEnProgreso';

const fila = (date, calories) => ({ date, calories, protein: 100, carbs: 200, healthy_fats: 60, meals_count: 3, target_calories: 2000 });
const RESUMEN = {
    dia_1: '2026-09-15', semana_1_empieza: '2026-09-13', hoy: '2026-11-18',
    semana: {
        numero: 10, empieza: '2026-11-15', termina: '2026-11-21', dia: 4, dias_en_meta: 1, dias_registrados: 3, estrellas: 1,
        faltan_para_otra_estrella: 2, puntos: 150, faltan_puntos_para_otra_estrella: 10,
        dias: [
            { iso: '2026-11-15', puntos: 45, estado: 'bajo' }, { iso: '2026-11-16', puntos: 50, estado: 'pasado' },
            { iso: '2026-11-17', puntos: 55, estado: 'meta' }, { iso: '2026-11-18', puntos: 0, estado: 'vacio' },
            { iso: '2026-11-19', puntos: null, estado: null }, { iso: '2026-11-20', puntos: null, estado: null },
            { iso: '2026-11-21', puntos: null, estado: null },
        ],
    },
    racha: 8, racha_hasta_ayer: 8, mejor_racha: 12, racha_tramo: { mult: 1.5, clave: 'en_llamas' },
    escudos: 2, escudos_max: 2,
    hoy_puntos: { puntos: 0, base: 0, mult: 1.5, logros: { registro: false, completo: false, banda: false, proteina: false, agua: null } },
    puntos: { total: 940, semana: 150, record_dia: 55 },
    total: { semanas: 10, estrellas: 9, puntos: 940, semanas_perfectas: 0, dias_en_meta: 21 },
    rango: { clave: 'plata', division: 1, siguiente: { clave: 'plata', division: 2 }, puntos_para_la_siguiente: 60, avance: 0.85, estrellas_para_el_siguiente: null },
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

    it('hoy registrado: puntos en vivo con ×1,5, la división sube y las estrellas salen de los puntos', async () => {
        montar({ calories: 1900, protein: 110, carbs: 200, fats: 60, mealsCount: 3 });
        // (es-DO escribe 1.5) 40 base × 1,5 (racha 9) = 60; total 940 + 60 = 1000 ⇒ Plata II, 400 pts para Plata III
        expect(await screen.findByText('Plata II')).toBeInTheDocument();
        expect(screen.getByText('400 pts para Plata III')).toBeInTheDocument();
        const llama = screen.getByRole('button', { name: /9 días seguidos registrando, multiplicador ×1\.5, 2 escudos de racha/ });
        expect(llama).toBeInTheDocument();
        expect(screen.getByText('Tu racha multiplica ×1.5 tus puntos de hoy')).toBeInTheDocument();
        // semana: 150 − 0 + 60 = 210 ⇒ 2 ★
        expect(screen.getByText('210')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: '2 de 3 estrellas' })).toBeInTheDocument();
        expect(screen.getByText('Faltan 50 pts para otra estrella')).toBeInTheDocument();
    });

    it('logros: los cumplidos encendidos; los pendientes dicen cuánto dan; sin agua no hay chip', async () => {
        montar({ calories: 900, protein: 40, carbs: 90, fats: 30, mealsCount: 2 });
        const lista = await screen.findByRole('list', { name: 'Logros de hoy' });
        const items = within(lista).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'));
        expect(items).toEqual([
            'Registrar: conseguido',
            '3 comidas: +5 puntos si lo consigues',
            'Calorías en meta: +15 puntos si lo consigues',
            'Proteína: +10 puntos si lo consigues',
        ]);
    });

    it('con un resumen de AYER: su racha entera es la de hasta ayer y sus puntos de «hoy» no se restan', async () => {
        const deAyer = { ...RESUMEN, hoy: '2026-11-17', racha: 9, racha_hasta_ayer: 8, hoy_puntos: { ...RESUMEN.hoy_puntos, puntos: 55 } };
        fetchWithAuth.mockImplementation(respuestas(deAyer));
        montar({ calories: 1900, protein: 110, carbs: 200, fats: 60, mealsCount: 3 });
        // racha 9 (hasta ayer) + hoy = 10 ⇒ ×1,5 · 60 pts; total 940 + 60 = 1000 (no se resta el 55 de ayer)
        expect(await screen.findByRole('button', { name: /10 días seguidos registrando/ })).toBeInTheDocument();
        expect(screen.getByText('Plata II')).toBeInTheDocument();
        expect(screen.getByText('400 pts para Plata III')).toBeInTheDocument();
    });

    it('cada día cerrado de la semana enseña sus puntos', async () => {
        montar({ calories: 0, protein: 0, mealsCount: 0 });
        expect(await screen.findByText('+55')).toBeInTheDocument();
        expect(screen.getByText('+45')).toBeInTheDocument();
    });
});
