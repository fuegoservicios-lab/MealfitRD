/**
 * [P3-I18N-RADIOGROUP-TECLADO · 2026-08-21] Los cuatro `role="radiogroup"` del repo
 * declaraban el rol y no implementaban nada de lo que ese rol promete.
 *
 * Un lector de pantalla **anuncia** las flechas al entrar en un grupo de radio. Que no
 * hagan nada es peor que no declarar el rol: el usuario se queda esperando una tecla que
 * le acaban de prometer. Y sin roving tabindex el grupo expone N paradas de tabulador en
 * vez de 1 — el selector de idioma son cinco, así que llegar al siguiente ajuste costaba
 * cinco pulsaciones de más.
 *
 * Se prueba el HOOK y no cada pantalla porque lo que se comparte entre los cuatro sitios
 * es la conducta, no el marcado: uno pinta iconos con fondo de color, otro insignias de
 * idioma, otro tarjetas con descripción. Un componente habría obligado a render-props y
 * a reescribir los cuatro.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { useRadioGroupAccesible } from '../components/common/useRadioGroupAccesible';

const VALORES = ['sistema', 'claro', 'oscuro'];

function Grupo({ activo, onSelect }) {
    const { propsGrupo, propsRadio } = useRadioGroupAccesible(VALORES, activo, onSelect);
    return (
        <div {...propsGrupo} aria-label="Tema">
            {VALORES.map((v) => (
                <button key={v} type="button" data-testid={v} {...propsRadio(v)}>
                    {v}
                </button>
            ))}
        </div>
    );
}

describe('[P3-I18N-RADIOGROUP-TECLADO] el hook de grupo de radio', () => {
    it('expone UNA sola parada de tabulador, la del valor activo', () => {
        render(<Grupo activo="claro" onSelect={() => {}} />);
        expect(screen.getByTestId('sistema').tabIndex).toBe(-1);
        expect(screen.getByTestId('claro').tabIndex).toBe(0);
        expect(screen.getByTestId('oscuro').tabIndex).toBe(-1);
    });

    it('sin valor activo, la parada es el primero', () => {
        // Sin esto el grupo entero queda INALCANZABLE con Tab, que es peor que las N
        // paradas de partida.
        render(<Grupo activo={null} onSelect={() => {}} />);
        expect(screen.getByTestId('sistema').tabIndex).toBe(0);
        expect(screen.getByTestId('claro').tabIndex).toBe(-1);
    });

    it('marca `aria-checked` solo en el activo', () => {
        render(<Grupo activo="oscuro" onSelect={() => {}} />);
        expect(screen.getByTestId('oscuro').getAttribute('aria-checked')).toBe('true');
        expect(screen.getByTestId('claro').getAttribute('aria-checked')).toBe('false');
    });

    it.each([
        ['ArrowRight', 'claro', 'oscuro'],
        ['ArrowDown', 'claro', 'oscuro'],
        ['ArrowLeft', 'claro', 'sistema'],
        ['ArrowUp', 'claro', 'sistema'],
    ])('%s mueve la selección de %s a %s', (key, desde, esperado) => {
        const onSelect = vi.fn();
        render(<Grupo activo={desde} onSelect={onSelect} />);
        screen.getByTestId(desde).focus();
        fireEvent.keyDown(screen.getByTestId(desde), { key });
        expect(onSelect).toHaveBeenCalledWith(esperado);
    });

    it('envuelve por los dos extremos', () => {
        // En un grupo de radio no hay «final»: quien llega al último y pulsa abajo espera
        // volver al primero, no quedarse clavado sin saber si la tecla llegó.
        const onSelect = vi.fn();
        const { rerender } = render(<Grupo activo="oscuro" onSelect={onSelect} />);
        screen.getByTestId('oscuro').focus();
        fireEvent.keyDown(screen.getByTestId('oscuro'), { key: 'ArrowRight' });
        expect(onSelect).toHaveBeenLastCalledWith('sistema');

        onSelect.mockClear();
        rerender(<Grupo activo="sistema" onSelect={onSelect} />);
        screen.getByTestId('sistema').focus();
        fireEvent.keyDown(screen.getByTestId('sistema'), { key: 'ArrowLeft' });
        expect(onSelect).toHaveBeenLastCalledWith('oscuro');
    });

    it('Home y End van al primero y al último', () => {
        const onSelect = vi.fn();
        render(<Grupo activo="claro" onSelect={onSelect} />);
        const el = screen.getByTestId('claro');
        el.focus();
        fireEvent.keyDown(el, { key: 'End' });
        expect(onSelect).toHaveBeenLastCalledWith('oscuro');
        fireEvent.keyDown(el, { key: 'Home' });
        expect(onSelect).toHaveBeenLastCalledWith('sistema');
    });

    it('mueve también el FOCO, no solo la selección', () => {
        // Sin mover el foco, la siguiente flecha vuelve a partir del mismo sitio y el
        // usuario se queda oscilando entre dos opciones.
        const onSelect = vi.fn();
        render(<Grupo activo="claro" onSelect={onSelect} />);
        screen.getByTestId('claro').focus();
        fireEvent.keyDown(screen.getByTestId('claro'), { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByTestId('oscuro'));
    });

    it('MUTACIÓN DE CONTROL: una tecla cualquiera no selecciona nada', () => {
        // Un manejador que reaccionara a todo haría pasar lo de arriba y robaría teclas
        // que no son suyas — empezando por Tab, que es como se sale del grupo.
        const onSelect = vi.fn();
        render(<Grupo activo="claro" onSelect={onSelect} />);
        const el = screen.getByTestId('claro');
        el.focus();
        for (const key of ['Tab', 'a', 'Enter', 'Escape']) {
            fireEvent.keyDown(el, { key });
        }
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('con la lista vacía no revienta', () => {
        const Vacio = () => {
            const { propsGrupo } = useRadioGroupAccesible([], null, () => {});
            return <div {...propsGrupo} data-testid="vacio" />;
        };
        render(<Vacio />);
        fireEvent.keyDown(screen.getByTestId('vacio'), { key: 'ArrowRight' });
        expect(screen.getByTestId('vacio')).toBeTruthy();
    });
});
