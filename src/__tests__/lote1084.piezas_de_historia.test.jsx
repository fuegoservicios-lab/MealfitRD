// [P1-PLAN-LOTE-1084 · 2026-11-18] Los textos sueltos de la historia (marca, fecha, sitio, pregunta) se mueven y se
// quitan (el dueño: «que se puedan mover … y eliminar al gusto personal»).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../utils/historiaConFoto', async (orig) => ({
    ...(await orig()),
    cargarFoto: vi.fn(async () => ({ width: 1200, height: 1600 })),
    dibujarHistoriaConFoto: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { dibujarHistoriaConFoto, piezasDeLaHistoria, pintarHistoria, ANCHO, ALTO } from '../utils/historiaConFoto';
import { moverPieza, piezaEn, alternarPieza, piezasEnSuSitio, piezasMovidas, cajaDePieza } from '../utils/piezasDeHistoria';
import { SITIO } from '../utils/compartirDia';
import ShareDaySheet from '../components/dashboard/ShareDaySheet';

const R = { calorias: { valor: 2308, meta: 2050, pct: 113 }, macros: [], fecha: new Date(2026, 10, 18, 12) };
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

describe('[1084] las piezas', () => {
    it('cada estilo trae las suyas: arriba marca y fecha; abajo sitio y pregunta, el sello o el sitio', () => {
        expect(piezasDeLaHistoria(R, 'titular').map((d) => d.id)).toEqual(['marca', 'fecha', 'sitio', 'pregunta']);
        expect(piezasDeLaHistoria(R, 'minimal').map((d) => d.id)).toEqual(['marca', 'fecha', 'sello']);
        expect(piezasDeLaHistoria(R, 'cristal').map((d) => d.id)).toEqual(['marca', 'fecha', 'sitio']);
        for (const d of piezasDeLaHistoria(R, 'titular')) {
            expect(d.caja.x).toBeGreaterThanOrEqual(0);
            expect(d.caja.x + d.caja.w).toBeLessThanOrEqual(ANCHO);
        }
    });

    it('se mueven hasta el borde (su centro no sale del lienzo), se quitan y vuelven a su sitio sin reaparecer', () => {
        const sitio = piezasDeLaHistoria(R, 'titular').find((d) => d.id === 'sitio');
        const lejos = moverPieza({}, sitio, { dx: 99999, dy: 99999 }, ANCHO, ALTO);
        const c = cajaDePieza(sitio, lejos);
        expect(c.x + c.w / 2).toBeCloseTo(ANCHO);    // [1097] libre como el resumen
        expect(c.y + c.h / 2).toBeCloseTo(ALTO);
        const quitada = alternarPieza(lejos, 'sitio');
        expect(quitada.sitio.oculta).toBe(true);
        expect(piezasMovidas(quitada)).toBe(true);
        expect(piezasEnSuSitio(quitada)).toEqual({ sitio: { dx: 0, dy: 0, oculta: true } });
    });

    it('el dedo encuentra la pieza visible (con margen) y no la oculta', () => {
        const defs = piezasDeLaHistoria(R, 'titular');
        const sitio = defs.find((d) => d.id === 'sitio').caja;
        const x = sitio.x + sitio.w / 2;
        const y = sitio.y + sitio.h / 2;
        expect(piezaEn(defs, {}, x, y)).toBe('sitio');
        expect(piezaEn(defs, {}, x, y + 40, 50)).toBe('sitio');
        expect(piezaEn(defs, { sitio: { oculta: true } }, x, y)).toBeNull();
    });

    it('una pieza quitada no se pinta; una movida se pinta movida', () => {
        const textos = [];
        const ctx = new Proxy({}, {
            get: (o, k) => {
                if (k in o) return o[k];
                if (k === 'fillText') return (s, x, y) => textos.push({ s: String(s), x, y });
                if (k === 'measureText') return () => ({ width: 10 });
                if (typeof k === 'string' && k.startsWith('create')) return () => ({ addColorStop() {} });
                return () => {};
            },
            set: (o, k, v) => { o[k] = v; return true; },
        });
        const lienzo = { width: 0, height: 0, getContext: () => ctx };
        expect(pintarHistoria(lienzo, R, { estilo: 'titular', piezas: { sitio: { oculta: true } } })).toBe(true);
        expect(textos.some((x) => x.s === SITIO)).toBe(false);
        textos.length = 0;
        expect(pintarHistoria(lienzo, R, { estilo: 'titular' })).toBe(true);
        expect(textos.some((x) => x.s === SITIO)).toBe(true);
    });
});

describe('[1084] la hoja', () => {
    const _conFoto = async () => {
        render(<ShareDaySheet {...props} />);
        fireEvent.change(screen.getByTestId('share-day-foto'), { target: { files: [new File(['x'], 'e.jpg', { type: 'image/jpeg' })] } });
        await screen.findByRole('radiogroup', { name: /qué ajustas/i });
        const lienzo = screen.getByRole('img', { name: /tu historia con tu foto/i });
        lienzo.getBoundingClientRect = () => ({ left: 0, top: 0, width: ANCHO / 4, height: ALTO / 4, right: ANCHO / 4, bottom: ALTO / 4 });
        return lienzo;
    };

    it('los chips quitan y vuelven a poner cada texto, y el JPEG sale así', async () => {
        await _conFoto();
        const chip = screen.getByRole('button', { name: SITIO });
        expect(chip).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: '¿Y tú, cómo vas hoy?' })).toBeInTheDocument();
        fireEvent.click(chip);
        expect(chip).toHaveAttribute('aria-pressed', 'false');
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)?.[1].piezas?.sitio?.oculta).toBe(true));
        fireEvent.click(chip);
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)?.[1].piezas?.sitio?.oculta).toBe(false));
    });

    it('arrastrar un texto lo mueve a él (no las cifras ni la foto), y «Restablecer» lo devuelve', async () => {
        const lienzo = await _conFoto();
        const sitio = piezasDeLaHistoria(R, 'titular').find((d) => d.id === 'sitio').caja;
        const x = (sitio.x + sitio.w / 2) / 4;
        const y = (sitio.y + sitio.h / 2) / 4;
        fireEvent.pointerDown(lienzo, { pointerId: 1, clientX: x, clientY: y });
        fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: x, clientY: y - 100 });
        fireEvent.pointerUp(lienzo, { pointerId: 1, clientX: x, clientY: y - 100 });
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)?.[1].piezas?.sitio?.dy).toBeCloseTo(-400));
        const ultima = dibujarHistoriaConFoto.mock.calls.at(-1)[1];
        expect(ultima.bloque).toEqual({ dx: 0, dy: 0, escala: 1 });
        expect(ultima.encuadre).toEqual({ zoom: 1, x: 0, y: 0 });
        fireEvent.click(screen.getByRole('radio', { name: /resumen del día/i }));
        fireEvent.click(screen.getByRole('button', { name: /restablecer/i }));
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)?.[1].piezas?.sitio?.dy).toBe(0));
    });

    it('en la semana, los textos también: la pregunta es la de la semana', async () => {
        render(<ShareDaySheet onClose={() => {}} semana={{ numero: 3, periodo: '1 – 7 nov', dias: [], enMeta: 2, estrellas: 0 }} />);
        expect(screen.getByRole('button', { name: '¿Y tú, cómo va tu semana?' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Fechas' })).toBeInTheDocument();
    });
});
