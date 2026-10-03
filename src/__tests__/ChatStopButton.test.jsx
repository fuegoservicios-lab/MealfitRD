import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatStopButton } from '../components/agent/ChatStopButton';

afterEach(cleanup);

function Composer({ onSend, onStop, protectedStop = true }) {
    const [active, setActive] = useState(false);
    return active
        ? (protectedStop
            ? <ChatStopButton onStop={onStop}>Detener</ChatStopButton>
            : <button onClick={onStop}>Detener</button>)
        : <div><button onPointerDown={() => { onSend(); setActive(true); }}>Enviar</button></div>;
}

describe('el gesto de enviar no cancela el turno que acaba de abrir', () => {
    it('reproduce el fallo anterior: el click tardío cancela con el botón sin protección', () => {
        const stop = vi.fn();
        render(<Composer onSend={vi.fn()} onStop={stop} protectedStop={false} />);
        fireEvent.pointerDown(screen.getByText('Enviar'), { pointerType: 'touch', button: 0 });
        fireEvent.click(screen.getByText('Detener'), { detail: 1 });
        expect(stop).toHaveBeenCalledOnce();
    });

    it.each(['touch', 'mouse', 'pen'])('ignora el click de Enviar que llega sobre Detener (%s)', (pointerType) => {
        const send = vi.fn(), stop = vi.fn();
        render(<Composer onSend={send} onStop={stop} />);
        fireEvent.pointerDown(screen.getByText('Enviar'), { pointerType, button: 0 });
        fireEvent.click(screen.getByText('Detener'), { detail: 1 });
        expect(send).toHaveBeenCalledOnce();
        expect(stop).not.toHaveBeenCalled();
    });

    it.each(['touch', 'mouse'])('un toque nuevo sobre Detener sí cancela (%s)', (pointerType) => {
        const stop = vi.fn();
        render(<ChatStopButton onStop={stop}>Detener</ChatStopButton>);
        const button = screen.getByText('Detener');
        fireEvent.pointerDown(button, { pointerType, button: 0 });
        fireEvent.pointerUp(button, { pointerType, button: 0 });
        fireEvent.click(button, { detail: 1 });
        expect(stop).toHaveBeenCalledOnce();
        fireEvent.click(button, { detail: 1 });
        expect(stop).toHaveBeenCalledOnce();
    });

    it('un gesto cancelado no permite que un click posterior detenga', () => {
        const stop = vi.fn();
        render(<ChatStopButton onStop={stop}>Detener</ChatStopButton>);
        const button = screen.getByText('Detener');
        fireEvent.pointerDown(button, { pointerType: 'touch', button: 0 });
        fireEvent.pointerCancel(button);
        fireEvent.click(button, { detail: 1 });
        expect(stop).not.toHaveBeenCalled();
    });

    it('conserva la activación por teclado y lector de pantalla', () => {
        const stop = vi.fn();
        render(<ChatStopButton onStop={stop}>Detener</ChatStopButton>);
        fireEvent.click(screen.getByText('Detener'), { detail: 0 });
        expect(stop).toHaveBeenCalledOnce();
    });
});
