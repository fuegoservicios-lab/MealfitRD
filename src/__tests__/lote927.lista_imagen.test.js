// [P1-PLAN-LOTE-927 · 2026-09-30] En el teléfono la lista de compras sale como imagen (una columna, letra cómoda).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const compartirMock = vi.fn();
vi.mock('../utils/compartirDia', () => ({
    archivoDeImagen: (blob, nombre) => ({ blob, name: nombre }),
    compartir: (...a) => compartirMock(...a),
    puedeCompartirImagenes: () => true, puedeCompartirNativo: () => false,
}));
vi.mock('../config/platform', () => ({ isNativeApp: () => false }));

const { esImagenMovil, guardarListaComoImagen, guardarPaginaLista, LAYOUT_IMAGEN_MOVIL } = await import('../utils/listaComoImagen');

function html2pdfFalso() {
    const canvas = { toBlob: (cb) => cb(new Blob(['png'], { type: 'image/png' })) };
    const cadena = { set: () => cadena, from: () => cadena, toCanvas: () => cadena, get: async () => canvas };
    return () => cadena;
}

describe('lote 927 · lista de compras como imagen en el teléfono', () => {
    beforeEach(() => compartirMock.mockReset());

    it('decide por el ancho de pantalla', () => {
        window.matchMedia = vi.fn().mockReturnValue({ matches: true });
        expect(esImagenMovil()).toBe(true);
        window.matchMedia = vi.fn().mockReturnValue({ matches: false });
        expect(esImagenMovil()).toBe(false);
    });

    it('la densidad de la imagen es la cómoda y de una columna', () => {
        expect(LAYOUT_IMAGEN_MOVIL.isDense || LAYOUT_IMAGEN_MOVIL.isUltraDense || LAYOUT_IMAGEN_MOVIL.isHyperDense).toBe(false);
        expect(LAYOUT_IMAGEN_MOVIL.columnCount).toBe(1);
    });

    it('prepara la imagen antes de compartir desde un toque nuevo; si no se puede, la descarga', async () => {
        const el = document.createElement('div');
        el.innerHTML = '<div><h1>Lista de compras</h1><div data-lista-categoria><h3>Frutas</h3><ul><li><span>Manzanas</span></li></ul></div></div>';
        const [imagen] = await guardarListaComoImagen({ html2pdf: html2pdfFalso(), element: el, nombre: 'l.png' });
        expect(imagen.nombre).toBe('l.png');
        expect(compartirMock).not.toHaveBeenCalled();
        compartirMock.mockResolvedValue('compartido');
        expect(await guardarPaginaLista(imagen)).toBe('compartido');
        globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
        globalThis.URL.revokeObjectURL = vi.fn();
        compartirMock.mockResolvedValue('fallo');
        expect(await guardarPaginaLista(imagen)).toBe('descargado');
        compartirMock.mockResolvedValue('cancelado');
        expect(await guardarPaginaLista(imagen)).toBe('cancelado');
    });

    it('el panel usa la imagen en el teléfono y el PDF en el escritorio', () => {
        const s = readFileSync(resolve(process.cwd(), 'src/pages/Dashboard.jsx'), 'utf8');
        expect(s).toContain('const layout = _imagenMovil ? LAYOUT_IMAGEN_MOVIL : computePdfLayoutDensity(totalItems);');
        expect(s).toContain('guardarListaComoImagen({ html2pdf, element,');
        expect(s).toContain("html2pdf().set(opt).from(element).save()");
    });
});
