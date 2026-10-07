import React, { useRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

const onClose = () => {};
function Sheet({ isOpen, explicitTrigger = true }) {
    const triggerRef = useRef(null);
    const { containerRef } = useModalAccessibility({
        isOpen, onClose, returnFocusRef: explicitTrigger ? triggerRef : undefined,
    });
    // Keep the sheet mounted after close, as AnimatePresence does during exit.
    return <>
        <button ref={triggerRef}>Añadir alimento</button>
        <div ref={containerRef} role="dialog" tabIndex={-1}><input autoFocus aria-label="Alimento" /></div>
    </>;
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('cierre de hoja con teclado', () => {
    it('devuelve el foco al botón, aunque autoFocus ya haya enfocado el buscador antes del efecto', () => {
        const { rerender } = render(<Sheet isOpen />);
        const input = screen.getByLabelText('Alimento');
        expect(document.activeElement).toBe(input);
        input.blur();
        const focus = vi.spyOn(input, 'focus');
        rerender(<Sheet isOpen={false} />);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Añadir alimento' }));
        expect(focus).not.toHaveBeenCalled();
    });

    it('el temporizador inicial respeta el buscador enfocado y no lo desenfoca', () => {
        vi.useFakeTimers();
        render(<Sheet isOpen />);
        const input = screen.getByLabelText('Alimento');
        act(() => vi.advanceTimersByTime(20));
        expect(document.activeElement).toBe(input);
    });

    it('sin un disparador explícito nunca devuelve el foco a un campo del modal que está saliendo', () => {
        const { rerender } = render(<Sheet isOpen explicitTrigger={false} />);
        const input = screen.getByLabelText('Alimento');
        input.blur();
        const focus = vi.spyOn(input, 'focus');
        rerender(<Sheet isOpen={false} explicitTrigger={false} />);
        expect(focus).not.toHaveBeenCalled();
    });
});
