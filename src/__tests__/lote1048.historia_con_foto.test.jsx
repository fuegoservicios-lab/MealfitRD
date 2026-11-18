// [P1-PLAN-LOTE-1048] La historia con tu foto: la selfie de fondo, las cifras encima, tres estilos, y la foto no sale
// del teléfono (se dibuja aquí).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../utils/historiaConFoto', async (orig) => ({
    ...(await orig()),
    cargarFoto: vi.fn(async () => ({ width: 1200, height: 1600 })),
    dibujarHistoriaConFoto: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { toast } from 'sonner';
import { dibujarTarjetaDelDia } from '../utils/tarjetaDelDia';
import { cargarFoto, dibujarHistoriaConFoto, encajar, moverEncuadre, metaCumplida, ENCUADRE_INICIAL, ZOOM_MAX, ESTILOS, ANCHO, ALTO } from '../utils/historiaConFoto';
import { archivoDeImagen } from '../utils/compartirDia';
import ShareDaySheet from '../components/dashboard/ShareDaySheet';
import { disenoDelDia } from '../utils/disenosDeHistoria';

const props = {
    onClose: vi.fn(),
    consumed: { calories: 2340, protein: 142, carbs: 268, fats: 71, meals: [{ meal_name: 'Mangú', calories: 510 }], micros: null, microsCoverage: { con_datos: 0, total: 1 } },
    metas: { calories: 3350, protein: 157, carbs: 471, fats: 93 },
};
const _foto = () => new File(['x'], 'espejo.jpg', { type: 'image/jpeg' });

beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn().mockResolvedValue(undefined), canShare: () => true, clipboard: { writeText: vi.fn() } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('[1048] encajar (recorte «cover»)', () => {
    it('una foto 3:4 llena el 9:16 recortando los lados, centrada y sin deformar', () => {
        const r = encajar(1200, 1600);
        expect(r.sh).toBeCloseTo(1600);
        expect(r.sw).toBeCloseTo(900);
        expect(r.sx).toBeCloseTo(150);
        expect(r.sy).toBeCloseTo(0);
        expect(r.sw / r.sh).toBeCloseTo(ANCHO / ALTO);
    });
    it('una foto apaisada recorta los lados; una muy alta, arriba y abajo', () => {
        expect(encajar(4000, 3000).sy).toBeCloseTo(0);
        expect(encajar(1000, 4000).sx).toBeCloseTo(0);
        expect(encajar(1000, 4000).sy).toBeGreaterThan(0);
    });
    it('sin medidas no divide entre cero', () => {
        expect(encajar(0, 0)).toMatchObject({ sx: 0, sy: 0, sw: 0, sh: 0 });
    });
});

describe('[1048] encuadre: arrastrar y acercar', () => {
    const foto = { width: 1200, height: 1600 };
    it('x = -1 / 1 llega a cada borde; el zoom recorta menos foto', () => {
        expect(encajar(1200, 1600, ANCHO, ALTO, { zoom: 1, x: -1, y: 0 }).sx).toBeCloseTo(0);
        expect(encajar(1200, 1600, ANCHO, ALTO, { zoom: 1, x: 1, y: 0 }).sx).toBeCloseTo(300);
        const z = encajar(1200, 1600, ANCHO, ALTO, { zoom: 2, x: 0, y: 0 });
        expect(z.sw).toBeCloseTo(450);
        expect(z.sh).toBeCloseTo(800);
    });
    it('la foto sigue al dedo: arrastrar a la derecha muestra más del lado izquierdo', () => {
        const e = moverEncuadre(ENCUADRE_INICIAL, foto, { dx: 120 });
        expect(e.x).toBeLessThan(0);
        expect(e.y).toBe(0);                           // una 3:4 en 9:16 no tiene recorrido vertical sin zoom
    });
    it('nunca sale del borde ni pasa del zoom máximo, y nunca baja de llenar el lienzo', () => {
        expect(moverEncuadre(ENCUADRE_INICIAL, foto, { dx: 99999 }).x).toBe(-1);
        expect(moverEncuadre(ENCUADRE_INICIAL, foto, { factor: 50 }).zoom).toBe(ZOOM_MAX);
        expect(moverEncuadre({ zoom: 1.5, x: 0, y: 0 }, foto, { factor: 0.1 }).zoom).toBe(1);
    });
    it('con zoom aparece el recorrido vertical', () => {
        expect(moverEncuadre({ zoom: 2, x: 0, y: 0 }, foto, { dy: -200 }).y).toBeGreaterThan(0);
    });
});

describe('[1048] «Meta cumplida»', () => {
    const r = (valor, meta) => ({ calorias: { valor, meta, pct: meta ? Math.round((valor / meta) * 100) : 0 } });
    it('entre el 90 % y el 110 % de la meta', () => {
        expect(metaCumplida(r(3215, 3350))).toBe(true);
        expect(metaCumplida(r(3000, 3350))).toBe(true);    // 90 %
        expect(metaCumplida(r(2340, 3350))).toBe(false);   // 70 %
        expect(metaCumplida(r(4000, 3350))).toBe(false);   // 119 %
        expect(metaCumplida(r(2000, 0))).toBe(false);      // sin meta
    });
});

