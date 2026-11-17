/**
 * [P1-PLAN-LOTE-1059 · plan 1030/1035 · 2026-11-17] La app lee el juego del SERVIDOR.
 * - El día 1 del servidor manda sobre lo deducido en el teléfono (un teléfono recién instalado cuenta la misma semana).
 * - Sin red, se pinta con lo guardado.
 * - El rango va junto a la insignia; el cierre de semana sale una vez y se marca visto.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import { fetchWithAuth } from '../config/api';
import SemanaEnProgreso from '../components/dashboard/SemanaEnProgreso';
import CierreDeSemana from '../components/dashboard/CierreDeSemana';
import VitrinaDeSemanas from '../components/dashboard/VitrinaDeSemanas';
import { diaUnoDelServidor, leerResumenGuardado } from '../utils/progresoServidor';

const fila = (date, calories) => ({ date, calories, protein: 100, carbs: 200, healthy_fats: 60, meals_count: 3, target_calories: 2000 });
const RESUMEN = {
    dia_1: '2026-09-15', semana_1_empieza: '2026-09-13', hoy: '2026-11-18',
    semana: { numero: 10, empieza: '2026-11-15', termina: '2026-11-21', dia: 4, dias_en_meta: 1, dias_registrados: 2, estrellas: 0, faltan_para_otra_estrella: 2 },
    racha: 1, mejor_racha: 4,
    total: { semanas: 10, estrellas: 3, semanas_perfectas: 0, dias_en_meta: 21 },
    rango: { clave: 'bronce', siguiente: 'plata', estrellas_para_el_siguiente: 7 },
    semana_pasada: { numero: 9, dias_en_meta: 5, estrellas: 2 }, mejor_semana: { numero: 9, dias_en_meta: 5, estrellas: 2 },
    eventos: [], eventos_de_hoy: [],
};

const respuestas = (resumen) => async (url) => {
    if (String(url).startsWith('/api/progress/summary/')) return { ok: true, json: async () => resumen };
    if (String(url).startsWith('/api/progress/weeks/')) return { ok: true, json: async () => ({ semanas: [] }) };
    if (String(url).startsWith('/api/progress/events/seen/')) return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => ({ days: [fila('2026-11-17', 2000), fila('2026-11-16', 2600)] }) };
};

describe('[P1-PLAN-LOTE-1059] la tarjeta con el día 1 del servidor', () => {
    beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 18, 15, 0, 0)); });
    afterAll(() => { vi.useRealTimers(); });
    beforeEach(() => { window.localStorage.clear(); fetchWithAuth.mockReset(); });

    const montar = () => render(
        <SemanaEnProgreso userId="u-1" hoy={{ calories: 900, protein: 60, carbs: 90, fats: 30, mealsCount: 2 }} targetCalories={2000} />,
    );

    it('el día 1 del servidor (más antiguo que lo local) da el número de semana', async () => {
        fetchWithAuth.mockImplementation(respuestas(RESUMEN));
        montar();
        // en local solo hay registros desde el 16-nov (sería la Semana 1); el servidor dice 15-sep ⇒ Semana 10
        expect(await screen.findByRole('heading', { name: 'Semana 10' })).toBeInTheDocument();
        expect(fetchWithAuth).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/progress\/summary\/u-1\?tzOffset=/));
        expect(window.localStorage.getItem('mealfit_semana_inicio_u-1')).toBe('2026-09-15');
        expect(diaUnoDelServidor('u-1')).toBe('2026-09-15');
    });

    it('el rango va junto a la insignia, con lo que falta para el siguiente', async () => {
        fetchWithAuth.mockImplementation(respuestas(RESUMEN));
        montar();
        expect(await screen.findByText('Rango Bronce')).toBeInTheDocument();
        expect(screen.getByText(/Faltan 7 ★ para Plata/)).toBeInTheDocument();
    });

    it('sin red, pinta con el resumen guardado', async () => {
        window.localStorage.setItem('mealfit_progreso_resumen_u-1', JSON.stringify(RESUMEN));
        fetchWithAuth.mockRejectedValue(new Error('sin red'));
        montar();
        expect(screen.getByRole('heading', { name: 'Semana 10' })).toBeInTheDocument();
        expect(leerResumenGuardado('u-1').dia_1).toBe('2026-09-15');
    });

    it('un resumen sin día 1 (cuenta sin registros o respuesta rara) no se guarda ni manda', async () => {
        fetchWithAuth.mockImplementation(respuestas({}));
        montar();
        expect(await screen.findByRole('heading', { name: 'Semana 1' })).toBeInTheDocument();
        expect(leerResumenGuardado('u-1')).toBeNull();
    });
});

describe('[P1-PLAN-LOTE-1059 · plan 1035] cierre de semana e hitos', () => {
    beforeEach(() => { fetchWithAuth.mockReset(); fetchWithAuth.mockImplementation(respuestas(RESUMEN)); });

    const EV = [
        { clave: 'semana_cerrada:9', codigo: 'semana_cerrada', datos: { numero: 9, estrellas: 2, dias_en_meta: 5, siguiente: 10 } },
        { clave: 'racha:3', codigo: 'racha', datos: { dias: 3 } },
    ];

    it('muestra el cierre y el hito, y los marca vistos UNA vez', async () => {
        vi.useFakeTimers();
        render(<CierreDeSemana userId="u-1" eventos={EV} />);
        expect(screen.getByText('Semana 9 cerrada')).toBeInTheDocument();
        expect(screen.getByText(/5 de 7 días en meta\. Empieza la Semana 10\./)).toBeInTheDocument();
        expect(screen.getByRole('img', { name: '2 estrellas' })).toBeInTheDocument();
        expect(screen.getByText('Racha de 3 días')).toBeInTheDocument();
        await act(async () => { vi.advanceTimersByTime(1300); });
        const vistos = fetchWithAuth.mock.calls.filter(([u]) => String(u).startsWith('/api/progress/events/seen/u-1'));
        expect(vistos).toHaveLength(1);
        expect(JSON.parse(vistos[0][1].body)).toEqual({ claves: ['semana_cerrada:9', 'racha:3'] });
        vi.useRealTimers();
    });

    it('cerrar lo quita; sin eventos no pinta nada', () => {
        const { container, rerender } = render(<CierreDeSemana userId="u-1" eventos={EV.slice(0, 1)} />);
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
        return waitFor(() => expect(screen.queryByText('Semana 9 cerrada')).not.toBeInTheDocument()).then(() => {
            rerender(<CierreDeSemana userId="u-1" eventos={[]} />);
            expect(container.textContent).toBe('');
        });
    });

    it('un código desconocido no se pinta', () => {
        const { container } = render(<CierreDeSemana userId="u-1" eventos={[{ clave: 'x', codigo: 'nuevo_raro', datos: {} }]} />);
        expect(container.textContent).toBe('');
    });
});

describe('[P1-PLAN-LOTE-1059 · plan 1030] vitrina de semanas', () => {
    it('solo las cerradas, y tocar una lleva a su semana', async () => {
        fetchWithAuth.mockReset();
        fetchWithAuth.mockResolvedValue({
            ok: true,
            json: async () => ({ semanas: [
                { numero: 8, empieza: '2026-11-01', dias_en_meta: 7, dias_registrados: 7, estrellas: 3, cerrada: true },
                { numero: 9, empieza: '2026-11-08', dias_en_meta: 1, dias_registrados: 6, estrellas: 0, cerrada: true },
                { numero: 10, empieza: '2026-11-15', dias_en_meta: 0, dias_registrados: 2, estrellas: 0, cerrada: false },
            ] }),
        });
        const onElegir = vi.fn();
        render(<VitrinaDeSemanas userId="u-1" onElegir={onElegir} />);
        expect(await screen.findByText('Tus semanas')).toBeInTheDocument();
        expect(screen.getByText('S8')).toBeInTheDocument();
        expect(screen.queryByText('S10')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('listitem', { name: /Semana 8: 3 estrellas/ }));
        expect(onElegir).toHaveBeenCalledWith('2026-11-01');
    });
});
