// [P1-PLAN-LOTE-129 · 2026-09-19] Quitar la foto adjunta (la X) no se lleva el teclado.
//
// El dueño: «cuando cierro la foto en la x se me cierra el teclado y no debería cerrarse». En iOS el foco sale de la caja
// cuando WebKit sintetiza mousedown/click tras el touchend: el toque se atiende EN touchend y se cancela.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { useToqueSinFoco, CLIC_FANTASMA_MS } from '../hooks/useToqueSinFoco';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function Boton({ accion }) {
    const sinFoco = useToqueSinFoco();
    return <button type="button" data-testid="x" {...sinFoco(accion)}>x</button>;
}

describe('lote 129 · un toque que no le quita el foco a la caja', () => {
    it('el toque se atiende en touchend y se CANCELA (WebKit no sintetiza mousedown/click: el foco no se mueve)', () => {
        const accion = vi.fn();
        const { getByTestId } = render(<Boton accion={accion} />);
        const b = getByTestId('x');
        document.elementFromPoint = () => b;
        const noCancelado = fireEvent.touchEnd(b, { changedTouches: [{ clientX: 5, clientY: 5 }] });
        expect(noCancelado).toBe(false);          // preventDefault() llamado
        expect(accion).toHaveBeenCalledTimes(1);
    });

    it('si el clic del MISMO gesto llega igualmente, la acción no corre dos veces; pasado el margen, un clic sí cuenta', () => {
        vi.useFakeTimers();
        const accion = vi.fn();
        const { getByTestId } = render(<Boton accion={accion} />);
        const b = getByTestId('x');
        document.elementFromPoint = () => b;
        fireEvent.touchEnd(b, { changedTouches: [{ clientX: 5, clientY: 5 }] });
        fireEvent.click(b);
        expect(accion).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(CLIC_FANTASMA_MS + 10);
        fireEvent.click(b);                        // ratón o teclado: el clic normal sigue funcionando
        expect(accion).toHaveBeenCalledTimes(2);
    });

    it('si el dedo acabó FUERA del botón no es un toque; y el mousedown cancelado cubre el ratón', () => {
        const accion = vi.fn();
        const { getByTestId } = render(<Boton accion={accion} />);
        const b = getByTestId('x');
        document.elementFromPoint = () => document.body;
        expect(fireEvent.touchEnd(b, { changedTouches: [{ clientX: 500, clientY: 500 }] })).toBe(true);
        expect(accion).not.toHaveBeenCalled();
        expect(fireEvent.mouseDown(b)).toBe(false);
    });

    it('la X de la foto adjunta del chat lo usa', () => {
        const ap = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf-8');
        expect(ap).toContain('{...sinFoco(() => removeSelectedAttachment(item.id))}');
        expect(ap).toContain('const sinFoco = useToqueSinFoco();');
        expect(ap).not.toContain('onClick={() => removeSelectedAttachment(item.id)}');
    });
});
