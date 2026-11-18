// [P1-PLAN-LOTE-1078] Las cifras de la historia son un sticker: se arrastran a donde quieras y se agrandan o achican
// (pellizcando o con el deslizador de «Tus cifras»); la foto se sigue encuadrando igual.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../utils/historiaConFoto', async (orig) => ({
    ...(await orig()),
    cargarFoto: vi.fn(async () => ({ width: 1200, height: 1600 })),
    dibujarHistoriaConFoto: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { dibujarHistoriaConFoto, cajaDeCifras, LIMITES_CIFRAS, ESTILOS, ANCHO, ALTO } from '../utils/historiaConFoto';
import { BLOQUE_INICIAL, ESCALA_MIN, acotarBloque, moverBloque, imantar, escalaMax, cajaTransformada, tocaLasCifras, esInicial } from '../utils/bloqueDeCifras';
import ShareDaySheet from '../components/dashboard/ShareDaySheet';

const props = {
    onClose: vi.fn(),
    consumed: { calories: 2308, protein: 84, carbs: 274, fats: 98, meals: [], micros: null, microsCoverage: { con_datos: 0, total: 0 } },
    metas: { calories: 2050, protein: 134, carbs: 250, fats: 70 },
};
const resumen = (valor, meta) => ({ calorias: { valor, meta, pct: meta ? Math.round((valor / meta) * 100) : 0 }, macros: [] });

beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn().mockResolvedValue(undefined), canShare: () => true, clipboard: { writeText: vi.fn() } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('[1078] la geometría del sticker', () => {
    it('en su sitio de siempre las cifras de cada estilo caben en sus límites: sin tocar nada, la historia sale igual', () => {
        for (const estilo of ESTILOS) {
            for (const r of [resumen(2308, 2050), resumen(2050, 2050), resumen(900, 0), resumen(12345, 2050)]) {
                const caja = cajaDeCifras(r, estilo);
                expect(caja.y).toBeGreaterThanOrEqual(LIMITES_CIFRAS.y0);
                expect(caja.y + caja.h).toBeLessThanOrEqual(LIMITES_CIFRAS.y1);
                expect(esInicial(acotarBloque(BLOQUE_INICIAL, caja, LIMITES_CIFRAS))).toBe(true);
            }
        }
    });

    const caja = cajaDeCifras(resumen(2308, 2050), 'titular');
    // [P1-PLAN-LOTE-1097] libre, como Instagram: llega a cualquier borde (medio fuera), pero su centro nunca sale
    it('va a donde lo lleves: su centro llega a cada borde de la imagen y no pasa de ahí', () => {
        const centro = (b) => { const c = cajaTransformada(caja, b); return { x: c.x + c.w / 2, y: c.y + c.h / 2 }; };
        expect(centro(moverBloque(BLOQUE_INICIAL, caja, LIMITES_CIFRAS, { dy: -99999 })).y).toBeCloseTo(0);
        const abajo = centro(moverBloque({ escala: 0.5 }, caja, LIMITES_CIFRAS, { dx: 99999, dy: 99999 }));
        expect(abajo.x).toBeCloseTo(ANCHO);
        expect(abajo.y).toBeCloseTo(ALTO);
    });

    it('se achica hasta ESCALA_MIN y se agranda hasta lo que cabe (nunca menos que su tamaño de siempre)', () => {
        expect(moverBloque(BLOQUE_INICIAL, caja, LIMITES_CIFRAS, { factor: 0.01 }).escala).toBe(ESCALA_MIN);
        const tope = escalaMax(caja, LIMITES_CIFRAS);
        expect(tope).toBeGreaterThanOrEqual(1);
        expect(moverBloque(BLOQUE_INICIAL, caja, LIMITES_CIFRAS, { factor: 50 }).escala).toBeCloseTo(tope);
        // [1088] a lo alto nunca se salen de la zona segura (a lo ancho sí pueden: ver lote1088)
        const pequeno = cajaDeCifras(resumen(2308, 2050), 'minimal');
        expect(cajaTransformada(pequeno, { dx: 0, dy: 0, escala: escalaMax(pequeno, LIMITES_CIFRAS) }).h).toBeLessThanOrEqual(LIMITES_CIFRAS.y1 - LIMITES_CIFRAS.y0 + 0.01);
    });

    it('el imán centra cerca del centro sin atrapar un arrastre lento (actúa sobre la posición cruda)', () => {
        expect(imantar({ dx: 15, dy: 3, escala: 0.7 }).dx).toBe(0);
        expect(imantar({ dx: 40, dy: 3, escala: 0.7 }).dx).toBe(40);
        let crudo = { dx: 0, dy: 0, escala: 0.6 };
        for (let i = 0; i < 10; i += 1) crudo = moverBloque(crudo, caja, LIMITES_CIFRAS, { dx: 5 });
        expect(imantar(crudo).dx).toBe(50);
    });

    it('un toque sobre las cifras (con margen de dedo) las mueve; fuera de ellas, la foto', () => {
        const c = cajaTransformada(caja, BLOQUE_INICIAL);
        expect(tocaLasCifras(caja, BLOQUE_INICIAL, c.x + c.w / 2, c.y + c.h / 2)).toBe(true);
        expect(tocaLasCifras(caja, BLOQUE_INICIAL, ANCHO / 2, 300)).toBe(false);
        expect(tocaLasCifras(caja, BLOQUE_INICIAL, ANCHO / 2, ALTO)).toBe(false);
    });
});

