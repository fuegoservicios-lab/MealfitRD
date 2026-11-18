// [P1-PLAN-LOTE-1083 · 2026-11-18] El pellizco de las cifras (el dueño: «tengo que pellizcar muy lejos para que
// funcione»): toda la vista previa recibe el gesto, el pellizco es de las cifras si cualquier dedo las toca, y el
// factor es absoluto desde que se apoyan los dos dedos.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../utils/historiaConFoto', async (orig) => ({
    ...(await orig()),
    cargarFoto: vi.fn(async () => ({ width: 1200, height: 1600 })),
    dibujarHistoriaConFoto: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { dibujarHistoriaConFoto, cajaDeCifras, ANCHO, ALTO } from '../utils/historiaConFoto';
import { BLOQUE_INICIAL, cajaTransformada } from '../utils/bloqueDeCifras';
import ShareDaySheet from '../components/dashboard/ShareDaySheet';

const props = {
    onClose: vi.fn(),
    consumed: { calories: 2308, protein: 84, carbs: 274, fats: 98, meals: [], micros: null, microsCoverage: { con_datos: 0, total: 0 } },
    metas: { calories: 2050, protein: 134, carbs: 250, fats: 70 },
};

beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn().mockResolvedValue(undefined), canShare: () => true, clipboard: { writeText: vi.fn() } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

// El lienzo en pantalla a 1/4 (270×480); la vista previa que lo envuelve es más ancha.
const _preparar = async () => {
    render(<ShareDaySheet {...props} />);
    fireEvent.change(screen.getByTestId('share-day-foto'), { target: { files: [new File(['x'], 'e.jpg', { type: 'image/jpeg' })] } });
    await screen.findByRole('radiogroup', { name: /qué ajustas/i });
    const lienzo = screen.getByRole('img', { name: /tu historia con tu foto/i });
    lienzo.getBoundingClientRect = () => ({ left: 0, top: 0, width: ANCHO / 4, height: ALTO / 4, right: ANCHO / 4, bottom: ALTO / 4 });
    const c = cajaTransformada(cajaDeCifras({ calorias: { valor: 2308, meta: 2050, pct: 113 } }, 'titular'), BLOQUE_INICIAL);
    return { lienzo, vista: lienzo.parentElement, centro: { x: (c.x + c.w / 2) / 4, y: (c.y + c.h / 2) / 4 } };
};
const ultimaEscala = () => dibujarHistoriaConFoto.mock.calls.at(-1)?.[1].bloque.escala;

describe('[1083] pellizcar las cifras', () => {
    it('el primer dedo fuera de las cifras y el segundo encima: el pellizco es de las cifras, no de la foto', async () => {
        const { vista, centro } = await _preparar();
        fireEvent.pointerDown(vista, { pointerId: 1, clientX: centro.x, clientY: 60 });          // arriba, sobre la foto
        fireEvent.pointerDown(vista, { pointerId: 2, clientX: centro.x, clientY: centro.y });    // sobre las cifras
        const d0 = centro.y - 60;
        fireEvent.pointerMove(vista, { pointerId: 2, clientX: centro.x, clientY: 60 + d0 * 0.6 });
        await waitFor(() => expect(ultimaEscala()).toBeCloseTo(0.6, 2));
        expect(dibujarHistoriaConFoto.mock.calls.at(-1)[1].encuadre).toEqual({ zoom: 1, x: 0, y: 0 });
        expect(screen.getByRole('radio', { name: /resumen del día/i })).toHaveAttribute('aria-checked', 'true');
    });

    it('el segundo dedo FUERA de la imagen (en la vista previa) cuenta, y el factor es absoluto: volver = tamaño de antes', async () => {
        const { vista, centro } = await _preparar();
        fireEvent.pointerDown(vista, { pointerId: 1, clientX: centro.x, clientY: centro.y });
        fireEvent.pointerDown(vista, { pointerId: 2, clientX: centro.x + 400, clientY: centro.y });   // x > 270: fuera del lienzo
        fireEvent.pointerMove(vista, { pointerId: 2, clientX: centro.x + 200, clientY: centro.y });
        await waitFor(() => expect(ultimaEscala()).toBeCloseTo(0.5, 2));
        fireEvent.pointerMove(vista, { pointerId: 2, clientX: centro.x + 300, clientY: centro.y });
        fireEvent.pointerMove(vista, { pointerId: 2, clientX: centro.x + 400, clientY: centro.y });
        await waitFor(() => expect(ultimaEscala()).toBeCloseTo(1, 2));
    });

    it('con «Tus cifras» elegidas, un pellizco en cualquier parte las escala', async () => {
        const { vista } = await _preparar();
        fireEvent.click(screen.getByRole('radio', { name: /resumen del día/i }));
        fireEvent.pointerDown(vista, { pointerId: 1, clientX: 40, clientY: 40 });
        fireEvent.pointerDown(vista, { pointerId: 2, clientX: 140, clientY: 40 });
        fireEvent.pointerMove(vista, { pointerId: 2, clientX: 100, clientY: 40 });
        await waitFor(() => expect(ultimaEscala()).toBeCloseTo(0.6, 2));
    });

    it('sin tocar las cifras ni elegirlas, el pellizco sigue acercando la foto', async () => {
        const { vista } = await _preparar();
        fireEvent.pointerDown(vista, { pointerId: 1, clientX: 40, clientY: 30 });
        fireEvent.pointerDown(vista, { pointerId: 2, clientX: 140, clientY: 30 });
        fireEvent.pointerMove(vista, { pointerId: 2, clientX: 240, clientY: 30 });
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)?.[1].encuadre.zoom).toBeCloseTo(2, 2));
        expect(ultimaEscala()).toBe(1);
    });
});
