// [P1-COMPARTIR-DIA · 2026-09-23] La imagen: alto determinista y dibujo que no revienta sin canvas.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { altoDeLaTarjeta, dibujarTarjetaDelDia } from '../utils/tarjetaDelDia';
import { resumenDelDia } from '../utils/compartirDia';

const base = { calories: 1205, protein: 73, carbs: 125, fats: 42, meals: [{ meal_name: 'A', calories: 500 }] };
const METAS = { calories: 2050, protein: 134, carbs: 251, fats: 57 };

afterEach(() => { vi.restoreAllMocks(); });

/** Un lienzo de mentira que apunta cada `fillText` con su posición y la fuente con la que se pintó. `ancho` = píxeles
 *  por carácter que devuelve `measureText` (exagerarlo pone a prueba los topes de ancho). */
function conLienzo(ancho = 10) {
    const textos = [];
    const ctx = new Proxy({}, {
        get: (obj, k) => {
            if (k === 'fillText') return (s, x, y) => textos.push({ s: String(s), x, y, font: obj.font });
            if (k === 'measureText') return (s) => ({ width: String(s).length * ancho });
            if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => {} });
            if (k in obj) return obj[k];
            return () => {};
        },
        set: (obj, k, v) => { obj[k] = v; return true; },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) { cb(new Blob(['png'], { type: 'image/png' })); });
    return textos;
}

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
    // [P1-COMPARTIR-DIA · fix round 1] «2,310 mg · máx. 2,0…» no cabía en la columna del valor: el techo se marca
    // como en la tarjeta de la app (MicrosList), con una etiqueta «máx.» junto al nombre, y el valor va como los demás.
    it('un micro con techo: «máx.» es una etiqueta aparte junto al nombre y el valor lleva el formato de los demás', async () => {
        const textos = conLienzo();
        await dibujarTarjetaDelDia(resumenDelDia({
            consumed: { ...base, micros: { fiber_g: 12.4, sodium_mg: 2310 }, microsCoverage: { con_datos: 1, total: 1 } },
            metas: METAS,
            microMetas: { fiber_g: { target: 38, kind: 'floor' }, sodium_mg: { target: 2000, kind: 'ceiling' } },
        }));
        const todos = textos.map((x) => x.s).join(' | ');
        expect(textos.some((x) => /^2[.,\s]?310 \/ 2[.,\s]?000 mg$/.test(x.s)), todos).toBe(true);
        expect(textos.some((x) => /^12[.,]4 \/ 38 g$/.test(x.s)), todos).toBe(true);
        const conMax = textos.filter((x) => /m[aá]x/i.test(x.s));
        expect(conMax.map((x) => x.s), 'la etiqueta se pinta sola y ningún valor la lleva dentro').toEqual(['MÁX.']);
        const [etiqueta] = conMax;
        const nombre = textos.find((x) => x.s === 'Sodio');
        expect(etiqueta.x).toBeGreaterThan(nombre.x);            // a la derecha del nombre…
        expect(etiqueta.y).toBeLessThan(nombre.y);               // …y centrada en su altura, no en su línea base
        expect(etiqueta.y).toBeGreaterThan(nombre.y - 30);
        expect(etiqueta.font).toMatch(/^800 20px /);
    });

    it('el cierre nunca pisa «bioboros.com»: se mide el sitio y el cierre recibe lo que queda', async () => {
        const K = 30;   // letra exagerada: sin tope, «¿Y tú, cómo vas hoy?» acabaría en 72 + 20·30 = 672 px
        const textos = conLienzo(K);
        await dibujarTarjetaDelDia(resumenDelDia({ consumed: base, metas: METAS }));
        const sitio = textos.find((x) => x.s === 'bioboros.com');
        const cierre = textos.find((x) => x.s.startsWith('¿Y tú'));
        expect(cierre.y).toBe(sitio.y);
        const bordeDelSitio = sitio.x - sitio.s.length * K;     // el sitio va alineado a la derecha
        expect(cierre.x + cierre.s.length * K).toBeLessThanOrEqual(bordeDelSitio - 24);
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
