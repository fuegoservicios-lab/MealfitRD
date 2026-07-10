/**
 * [P2-8 · offline] Hook de conectividad + banner global "Sin conexión".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, render, screen, act } from '@testing-library/react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import OfflineBanner from '../../components/common/OfflineBanner';

const setNavigatorOnline = (value) => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
};

afterEach(() => {
    setNavigatorOnline(true);
    vi.restoreAllMocks();
});

describe('useOnlineStatus (P2-8)', () => {
    it('refleja navigator.onLine inicial', () => {
        setNavigatorOnline(false);
        const { result } = renderHook(() => useOnlineStatus());
        expect(result.current).toBe(false);
    });

    it('reacciona a los eventos online/offline', () => {
        setNavigatorOnline(true);
        const { result } = renderHook(() => useOnlineStatus());
        expect(result.current).toBe(true);
        act(() => {
            setNavigatorOnline(false);
            window.dispatchEvent(new Event('offline'));
        });
        expect(result.current).toBe(false);
        act(() => {
            setNavigatorOnline(true);
            window.dispatchEvent(new Event('online'));
        });
        expect(result.current).toBe(true);
    });
});

describe('OfflineBanner (P2-8)', () => {
    it('no renderiza nada cuando hay conexión', () => {
        setNavigatorOnline(true);
        render(<OfflineBanner />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('muestra el aviso es-DO accesible (role=status) al quedar offline', () => {
        setNavigatorOnline(false);
        render(<OfflineBanner />);
        const banner = screen.getByRole('status');
        expect(banner).toHaveTextContent(/sin conexión/i);
        act(() => {
            setNavigatorOnline(true);
            window.dispatchEvent(new Event('online'));
        });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});
