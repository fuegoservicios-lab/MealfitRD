// [P1-PLAN-LOTE-107 · 2026-09-18] La fototeca directa de la app nativa no falla en silencio.
// En nativo, «Elegir de galería» usa el plugin (lote 105). Si el plugin fallaba, el escáner caía CALLADO al input de
// la web — que enseña la hoja de tres opciones de iOS — y desde fuera era indistinguible de «no se hizo nada» (el
// dueño, dos veces: «sigue igual»). Ahora: cancelar no es error; cualquier otro fallo se reporta, se dice con su
// código y después se abre el input para no dejar al usuario sin camino. En la web (PWA) nada cambia: allí el menú
// de iOS no se puede evitar.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScanMealModal from '../components/dashboard/ScanMealModal';
import { isNativeApp } from '../config/platform';
import { chooseNativeGalleryImage } from '../utils/nativeChatImagePicker';
import { captureException } from '../utils/observability';
import { toast } from 'sonner';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn(async () => ({ ok: true, json: async () => ({}) })) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('../components/common/CameraViewfinder', () => ({ default: () => null }));
vi.mock('../config/platform', () => ({ isNativeApp: vi.fn(() => false) }));
vi.mock('../utils/observability', () => ({ captureException: vi.fn() }));
vi.mock('../utils/nativeChatImagePicker', () => ({
    chooseNativeGalleryImage: vi.fn(),
    isNativePickerCancellation: (e) => `${e?.code || ''} ${e?.message || ''}`.toLowerCase().includes('cancel'),
}));

const abrirGaleria = () => {
    render(<ScanMealModal isOpen onClose={vi.fn()} userId="u1" />);
    const inputs = document.querySelectorAll('input[type="file"]');
    const clic = vi.spyOn(inputs[inputs.length - 1], 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByText('Elegir de galería'));
    return clic;
};

beforeEach(() => {
    vi.mocked(isNativeApp).mockReturnValue(false);
    vi.mocked(chooseNativeGalleryImage).mockReset();
    vi.mocked(captureException).mockReset();
    toast.error.mockReset();
});

describe('«Elegir de galería»', () => {
    it('en la web abre el input de siempre y no toca el plugin', () => {
        const clic = abrirGaleria();
        expect(clic).toHaveBeenCalledTimes(1);
        expect(chooseNativeGalleryImage).not.toHaveBeenCalled();
    });

    it('en nativo usa el plugin; cancelar no es error ni abre el input', async () => {
        vi.mocked(isNativeApp).mockReturnValue(true);
        vi.mocked(chooseNativeGalleryImage).mockRejectedValue(Object.assign(new Error('User cancelled photos app'), { code: 'OS-PLUG-CAMR-0006' }));
        const clic = abrirGaleria();
        await waitFor(() => expect(chooseNativeGalleryImage).toHaveBeenCalledTimes(1));
        expect(clic).not.toHaveBeenCalled();
        expect(toast.error).not.toHaveBeenCalled();
        expect(captureException).not.toHaveBeenCalled();
    });

    it('en nativo, un fallo real se reporta, se dice con su código y después cae al input', async () => {
        vi.mocked(isNativeApp).mockReturnValue(true);
        vi.mocked(chooseNativeGalleryImage).mockRejectedValue(Object.assign(new Error('plugin not implemented'), { code: 'UNIMPLEMENTED' }));
        const clic = abrirGaleria();
        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
        expect(toast.error.mock.calls[0][0]).toBe('No pudimos abrir tus fotos. Revisa los permisos e inténtalo de nuevo.');
        expect(toast.error.mock.calls[0][1]).toEqual({ description: '[UNIMPLEMENTED]' });
        expect(captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { component: 'ScanMealModal', action: 'native_gallery_picker' } });
        expect(clic).toHaveBeenCalledTimes(1);
    });
});
