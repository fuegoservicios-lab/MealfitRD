// [P1-COMPARTIR-DIA · 2026-09-23] La imagen: alto determinista y dibujo que no revienta sin canvas.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { altoDeLaTarjeta, dibujarTarjetaDelDia } from '../utils/tarjetaDelDia';
import { resumenDelDia } from '../utils/compartirDia';

const base = { calories: 1205, protein: 73, carbs: 125, fats: 42, meals: [{ meal_name: 'A', calories: 500 }] };
const METAS = { calories: 2050, protein: 134, carbs: 251, fats: 57 };

afterEach(() => { vi.restoreAllMocks(); });

describe('altoDeLaTarjeta', () => {
    it('crece con los micros y con las comidas', () => {
        const sin = altoDeLaTarjeta(resumenDelDia({ consumed: base, metas: METAS }));
        const conMicros = altoDeLaTarjeta(resumenDelDia({
            consumed: { ...base, micros: { fiber_g: 5 }, microsCoverage: { con_datos: 1, total: 1 } }, metas: METAS }));
        const conComidas = altoDeLaTarjeta(resumenDelDia({ consumed: base, metas: METAS, incluirComidas: true }));
        expect(sin).toBeGreaterThanOrEqual(1080);
        expect(conMicros).toBeGreaterThan(sin);
        expect(conComidas).toBeGreaterThan(sin);
    });
});

describe('dibujarTarjetaDelDia', () => {
    it('sin contexto 2D devuelve null sin lanzar', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        await expect(dibujarTarjetaDelDia(resumenDelDia({ consumed: base, metas: METAS }))).resolves.toBeNull();
    });
    it('dibuja las calorías y exporta PNG', async () => {
        const textos = [];
        const ctx = new Proxy({}, {
            get: (obj, k) => {
                if (k === 'fillText') return (s) => textos.push(String(s));
                if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
                if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => {} });
                if (k in obj) return obj[k];
                return () => {};
            },
            set: (obj, k, v) => { obj[k] = v; return true; },
        });
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) { cb(new Blob(['png'], { type: 'image/png' })); });
        const blob = await dibujarTarjetaDelDia(resumenDelDia({ consumed: base, metas: METAS }));
        expect(blob).toBeInstanceOf(Blob);
        expect(textos.some((s) => /1[.,\s]?205/.test(s))).toBe(true);
        expect(textos).toContain('bioboros.com');
    });
});
