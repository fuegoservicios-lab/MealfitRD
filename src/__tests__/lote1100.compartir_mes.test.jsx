// [P1-PLAN-LOTE-1100 · 2026-11-18] «Compartir mi mes»: lo que le recomendé al dueño (la semana primero, el mes como
// resumen de logros). Un anillo por día en su cuadrícula, días en meta, días con registro y la mejor racha.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../utils/historiaConFoto', async (orig) => ({
    ...(await orig()),
    dibujarHistoriaConFoto: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { resumenDeMes, textoDeMes, mejorRachaDelMes, PINTOR_MES } from '../utils/compartirMes';
import { cajaDeCifras, dibujarHistoriaConFoto } from '../utils/historiaConFoto';
import ShareDaySheet from '../components/dashboard/ShareDaySheet';

const estados = ['meta', 'meta', 'bajo', 'pasado', 'meta', 'vacio', 'meta', 'meta', 'meta', 'meta', 'futuro', 'futuro'];
const MES = { nombre: 'Noviembre 2026', inicio: 0, enCurso: true, dias: estados.map((estado, i) => ({ iso: `2026-11-${String(i + 1).padStart(2, '0')}`, estado })) };

describe('[1100] el resumen del mes', () => {
    it('cuenta los días en meta y con registro hasta hoy, y la mejor racha', () => {
        const r = resumenDeMes(MES);
        expect(r).toMatchObject({ tipo: 'mes', nombre: 'Noviembre 2026', periodo: 'Noviembre 2026', transcurridos: 10, enMeta: 7, registrados: 9, mejorRacha: 4 });
        expect(r.pintor).toBe(PINTOR_MES);
        expect(r.perfecta).toBe(false);
    });

    it('la racha se corta con un día fuera de meta o vacío, no con los futuros', () => {
        expect(mejorRachaDelMes([{ estado: 'meta' }, { estado: 'vacio' }, { estado: 'meta' }, { estado: 'meta' }, { estado: 'futuro' }])).toBe(2);
    });

    it('el texto de reserva pinta la cuadrícula con su hueco del día 1 y las cifras', () => {
        const txt = textoDeMes(resumenDeMes({ ...MES, inicio: 3 }));
        expect(txt).toContain('Noviembre 2026');
        expect(txt.split('\n')[2].startsWith('      ✅')).toBe(true);    // tres huecos antes del día 1
        expect(txt).toMatch(/7 días en meta/);
        expect(txt).toMatch(/Mejor racha: 4 días/);
    });

    it('cada composición tiene su caja (la que se arrastra)', () => {
        const r = resumenDeMes(MES);
        for (const e of ['titular', 'minimal', 'cristal']) {
            const c = cajaDeCifras(r, e);
            expect(c.w).toBeGreaterThan(0);
            expect(c.h).toBeGreaterThan(0);
        }
    });
});

describe('[1100] la hoja con el mes', () => {
    it('título, el mes debajo y la historia del mes (sin formatos)', async () => {
        render(<ShareDaySheet onClose={() => {}} mes={MES} />);
        expect(screen.getByRole('heading', { name: 'Compartir tu mes' })).toBeTruthy();
        expect(screen.getByText('Noviembre 2026')).toBeTruthy();
        expect(screen.getByRole('img', { name: 'Mi mes: tu historia' }).tagName).toBe('CANVAS');
        expect(screen.queryByRole('radiogroup', { name: 'Formato de la imagen' })).toBeNull();
        await waitFor(() => expect(dibujarHistoriaConFoto).toHaveBeenCalled());
        expect(dibujarHistoriaConFoto.mock.calls.at(-1)[0]).toMatchObject({ tipo: "mes", enMeta: 7 });
    });
});