describe('[1048] la hoja con foto', () => {
    it('al abrir invita a poner la foto y sigue dibujando la tarjeta de siempre', async () => {
        render(<ShareDaySheet {...props} />);
        expect(await screen.findByRole('button', { name: /ponle tu foto/i })).toBeInTheDocument();
        expect(dibujarTarjetaDelDia).toHaveBeenCalledTimes(1);
        expect(dibujarHistoriaConFoto).not.toHaveBeenCalled();
    });

    it('con la foto elegida dibuja la historia, ofrece los tres estilos y esconde el formato', async () => {
        render(<ShareDaySheet {...props} />);
        fireEvent.change(screen.getByTestId('share-day-foto'), { target: { files: [_foto()] } });
        await waitFor(() => expect(dibujarHistoriaConFoto).toHaveBeenCalled());
        expect(cargarFoto).toHaveBeenCalledTimes(1);
        const [resumen, opciones] = dibujarHistoriaConFoto.mock.calls[0];
        expect(resumen.calorias.valor).toBe(2340);
        expect(opciones).toMatchObject({ estilo: disenoDelDia().clave, foto: { width: 1200, height: 1600 } });
        const estilos = await screen.findByRole('radiogroup', { name: /estilo de la historia/i });
        expect(estilos.querySelectorAll('[role="radio"]')).toHaveLength(ESTILOS.length);
        expect(screen.queryByRole('radiogroup', { name: /formato de la imagen/i })).toBeNull();
        expect(screen.queryByText(/tu foto no sale de tu teléfono/i)).toBeNull();   // [1078] va en el selector de la foto

        fireEvent.click(screen.getByRole('radio', { name: /Bruma/ }));
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)[1].estilo).toBe('cristal'));
    });

    it('el deslizador acerca la foto y el JPEG sale con ese encuadre; la vista previa es un lienzo', async () => {
        render(<ShareDaySheet {...props} />);
        fireEvent.change(screen.getByTestId('share-day-foto'), { target: { files: [_foto()] } });
        const zoom = await screen.findByRole('slider', { name: /acercar la foto/i });
        expect(screen.getByRole('img', { name: /tu historia con tu foto/i }).tagName).toBe('CANVAS');
        fireEvent.change(zoom, { target: { value: '2' } });
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)[1].encuadre.zoom).toBeCloseTo(2));
    });

    it('comparte la historia como JPEG y «Quitar foto» vuelve a la tarjeta', async () => {
        render(<ShareDaySheet {...props} />);
        fireEvent.change(screen.getByTestId('share-day-foto'), { target: { files: [_foto()] } });
        await screen.findByRole('radiogroup', { name: /estilo de la historia/i });
        const boton = screen.getByRole('button', { name: /compartir imagen/i });
        await waitFor(() => expect(boton).not.toBeDisabled());
        fireEvent.click(boton);
        await waitFor(() => expect(navigator.share).toHaveBeenCalled());
        const archivo = navigator.share.mock.calls[0][0].files[0];
        expect(archivo.type).toBe('image/jpeg');
        expect(archivo.name).toBe('mi-dia-bioboros.jpg');

        fireEvent.click(screen.getByRole('button', { name: /quitar foto/i }));
        expect(await screen.findByRole('button', { name: /ponle tu foto/i })).toBeInTheDocument();
        await waitFor(() => expect(dibujarTarjetaDelDia).toHaveBeenCalledTimes(2));
    });

    it('una foto que no se puede abrir avisa y deja la hoja como estaba', async () => {
        vi.mocked(cargarFoto).mockResolvedValueOnce(null);
        render(<ShareDaySheet {...props} />);
        fireEvent.change(screen.getByTestId('share-day-foto'), { target: { files: [_foto()] } });
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(dibujarHistoriaConFoto).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /ponle tu foto/i })).toBeInTheDocument();
    });
});

describe('[1048] contratos', () => {
    it('un PNG sigue saliendo como PNG (la tarjeta de siempre)', () => {
        const a = archivoDeImagen(new Blob(['p'], { type: 'image/png' }));
        expect(a.type).toBe('image/png');
        expect(a.name).toBe('mi-dia-bioboros.png');
    });
    it('la foto no viaja: el módulo no hace peticiones de red', () => {
        const src = fs.readFileSync(path.resolve(__dirname, '..', 'utils', 'historiaConFoto.js'), 'utf8');
        expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|axios|sendBeacon/);
    });
    it('los textos de la hoja no bajan de 12 px', () => {
        const css = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'dashboard', 'ShareDaySheet.module.css'), 'utf8');
        const rem = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].map((m) => Number(m[1]) * 16);
        expect(Math.min(...rem)).toBeGreaterThanOrEqual(12);
    });
});
