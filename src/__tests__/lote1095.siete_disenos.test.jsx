// [P1-PLAN-LOTE-1095 · 2026-11-18] «Quiero 7 diseños wow, útiles para cada día de la semana, con nombres creativos y
// abstractos» + «Tus cifras no se entiende»: siete diseños (uno por día) sobre las tres composiciones, y «Mover» dice
// qué se mueve: «Foto de fondo» o «Resumen del día».
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../utils/historiaConFoto', async (orig) => ({
    ...(await orig()),
    cargarFoto: vi.fn(async () => ({ width: 1200, height: 1600 })),
    dibujarHistoriaConFoto: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { DISENOS, CLAVES_DE_DISENO, disenoDe, baseDe, disenoDelDia, tintarFoto } from '../utils/disenosDeHistoria';
import { ESTILOS, cajaDeCifras, dibujarHistoriaConFoto } from '../utils/historiaConFoto';
import ShareDaySheet from '../components/dashboard/ShareDaySheet';

const DIAS = ['meta', 'meta', 'bajo', 'vacio', 'meta', 'pasado', 'futuro'].map((estado, i) => ({
    iso: `2026-11-${String(15 + i).padStart(2, '0')}`, estado, ratio: 1, letra: 'DLMMJVS'[i],
}));
const SEMANA = { numero: 10, enCurso: true, periodo: '15 nov – 21 nov', dias: DIAS, enMeta: 3, estrellas: 1, racha: 2, rango: 'plata' };

beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.clearAllMocks(); });

describe('[1095] los siete diseños', () => {
    it('siete, uno por día (domingo a sábado), con nombre propio y una de las tres composiciones', () => {
        expect(DISENOS).toHaveLength(7);
        expect(DISENOS.map((d) => d.dia).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(new Set(DISENOS.map((d) => d.nombre)).size).toBe(7);
        for (const d of DISENOS) expect(['titular', 'minimal', 'cristal']).toContain(d.base);
        expect(ESTILOS).toEqual(CLAVES_DE_DISENO);
    });

    it('las claves viejas siguen valiendo (nada guardado se rompe) y una desconocida cae en Aurora', () => {
        expect(baseDe('titular')).toBe('titular');
        expect(baseDe('cristal')).toBe('cristal');
        expect(disenoDe('nada').clave).toBe('titular');
    });

    it('el diseño del día: domingo Aurora … sábado Eclipse', () => {
        expect(disenoDelDia(new Date(2026, 10, 15, 12)).nombre).toBe('Aurora');
        expect(disenoDelDia(new Date(2026, 10, 18, 12)).nombre).toBe('Brasa');
        expect(disenoDelDia(new Date(2026, 10, 21, 12)).nombre).toBe('Eclipse');
    });

    it('la caja que se arrastra es la de su composición', () => {
        const r = { calorias: { valor: 1800, meta: 2000, pct: 90 }, macros: [] };
        expect(cajaDeCifras(r, 'marea')).toEqual(cajaDeCifras(r, 'cristal'));
        expect(cajaDeCifras(r, 'neon')).toEqual(cajaDeCifras(r, 'minimal'));
        expect(cajaDeCifras(r, 'brasa')).toEqual(cajaDeCifras(r, 'titular'));
    });

    it('sin modo de mezcla en el navegador no tiñe (mejor la foto tal cual que un velo plano)', () => {
        const ctx = {
            save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), createLinearGradient: () => ({ addColorStop() {} }),
            get globalCompositeOperation() { return 'source-over'; }, set globalCompositeOperation(_v) { /* no lo sabe */ },
        };
        expect(tintarFoto(ctx, 'brasa', 1080, 1920)).toBe(false);
        expect(ctx.fillRect).not.toHaveBeenCalled();
        expect(tintarFoto(ctx, 'titular', 1080, 1920)).toBe(false);   // Aurora no tiñe
    });
});

describe('[1095] la hoja', () => {
    it('ofrece los siete y nace con el del día que se comparte', async () => {
        render(<ShareDaySheet onClose={() => {}} semana={SEMANA} />);
        const grupo = screen.getByRole('radiogroup', { name: 'Estilo de la historia' });
        expect(grupo.querySelectorAll('[role=radio]')).toHaveLength(7);
        expect(grupo.closest('[data-gesto-propio]')).not.toBeNull();
        expect(screen.getByRole('radio', { name: new RegExp(disenoDelDia().nombre) })).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByRole('radio', { name: /Neón/ }));
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)[1]).toMatchObject({ estilo: 'neon' }));
    });

    it('«Mover» dice qué se mueve: la foto de fondo o el resumen del día', async () => {
        render(<ShareDaySheet onClose={() => {}} consumed={{ calories: 1800, protein: 100, carbs: 200, healthy_fats: 60, meals: [] }} />);
        fireEvent.change(screen.getByTestId('share-day-foto'), { target: { files: [new File(['x'], 'f.jpg', { type: 'image/jpeg' })] } });
        expect(await screen.findByRole('radio', { name: /Foto de fondo/ })).toBeTruthy();
        expect(screen.getByRole('radio', { name: /Resumen del día/ })).toBeTruthy();
        expect(screen.queryByText('Tus cifras')).toBeNull();
    });
});
