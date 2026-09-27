// [P1-PLAN-LOTE-386 · 2026-09-27] «Compartir tu día»: la imagen es LA forma de compartir, y va sola.
//
// El dueño tocó el botón verde «WhatsApp» y le llegó un bloque de texto: ese botón era un enlace `wa.me`, que solo
// lleva texto. La imagen salía por el morado «Compartir»… y además acompañada del mismo texto («se ve raro»). Ahora:
//   · si el teléfono comparte imágenes, hay UNA acción clara: «Compartir imagen» (WhatsApp, Instagram, Mensajes…), y la
//     imagen viaja SIN texto;
//   · el texto (WhatsApp por enlace, copiar) solo aparece donde no se puede compartir la imagen —o si el sistema la
//     rechazó—, junto a «Descargar imagen» cuando se puede.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../config/platform', async (orig) => ({ ...(await orig()), isNativeApp: vi.fn(() => false) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { toast } from 'sonner';
import { isNativeApp } from '../config/platform';
import ShareDaySheet from '../components/dashboard/ShareDaySheet';
import { compartir } from '../utils/compartirDia';

const props = {
    onClose: vi.fn(),
    consumed: { calories: 1205, protein: 73, carbs: 125, fats: 42, meals: [{ meal_name: 'Mangú con huevo', calories: 510 }], micros: null, microsCoverage: { con_datos: 0, total: 1 } },
    metas: { calories: 2050, protein: 134, carbs: 251, fats: 57 },
    microMetas: null,
};

beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.mocked(isNativeApp).mockReturnValue(false);
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('[386] la imagen primero, y sola', () => {
    it('con imagen: una sola acción «Compartir imagen», sin texto pegado ni botones de texto', async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        await screen.findByRole('img', { name: /mi día/i });
        expect(screen.getByText('WhatsApp, Instagram, Mensajes…')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /whatsapp/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /copiar texto/i })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /compartir imagen/i }));
        await waitFor(() => expect(share).toHaveBeenCalled());
        expect(share.mock.calls[0][0]).toEqual({ files: [expect.any(File)] });
    });

    it('sin forma de compartir la imagen: descargarla y, como reserva, el texto', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        expect(await screen.findByRole('button', { name: /descargar imagen/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /texto por whatsapp/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /copiar texto/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /compartir imagen/i })).toBeNull();
    });

    it('si el sistema rechaza la imagen, lo dice y aparecen las alternativas', async () => {
        const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
        vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        await screen.findByRole('img', { name: /mi día/i });
        fireEvent.click(screen.getByRole('button', { name: /compartir imagen/i }));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(await screen.findByRole('link', { name: /texto por whatsapp/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /copiar texto/i })).toBeInTheDocument();
    });
});

describe('[386] compartir(): con archivo, solo el archivo', () => {
    it('Web Share: sin `text` cuando hay imagen; texto solo si no la hay', async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { share, canShare: () => true });
        const archivo = new File(['x'], 'mi-dia.png', { type: 'image/png' });
        await compartir({ archivo, texto: 't' });
        expect(share).toHaveBeenCalledWith({ files: [archivo] });
        share.mockClear();
        await compartir({ archivo: null, texto: 't' });
        expect(share).toHaveBeenCalledWith({ text: 't' });
    });
});
