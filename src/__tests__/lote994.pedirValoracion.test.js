// [P1-PLAN-LOTE-994] Ventanita nativa de valoración: sólo tras registrar una comida, a quien ya usa la app, y con tope.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestReview = vi.fn(() => Promise.resolve());
vi.mock('@capacitor-community/in-app-review', () => ({ InAppReview: { requestReview } }));
vi.mock('../config/platform', () => ({ isNativeApp: () => true, nativePluginAvailable: (n) => n === 'InAppReview' }));

import { debePedir, anotarDia, DIAS_MINIMOS, ESPERA_DIAS } from '../native/pedirValoracion';

const DIA = 86400000;
const emitir = (n) => window.dispatchEvent(new CustomEvent('mealfit:today-consumed-updated', {
    detail: { meals: Array.from({ length: n }, (_, i) => ({ id: i })) },
}));

describe('debePedir', () => {
    it('no pide a quien aún no la usa', () => {
        expect(debePedir({ diasConRegistro: DIAS_MINIMOS - 1 })).toBe(false);
        expect(debePedir({ diasConRegistro: DIAS_MINIMOS })).toBe(true);
    });
    it('respeta la espera entre pedidos', () => {
        const ahora = 1e12;
        expect(debePedir({ diasConRegistro: 9, ultimaVez: ahora - 10 * DIA, ahora })).toBe(false);
        expect(debePedir({ diasConRegistro: 9, ultimaVez: ahora - ESPERA_DIAS * DIA, ahora })).toBe(true);
    });
});

describe('anotarDia', () => {
    it('no repite el día y guarda como mucho 10', () => {
        expect(anotarDia(['2026-11-12'], '2026-11-12')).toEqual(['2026-11-12']);
        const muchos = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
        expect(anotarDia(muchos, '2026-11-13')).toHaveLength(10);
    });
});

describe('iniciarPedirValoracion', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        requestReview.mockClear();
    });

    it('la carga inicial no pide; una comida nueva sí (con días suficientes) y sólo una vez', async () => {
        localStorage.setItem('mealfit_valoracion_dias', JSON.stringify(['2026-01-01', '2026-01-02']));
        const { iniciarPedirValoracion } = await import('../native/pedirValoracion');
        iniciarPedirValoracion();
        emitir(1);                       // carga inicial: fija la base
        vi.advanceTimersByTime(5000);
        expect(requestReview).not.toHaveBeenCalled();
        emitir(2);                       // registró otra comida
        vi.advanceTimersByTime(5000);
        await vi.dynamicImportSettled();
        expect(requestReview).toHaveBeenCalledTimes(1);
        emitir(3);                       // dentro de la espera: no vuelve a pedir
        vi.advanceTimersByTime(5000);
        await vi.dynamicImportSettled();
        expect(requestReview).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
