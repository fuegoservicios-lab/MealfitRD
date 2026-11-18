// [P1-PLAN-LOTE-1090 · 2026-11-18] «Mejora el diseño de esto que se ve medio raro» (la hoja de compartir la semana): los
// ajustes son filas del mismo ancho con su rótulo (Estilo · Tamaño · Textos), la pista va UNA vez bajo la imagen, las
// fichas de textos son una línea que se desliza de lado (sin que la hoja se coma el gesto) y la invitación de la foto es
// compacta, con una flecha quieta en vez del brote que latía.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../utils/historiaConFoto', async (orig) => ({
    ...(await orig()),
    dibujarHistoriaConFoto: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import ShareDaySheet from '../components/dashboard/ShareDaySheet';
import { SELECTOR_GESTO_PROPIO } from '../hooks/useBottomSheet';

const DIAS = ['meta', 'meta', 'bajo', 'vacio', 'meta', 'pasado', 'futuro'].map((estado, i) => ({
    iso: `2026-11-${String(15 + i).padStart(2, '0')}`, estado, ratio: 1, letra: 'DLMMJVS'[i],
}));
const SEMANA = { numero: 10, enCurso: true, periodo: '15 nov – 21 nov', dias: DIAS, enMeta: 3, estrellas: 1, racha: 2, rango: 'plata' };

beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.clearAllMocks(); });

describe('[1090] la hoja de compartir, ordenada', () => {
    it('cada ajuste lleva su rótulo y la pista sale una sola vez', () => {
        render(<ShareDaySheet onClose={() => {}} semana={SEMANA} />);
        for (const r of ['Estilo', 'Tamaño', 'Textos']) expect(screen.getByText(r)).toBeTruthy();
        expect(screen.getAllByText(/pellizca/i)).toHaveLength(1);
        expect(screen.getByRole('group', { name: 'Textos' })).toBeTruthy();
        expect(screen.getByRole('radiogroup', { name: 'Estilo de la historia' }).querySelectorAll('[role=radio]')).toHaveLength(3);
    });

    it('las fichas de textos se deslizan de lado: la fila se marca como gesto propio', () => {
        render(<ShareDaySheet onClose={() => {}} semana={SEMANA} />);
        const ficha = screen.getByRole('button', { name: /Fechas/ });
        expect(ficha.closest(SELECTOR_GESTO_PROPIO)).not.toBeNull();
    });

    it('la invitación de la foto es corta y sin el brote animado', () => {
        render(<ShareDaySheet onClose={() => {}} semana={SEMANA} />);
        expect(screen.getByText('Tu selfie detrás de tus cifras')).toBeTruthy();
        const src = readFileSync(resolve(__dirname, '..', 'components', 'dashboard', 'ShareDaySheet.jsx'), 'utf8');
        expect(src).not.toMatch(/BroteChispa|fotoCtaBrillo/);
        const css = readFileSync(resolve(__dirname, '..', 'components', 'dashboard', 'ShareDaySheet.module.css'), 'utf8');
        expect(css).not.toMatch(/sdBrillo/);
        expect(css).toMatch(/\.sheetFoto \.preview \{[^}]*background: transparent/);
    });
});
