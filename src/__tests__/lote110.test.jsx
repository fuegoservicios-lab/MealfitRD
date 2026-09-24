// [P1-PLAN-LOTE-110 · 2026-09-19] «Subir una foto en su lugar» (la salida del visor de cámara) en la app nativa.
// El lote 105 llevó «Elegir de galería» a la fototeca directa, pero la salida del visor seguía haciendo click al
// input de la web: en nativo, otra vez la hoja de iOS de tres opciones (captura del dueño, ya con el build nativo).
// Los dos escáneres —comida y Nevera— comparten visor y compartían el defecto. En la web nada cambia.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScanMealModal from '../components/dashboard/ScanMealModal';
import { PantryScanButton } from '../components/pantry/PantryScanButton';
import { isNativeApp } from '../config/platform';
import { chooseNativeGalleryImage, chooseNativeGalleryImages } from '../utils/nativeChatImagePicker';
import { captureException } from '../utils/observability';
import { toast } from 'sonner';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn(async () => ({ ok: true, json: async () => ({}) })) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('../components/common/CameraViewfinder', () => ({
    default: ({ isOpen, onFallbackToFile }) => (isOpen
        ? <button type="button" onClick={onFallbackToFile}>salida-del-visor</button>
        : null),
}));
vi.mock('../config/platform', () => ({ isNativeApp: vi.fn(() => false) }));
vi.mock('../utils/observability', () => ({ captureException: vi.fn() }));
vi.mock('../utils/nativeChatImagePicker', () => ({
    chooseNativeGalleryImage: vi.fn(),
    // [P1-PLAN-LOTE-221] el de comida elige VARIAS fotos (un plato por foto)
    chooseNativeGalleryImages: vi.fn(),
    isNativePickerCancellation: (e) => `${e?.code || ''} ${e?.message || ''}`.toLowerCase().includes('cancel'),
}));

const espiarInputs = () => [...document.querySelectorAll('input[type="file"]')]
    .map((i) => vi.spyOn(i, 'click').mockImplementation(() => {}));
const clics = (espias) => espias.reduce((n, e) => n + e.mock.calls.length, 0);

const telefonoConCamara = () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(pointer: coarse)', media: query, onchange: null,
        addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
};

const abrirEscanerDeComida = () => {
    telefonoConCamara();
    render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
    const espias = espiarInputs();
    fireEvent.click(screen.getByText('Usar la cámara'));
    fireEvent.click(screen.getByText('salida-del-visor'));
    return espias;
};

const abrirEscanerDeNevera = () => {
    telefonoConCamara();
    render(<PantryScanButton enabled inventory={[]} onInventoryChanged={vi.fn()} />);
    const espias = espiarInputs();
    fireEvent.click(screen.getByRole('button', { name: /Escanear mi nevera con una foto/ }));
    fireEvent.click(screen.getByText('salida-del-visor'));
    return espias;
};

beforeEach(() => {
    vi.mocked(isNativeApp).mockReturnValue(false);
    vi.mocked(chooseNativeGalleryImage).mockReset();
    vi.mocked(chooseNativeGalleryImages).mockReset();
    vi.mocked(captureException).mockReset();
    toast.error.mockReset();
});

// [P1-PLAN-LOTE-221] Cada escáner con SU selector: el de comida elige varias fotos (un plato por foto), el de la
// Nevera una. Se resuelve al correr el test (el mock ya existe entonces).
describe.each([
    ['escáner de comida', abrirEscanerDeComida, 'ScanMealModal', () => chooseNativeGalleryImages],
    ['escáner de la Nevera', abrirEscanerDeNevera, 'PantryScanButton', () => chooseNativeGalleryImage],
])('«Subir una foto en su lugar» — %s', (_nombre, abrir, componente, selectorDe) => {
    it('en la web abre el input de siempre', () => {
        const espias = abrir();
        expect(clics(espias)).toBe(1);
        expect(selectorDe()).not.toHaveBeenCalled();
    });

    it('en nativo va a la fototeca directa y NO toca el input (la hoja de iOS)', async () => {
        vi.mocked(isNativeApp).mockReturnValue(true);
        vi.mocked(selectorDe()).mockResolvedValue(null);
        const espias = abrir();
        await waitFor(() => expect(selectorDe()).toHaveBeenCalledTimes(1));
        expect(clics(espias)).toBe(0);
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('en nativo, cancelar no es error', async () => {
        vi.mocked(isNativeApp).mockReturnValue(true);
        vi.mocked(selectorDe()).mockRejectedValue(new Error('User cancelled photos app'));
        const espias = abrir();
        await waitFor(() => expect(selectorDe()).toHaveBeenCalledTimes(1));
        expect(clics(espias)).toBe(0);
        expect(captureException).not.toHaveBeenCalled();
    });

    it('en nativo, un fallo real se dice con su código, se reporta y cae al input', async () => {
        vi.mocked(isNativeApp).mockReturnValue(true);
        vi.mocked(selectorDe()).mockRejectedValue(Object.assign(new Error('x'), { code: 'UNIMPLEMENTED' }));
        const espias = abrir();
        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
        expect(toast.error.mock.calls[0][1]).toEqual({ description: '[UNIMPLEMENTED]' });
        expect(captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { component: componente, action: 'native_gallery_picker' } });
        expect(clics(espias)).toBe(1);
    });
});
