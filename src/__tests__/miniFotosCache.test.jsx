import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import {
    MAX_MINI_FOTOS_CACHE,
    leerMiniFotosCache,
    guardarMiniFotosCache,
    borrarMiniFotoCache,
    borrarMiniFotosUsuarioCache,
} from '../utils/miniFotosCache';

const UID = 'user-abc';
const DATA_A = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const DATA_B = 'data:image/jpeg;base64,AAAA';

describe('miniFotosCache', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    it('guarda, lee por usuario/meal y aisla por usuario', () => {
        guardarMiniFotosCache(UID, 'meal-1', [{ id: null, url: DATA_A }]);
        expect(leerMiniFotosCache(UID, 'meal-1')).toEqual([{ id: null, url: DATA_A }]);
        expect(leerMiniFotosCache('otro-user', 'meal-1')).toBeNull();
    });

    it('ignora invitados y URLs que no sean data:image/', () => {
        guardarMiniFotosCache('guest', 'meal-1', [{ id: null, url: DATA_A }]);
        guardarMiniFotosCache(UID, 'meal-1', [{ id: null, url: 'blob:http://localhost/123' }]);
        expect(leerMiniFotosCache('guest', 'meal-1')).toBeNull();
        expect(leerMiniFotosCache(UID, 'meal-1')).toBeNull();
    });

    it('aplica tope LRU conservando las comidas más recientes', () => {
        for (let i = 1; i <= MAX_MINI_FOTOS_CACHE + 3; i += 1) {
            guardarMiniFotosCache(UID, `meal-${i}`, [{ id: null, url: DATA_A }]);
        }
        expect(leerMiniFotosCache(UID, 'meal-1')).toBeNull();
        expect(leerMiniFotosCache(UID, 'meal-3')).toBeNull();
        expect(leerMiniFotosCache(UID, `meal-${MAX_MINI_FOTOS_CACHE + 3}`)).toEqual([{ id: null, url: DATA_A }]);
    });

    it('borrarMiniFotoCache y borrarMiniFotosUsuarioCache limpian correctamente', () => {
        guardarMiniFotosCache(UID, 'meal-1', [{ id: null, url: DATA_A }]);
        guardarMiniFotosCache(UID, 'meal-2', [{ id: 'a1', url: DATA_B }]);
        borrarMiniFotoCache(UID, 'meal-1');
        expect(leerMiniFotosCache(UID, 'meal-1')).toBeNull();
        expect(leerMiniFotosCache(UID, 'meal-2')).toEqual([{ id: 'a1', url: DATA_B }]);

        borrarMiniFotosUsuarioCache(UID);
        expect(leerMiniFotosCache(UID, 'meal-2')).toBeNull();
    });

    it('useFotosDeComida pinta miniaturas cacheadas en el primer render sin esperar a IndexedDB', async () => {
        guardarMiniFotosCache(UID, 'meal-sync', [{ id: null, url: DATA_A }]);
        let resolverIdb;
        vi.doMock('../utils/fotosDeComidas', () => ({
            leerFotosDeComida: vi.fn(() => new Promise((r) => { resolverIdb = r; })),
            idsConFoto: vi.fn(async () => new Set()),
            leerFotoDeComida: vi.fn(async () => null),
            borrarFotoDeComida: vi.fn(async () => {}),
        }));
        const { useFotosDeComida } = await import('../hooks/useFotosDeComidas');
        const Probe = () => {
            const fotos = useFotosDeComida(UID, 'meal-sync', 'mini');
            return <div data-testid="count" data-url={fotos[0]?.url || ''}>{fotos.length}</div>;
        };
        const { getByTestId } = render(<Probe />);
        // Primer fotograma síncrono antes de que IndexedDB resuelva
        expect(getByTestId('count').textContent).toBe('1');
        expect(getByTestId('count').getAttribute('data-url')).toBe(DATA_A);
        if (resolverIdb) {
            resolverIdb([]);
            await waitFor(() => expect(getByTestId('count').textContent).toBe('0'));
        }
        vi.doUnmock('../utils/fotosDeComidas');
    });
});
