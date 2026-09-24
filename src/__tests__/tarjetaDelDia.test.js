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
    it('pie sin colisión: 40 px entre último contenido y divider (6 combos)', async () => {
        const combos = [
            { micros: false, meals: 0 },
            { micros: false, meals: 1 },
            { micros: false, meals: 6 },
            { micros: true, meals: 0 },
            { micros: true, meals: 1 },
            { micros: true, meals: 6 },
        ];
        for (const combo of combos) {
            const consumed = { ...base };
            if (combo.micros) {
                consumed.micros = { fiber_g: 5, sodium_mg: 500 };
                consumed.microsCoverage = { con_datos: 1, total: 1 };
            }
            const resumen = resumenDelDia({
                consumed,
                metas: METAS,
                incluirComidas: combo.meals > 0,
            });
            if (combo.meals === 6) {
                resumen.comidas = Array.from({ length: 6 }, (_, i) => ({ nombre: `Comida ${i + 1}`, kcal: 300 + i * 10 }));
            } else if (combo.meals === 1) {
                resumen.comidas = [{ nombre: 'Una comida', kcal: 300 }];
            }
            const textos = [];
            const rects = [];
            const ctx = new Proxy({}, {
                get: (obj, k) => {
                    if (k === 'fillText') return (s, x, y) => textos.push({ s: String(s), x, y });
                    if (k === 'fillRect') return (x, y, w, h) => rects.push({ x, y, w, h });
                    if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
                    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => {} });
                    if (k in obj) return obj[k];
                    return () => {};
                },
                set: (obj, k, v) => { obj[k] = v; return true; },
            });
            vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
            vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) { cb(new Blob(['png'], { type: 'image/png' })); });
            await dibujarTarjetaDelDia(resumen);
            const divider = rects.find((r) => r.h === 2);
            expect(divider, `divider not found for combo ${JSON.stringify(combo)}`).toBeDefined();
            const dividerY = divider.y;
            const footerTextos = textos.filter((t) => t.y > dividerY);
            const contentTextos = textos.filter((t) => t.y <= dividerY);
            for (const txt of contentTextos) {
                expect(txt.y, `${txt.s} at y=${txt.y} collides with divider at y=${dividerY} (combo ${JSON.stringify(combo)})`).toBeLessThanOrEqual(dividerY - 40);
            }
            expect(footerTextos.length).toBeGreaterThan(0);
            vi.restoreAllMocks();
        }
    });
});
