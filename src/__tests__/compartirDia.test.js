// [P1-COMPARTIR-DIA · 2026-09-23] El texto y las decisiones de compartir el día, sin DOM.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    resumenDelDia, textoDelDia, barraTexto, urlWhatsApp, archivoDeImagen,
    puedeCompartirImagen, compartir, consumidoDelDiario, fechaLarga,
} from '../utils/compartirDia';

const CONSUMED = {
    calories: 1205, protein: 73, carbs: 125, fats: 42,
    meals: [
        { meal_name: '2 panecillos con queso', calories: 510 },
        { meal_name: 'Plátano maduro con pollo', calories: 695 },
    ],
    micros: { fiber_g: 12.4, sodium_mg: 684, potassium_mg: 1650, calcium_mg: 290, iron_mg: 3.1, vit_c_mg: 41, vit_a_mcg: 420, vit_d_mcg: 0.8 },
    microsCoverage: { con_datos: 1, total: 2 },
};
const METAS = { calories: 2050, protein: 134, carbs: 251, fats: 57 };
const MICRO_METAS = { fiber_g: { target: 38, kind: 'floor' }, sodium_mg: { target: 2000, kind: 'ceiling' } };

afterEach(() => { vi.unstubAllGlobals(); });

describe('resumenDelDia', () => {
    it('decide los números: redondea, calcula % y respeta la cobertura', () => {
        const r = resumenDelDia({ consumed: CONSUMED, metas: METAS, microMetas: MICRO_METAS });
        expect(r.calorias).toMatchObject({ valor: 1205, meta: 2050, pct: 59 });
        expect(r.macros.map((m) => m.pct)).toEqual([54, 50, 74]);
        expect(r.micros).toHaveLength(8);
        expect(r.micros.find((m) => m.key === 'sodium_mg')).toMatchObject({ valor: 684, meta: 2000, techo: true });
        expect(r.cobertura).toEqual({ con_datos: 1, total: 2 });
        expect(r.comidas).toEqual([]);           // privacidad por defecto
        expect(r.comidasRegistradas).toBe(2);
    });
    it('sin datos de micros no inventa ceros', () => {
        const r = resumenDelDia({ consumed: { ...CONSUMED, micros: null, microsCoverage: { con_datos: 0, total: 2 } }, metas: METAS });
        expect(r.micros).toEqual([]);
    });
    it('incluye las comidas solo si se pide', () => {
        const r = resumenDelDia({ consumed: CONSUMED, metas: METAS, incluirComidas: true });
        expect(r.comidas).toEqual([{ nombre: '2 panecillos con queso', kcal: 510 }, { nombre: 'Plátano maduro con pollo', kcal: 695 }]);
    });
});

describe('textoDelDia', () => {
    it('lleva calorías, macros con barra, micros con su cobertura y la invitación', () => {
        const txt = textoDelDia(resumenDelDia({ consumed: CONSUMED, metas: METAS, microMetas: MICRO_METAS, fecha: new Date(2026, 8, 23) }));
        expect(txt).toContain('Bioboros');
        expect(txt).toMatch(/1[.,\s]?205 \/ 2[.,\s]?050 kcal/);
        expect(txt).toContain('▰');
        expect(txt).toContain('Proteína');
        expect(txt).toMatch(/1 de 2 comidas/);
        expect(txt).toContain('bioboros.com');
        expect(txt).not.toContain('panecillos');
    });
    it('con comidas elegidas, las nombra', () => {
        const txt = textoDelDia(resumenDelDia({ consumed: CONSUMED, metas: METAS, incluirComidas: true }));
        expect(txt).toContain('2 panecillos con queso');
    });
});

// [P1-COMPARTIR-DIA-PASADO · 2026-09-24] El día del Diario (`{meals, totals}` del servidor) en la forma de la tarjeta.
describe('consumidoDelDiario', () => {
    const DIA = {
        meals: [{ meal_name: 'Mangú', calories: 510 }, { meal_name: 'Pollo', calories: 695 }, { meal_name: 'Tortilla', calories: 620 }],
        totals: {
            calories: 1825, protein: 113, carbs: 161, healthy_fats: 78,
            micros: { fiber_g: 14 }, micros_coverage: { con_datos: 3, total: 3 },
        },
    };
    it('comparte los MISMOS totales que pinta el cajón (los del servidor), grasas incluidas', () => {
        const c = consumidoDelDiario(DIA);
        expect(c).toMatchObject({ calories: 1825, protein: 113, carbs: 161, fats: 78, micros: { fiber_g: 14 } });
        expect(c.microsCoverage).toEqual({ con_datos: 3, total: 3 });
        expect(c.meals).toBe(DIA.meals);
        const r = resumenDelDia({ consumed: c, metas: { calories: 2050, protein: 134, carbs: 251, fats: 57 }, fecha: new Date(2026, 8, 23, 12) });
        expect(r.calorias).toMatchObject({ valor: 1825, meta: 2050, pct: 89 });
        expect(r.macros.map((m) => m.valor)).toEqual([113, 161, 78]);
        expect(r.comidasRegistradas).toBe(3);
        expect(textoDelDia(r)).toContain(fechaLarga(new Date(2026, 8, 23, 12)));
    });
    it('sin cobertura de micros no inventa datos; sin día, ceros', () => {
        const c = consumidoDelDiario({ meals: DIA.meals, totals: { calories: 700, fats: 20 } });
        expect(c).toMatchObject({ fats: 20, micros: null, microsCoverage: { con_datos: 0, total: 3 } });
        expect(consumidoDelDiario(null)).toEqual({
            calories: 0, protein: 0, carbs: 0, fats: 0, meals: [], micros: null, microsCoverage: { con_datos: 0, total: 0 },
        });
    });
});

describe('barraTexto y wa.me', () => {
    it('10 casillas, acotada', () => {
        expect(barraTexto(59)).toBe('▰▰▰▰▰▰▱▱▱▱');
        expect(barraTexto(250)).toBe('▰'.repeat(10));
        expect(barraTexto(-5)).toBe('▱'.repeat(10));
    });
    it('el enlace de WhatsApp codifica el texto', () => {
        expect(urlWhatsApp('Hola & 50%')).toBe('https://wa.me/?text=Hola%20%26%2050%25');
    });
});

describe('compartir', () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    it('con archivos: imagen + texto', async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true });
        const archivo = archivoDeImagen(blob);
        expect(puedeCompartirImagen(archivo)).toBe(true);
        await expect(compartir({ archivo, texto: 't' })).resolves.toBe('compartido');
        expect(share).toHaveBeenCalledWith({ files: [archivo], text: 't' });
    });
    it('sin archivos pero con share: solo texto', async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share, canShare: () => false });
        await expect(compartir({ archivo: archivoDeImagen(blob), texto: 't' })).resolves.toBe('compartido');
        expect(share).toHaveBeenCalledWith({ text: 't' });
    });
    it('cerrar la hoja no es un fallo', async () => {
        const err = Object.assign(new Error('x'), { name: 'AbortError' });
        vi.stubGlobal('navigator', { ...navigator, share: vi.fn().mockRejectedValue(err), canShare: () => true });
        await expect(compartir({ archivo: archivoDeImagen(blob), texto: 't' })).resolves.toBe('cancelado');
    });
    it('sin Web Share (WebView de Android): fallo, para ofrecer WhatsApp/copiar', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined });
        await expect(compartir({ archivo: archivoDeImagen(blob), texto: 't' })).resolves.toBe('fallo');
    });
});