const _conFoto = async () => {
    render(<ShareDaySheet {...props} />);
    fireEvent.change(screen.getByTestId('share-day-foto'), { target: { files: [new File(['x'], 'e.jpg', { type: 'image/jpeg' })] } });
    await screen.findByRole('radiogroup', { name: /qué ajustas/i });
};

describe('[1078] la hoja', () => {
    it('la nota de privacidad va en el selector de la foto (con la foto puesta, el sitio es de la historia)', async () => {
        render(<ShareDaySheet {...props} />);
        fireEvent.click(await screen.findByRole('button', { name: /ponle tu foto/i }));
        expect(screen.getByText(/tu foto no sale de tu teléfono/i)).toBeInTheDocument();
    });

    it('«Tus cifras» cambia el deslizador a su tamaño y el JPEG sale con ese tamaño; «Restablecer» lo devuelve', async () => {
        await _conFoto();
        expect(screen.getByRole('radio', { name: /foto de fondo/i })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('button', { name: /restablecer/i })).toBeDisabled();
        fireEvent.click(screen.getByRole('radio', { name: /resumen del día/i }));
        const tam = screen.getByRole('slider', { name: /tamaño de tus cifras/i });
        expect(screen.getByText(/arrastra para mover · pellizca/i)).toBeInTheDocument();   // [1090] la pista, bajo la imagen
        fireEvent.change(tam, { target: { value: '0.6' } });
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)?.[1].bloque.escala).toBeCloseTo(0.6));
        const reset = screen.getByRole('button', { name: /restablecer/i });
        expect(reset).not.toBeDisabled();
        fireEvent.click(reset);
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)[1].bloque).toEqual(BLOQUE_INICIAL));
    });

    it('arrastrar desde las cifras las mueve (no la foto) y selecciona «Tus cifras»', async () => {
        await _conFoto();
        const lienzo = screen.getByRole('img', { name: /tu historia con tu foto/i });
        lienzo.getBoundingClientRect = () => ({ left: 0, top: 0, width: ANCHO / 4, height: ALTO / 4, right: ANCHO / 4, bottom: ALTO / 4 });
        const c = cajaTransformada(cajaDeCifras({ calorias: { valor: 2308, meta: 2050, pct: 113 } }, 'titular'), BLOQUE_INICIAL);
        const x = (c.x + c.w / 2) / 4;
        const y = (c.y + c.h / 2) / 4;
        fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: x, clientY: y });
        fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: x, clientY: y - 60 });
        fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: x, clientY: y - 60 });
        expect(screen.getByRole('radio', { name: /resumen del día/i })).toHaveAttribute('aria-checked', 'true');
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)?.[1].bloque.dy).toBeCloseTo(-240));
        expect(dibujarHistoriaConFoto.mock.calls.at(-1)[1].encuadre).toEqual({ zoom: 1, x: 0, y: 0 });
    });

    it('arrastrar fuera de las cifras sigue encuadrando la foto', async () => {
        await _conFoto();
        const lienzo = screen.getByRole('img', { name: /tu historia con tu foto/i });
        lienzo.getBoundingClientRect = () => ({ left: 0, top: 0, width: ANCHO / 4, height: ALTO / 4, right: ANCHO / 4, bottom: ALTO / 4 });
        // [1084] a media altura de la foto: arriba (y=80 → 320 px del lienzo) está ahora la fecha, que también se arrastra
        fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: 135, clientY: 150 });
        fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: 165, clientY: 150 });
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)?.[1].encuadre.x).toBeLessThan(0));
        expect(dibujarHistoriaConFoto.mock.calls.at(-1)[1].bloque).toEqual(BLOQUE_INICIAL);
    });
});
