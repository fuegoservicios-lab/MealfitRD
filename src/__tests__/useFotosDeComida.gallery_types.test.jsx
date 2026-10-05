import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFotosDeComida } from '../hooks/useFotosDeComidas';
import { leerFotosDeComida } from '../utils/fotosDeComidas';

vi.mock('../utils/fotosDeComidas', () => ({ leerFotosDeComida: vi.fn() }));
const photos = n => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, blob: new Blob(['photo']) }));
let create, revoke;
beforeEach(() => {
    create = vi.fn().mockImplementation(() => `blob:${create.mock.calls.length}`);
    revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    vi.mocked(leerFotosDeComida).mockReset().mockResolvedValue(photos(2));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('galería de fotos o miniaturas', () => {
    it('la fila solicita miniaturas y libera sus URLs al desmontarse', async () => {
        const { result, unmount } = renderHook(() => useFotosDeComida('u1', 'm1', 'mini'));
        await waitFor(() => expect(result.current).toHaveLength(2));
        expect(leerFotosDeComida).toHaveBeenCalledExactlyOnceWith('u1', 'm1', 'mini');
        unmount();
        expect(revoke).toHaveBeenCalledTimes(2);
    });

    it('la ficha continúa usando fotos completas por defecto', async () => {
        const { result } = renderHook(() => useFotosDeComida('u1', 'm1'));
        await waitFor(() => expect(result.current).toHaveLength(2));
        expect(leerFotosDeComida).toHaveBeenCalledWith('u1', 'm1', 'foto');
    });

    it('guardar una foto actualiza la cantidad y libera las miniaturas anteriores', async () => {
        const { result } = renderHook(() => useFotosDeComida('u1', 'm1', 'mini'));
        await waitFor(() => expect(result.current).toHaveLength(2));
        vi.mocked(leerFotosDeComida).mockResolvedValue(photos(3));
        act(() => window.dispatchEvent(new CustomEvent('mealfit:fotos-de-comidas', { detail: { userId: 'u1' } })));
        await waitFor(() => expect(result.current).toHaveLength(3));
        expect(revoke).toHaveBeenCalledTimes(2);
    });

    it('un cambio de usuario no muestra las fotos de la cuenta anterior', async () => {
        const { result, rerender } = renderHook(({ user }) => useFotosDeComida(user, 'm1', 'mini'), { initialProps: { user: 'u1' } });
        await waitFor(() => expect(result.current).toHaveLength(2));
        vi.mocked(leerFotosDeComida).mockReturnValue(new Promise(() => {}));
        rerender({ user: 'u2' });
        expect(result.current).toEqual([]);
        expect(revoke).toHaveBeenCalledTimes(2);
    });
});
