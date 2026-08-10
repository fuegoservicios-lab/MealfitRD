import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import useModalAccessibility from '../hooks/useModalAccessibility';

/**
 * [P1-SETTINGS-DIALOG · 2026-08-10] `isTopmost` — el caso que el hook no
 * contemplaba: UN MODAL DENTRO DE OTRO.
 *
 * Por qué importa aquí y no antes: la configuración pasó a ser una ventana, y
 * Settings abre confirmaciones POR DENTRO (descartar cambios de peso/altura,
 * cancelar suscripción). Los listeners del hook viven en `document`, así que
 * sin esta puerta una sola pulsación de ESC cerraba las DOS capas: la
 * confirmación por su propio handler y la ventana por el suyo. El usuario
 * perdía el aviso Y los datos que el aviso existía para proteger.
 */
describe('useModalAccessibility · capas anidadas', () => {
    const Exterior = ({ onClose, conInterior }) => {
        const { containerRef } = useModalAccessibility({
            isOpen: true,
            onClose,
            // La misma pregunta que hace SettingsDialog: ¿hay otro diálogo
            // DENTRO de mí? Se evalúa en el instante de la tecla.
            isTopmost: () => !containerRef.current?.querySelector('[role="dialog"][aria-modal="true"]'),
        });
        return (
            <div ref={containerRef} role="dialog" aria-modal="true" aria-label="exterior" tabIndex={-1}>
                <button type="button">algo</button>
                {conInterior && (
                    <div role="dialog" aria-modal="true" aria-label="interior">
                        <button type="button">confirmar</button>
                    </div>
                )}
            </div>
        );
    };

    it('ESC cierra la capa exterior cuando es la única', () => {
        const onClose = vi.fn();
        render(<Exterior onClose={onClose} conInterior={false} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ESC NO cierra la exterior mientras hay una capa encima', () => {
        const onClose = vi.fn();
        render(<Exterior onClose={onClose} conInterior={true} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(
            onClose,
            'Con una confirmación abierta, ESC le pertenece a ella. Si la ventana ' +
            'también se cierra, el usuario pierde el aviso y los datos de una tecla.'
        ).not.toHaveBeenCalled();
    });

    it('vuelve a responder cuando la capa de encima se va', () => {
        const onClose = vi.fn();
        const { rerender } = render(<Exterior onClose={onClose} conInterior={true} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();

        // La confirmación se cierra: la ventana vuelve a ser la capa de encima.
        // Se comprueba porque suspender es fácil; REANUDAR es lo que se rompe si
        // alguien sustituye la función por un booleano que nadie actualiza.
        rerender(<Exterior onClose={onClose} conInterior={false} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('sin `isTopmost` el hook se comporta como siempre (12 consumidores previos)', () => {
        const onClose = vi.fn();
        const Simple = () => {
            const { containerRef } = useModalAccessibility({ isOpen: true, onClose });
            return <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1}><button type="button">x</button></div>;
        };
        render(<Simple />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('el foco no escapa de la capa exterior con Tab', () => {
        const onClose = vi.fn();
        render(<Exterior onClose={onClose} conInterior={false} />);
        const boton = screen.getByText('algo');
        boton.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(boton);
    });
});
