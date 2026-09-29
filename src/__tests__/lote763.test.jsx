/**
 * [P1-PLAN-LOTE-763 · 2026-09-28] La pregunta obligatoria de la foto, en el sitio del teclado.
 *
 * El dueño: «la pregunta que te hace la IA cuando escaneas una comida […] quiero que se vea donde está el teclado, y el
 * teclado se debe cerrar cuando está la pregunta obligatoria». En el teléfono la tarjeta salía encima de la caja de
 * escribir, apretada entre la caja y el teclado. Ahora ocupa el sitio de la caja (`enPanel`), con botones del tamaño de
 * una tecla, y «Otra…» abre un campo en la propia pregunta: lo escrito cuenta como la respuesta de esa duda.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RespuestasDeLaFoto from '../components/agent/RespuestasDeLaFoto';
import DudasDeLaFoto from '../components/common/DudasDeLaFoto';
import { respuestasConEscritas, respuestasElegidas } from '../utils/fotoAntesDelCoach';

const DUDAS = [
    { pregunta: '¿Cuántos huevos?', opciones: [
        { texto: '1 huevo', ajuste: { calories: -72, protein: -6 } }, { texto: '2 huevos', supuesta: true, ajuste: {} },
    ] },
    { pregunta: '¿Verde o maduro?', opciones: [
        { texto: 'Verde', supuesta: true, ajuste: {} }, { texto: 'Maduro', ajuste: { calories: 18, carbs: 5 } },
    ] },
];

const panel = (props = {}) => {
    const enviar = vi.fn();
    const otraDelPadre = vi.fn();
    const r = render(<RespuestasDeLaFoto dudas={DUDAS} onEnviar={enviar} onOtra={otraDelPadre} enPanel
        titulo="Antes de anotarlo, dime:" onOmitir={vi.fn()} {...props} />);
    return { ...r, enviar, otraDelPadre };
};
// «Otra…» de la duda i (cada duda tiene el suyo)
const otraDe = (i) => screen.getAllByRole('button', { name: 'Otra…' })[i];
const campoDe = (pregunta) => screen.getByLabelText(`Tu respuesta: ${pregunta}`);

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('[763] respuestas con lo escrito', () => {
    it('sin nada escrito es lo de siempre (texto + ajuste de lo tocado)', () => {
        expect(respuestasConEscritas(DUDAS, { 0: 0, 1: 1 }, {})).toEqual(respuestasElegidas(DUDAS, { 0: 0, 1: 1 }));
    });
    it('con algo escrito: cada duda en su orden y SIN ajuste (el servidor pide recalcular)', () => {
        expect(respuestasConEscritas(DUDAS, { 1: 1 }, { 0: '  3 huevos con queso ' }))
            .toEqual({ texto: '3 huevos con queso · Maduro', ajuste: null });
        expect(respuestasConEscritas(DUDAS, {}, { 0: '3 huevos', 1: 'amarillo' }))
            .toEqual({ texto: '3 huevos · amarillo', ajuste: null });
    });
});

describe('[763] el panel: «Otra…» escribe aquí, no en la caja', () => {
    it('abre un campo en su duda; el padre no mueve el cursor a la caja (oculta)', () => {
        const { otraDelPadre, container } = panel();
        expect(container.querySelector('.chat-dudas-panel')).not.toBeNull();
        fireEvent.click(otraDe(0));
        expect(otraDelPadre).not.toHaveBeenCalled();
        // en el panel (más estrecho) el texto guía largo del escáner se cortaba
        expect(campoDe('¿Cuántos huevos?')).toHaveAttribute('placeholder', 'Escribe tu respuesta');
    });

    it('escrito + Intro, luego un toque en la otra duda = UN envío, sin ajuste', () => {
        const { enviar } = panel();
        fireEvent.click(otraDe(0));
        const campo = campoDe('¿Cuántos huevos?');
        fireEvent.change(campo, { target: { value: '3 huevos con queso' } });
        fireEvent.keyDown(campo, { key: 'Enter' });
        expect(enviar).not.toHaveBeenCalled();
        // lo escrito se ve como una opción más, marcada
        expect(screen.getByRole('button', { name: '3 huevos con queso' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Maduro' }));
        expect(enviar).toHaveBeenCalledTimes(1);
        expect(enviar).toHaveBeenCalledWith('3 huevos con queso · Maduro', null);
    });

    it('escrito SIN Intro y un toque en la otra duda: lo escrito no se pierde (en iOS el toque no quita el foco)', () => {
        const { enviar } = panel();
        fireEvent.click(otraDe(0));
        fireEvent.change(campoDe('¿Cuántos huevos?'), { target: { value: '4 huevos' } });
        fireEvent.click(screen.getByRole('button', { name: 'Verde' }));
        expect(enviar).toHaveBeenCalledTimes(1);
        expect(enviar).toHaveBeenCalledWith('4 huevos · Verde', null);
    });

    it('un toque en la MISMA duda gana a lo escrito, y todo tocado viaja con su ajuste', () => {
        const { enviar } = panel();
        fireEvent.click(otraDe(0));
        fireEvent.change(campoDe('¿Cuántos huevos?'), { target: { value: 'no sé' } });
        fireEvent.click(screen.getByRole('button', { name: '1 huevo' }));
        expect(screen.queryByLabelText('Tu respuesta: ¿Cuántos huevos?')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Maduro' }));
        expect(enviar).toHaveBeenCalledTimes(1);
        expect(enviar).toHaveBeenCalledWith('1 huevo · Maduro', { calories: -54, protein: -6, carbs: 5, healthy_fats: 0 });
    });

    it('cambiar lo escrito por una opción de su duda la reemplaza (no se juntan)', () => {
        const { enviar } = panel();
        fireEvent.click(otraDe(0));
        const campo = campoDe('¿Cuántos huevos?');
        fireEvent.change(campo, { target: { value: '3 huevos' } });
        fireEvent.keyDown(campo, { key: 'Enter' });
        fireEvent.click(screen.getByRole('button', { name: '2 huevos' }));
        expect(screen.queryByRole('button', { name: '3 huevos' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Verde' }));
        expect(enviar).toHaveBeenCalledWith('2 huevos · Verde', { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 });
    });

    it('manda UNA vez aunque lleguen más toques antes de desaparecer', () => {
        const { enviar } = panel();
        fireEvent.click(screen.getByRole('button', { name: '2 huevos' }));
        fireEvent.click(screen.getByRole('button', { name: 'Verde' }));
        fireEvent.click(screen.getByRole('button', { name: 'Maduro' }));
        expect(enviar).toHaveBeenCalledTimes(1);
    });
});

describe('[763] fuera del panel nada cambia', () => {
    it('la tarjeta de siempre: «Otra…» lleva el cursor a la caja (lote 347) y no abre campo', () => {
        const enviar = vi.fn();
        const otraDelPadre = vi.fn();
        const { container } = render(<RespuestasDeLaFoto dudas={DUDAS} onEnviar={enviar} onOtra={otraDelPadre} />);
        expect(container.querySelector('.chat-dudas-panel')).toBeNull();
        fireEvent.click(otraDe(1));
        expect(otraDelPadre).toHaveBeenCalledWith('¿Verde o maduro?');
        expect(screen.queryByLabelText('Tu respuesta: ¿Verde o maduro?')).toBeNull();
    });

    it('el escáner sigue centrando su campo; el panel del chat no (desplazaría la página bajo el teclado)', () => {
        vi.useFakeTimers();
        const centrar = vi.fn();
        const antes = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = centrar;
        try {
            const { unmount } = render(<DudasDeLaFoto dudas={DUDAS} respuestas={{}} confirmadas={{}} onElegir={() => {}}
                otraConCampo onOtra={() => {}} />);
            fireEvent.click(otraDe(0));
            act(() => { vi.advanceTimersByTime(400); });
            expect(centrar).toHaveBeenCalledTimes(1);
            unmount();
            centrar.mockClear();
            render(<DudasDeLaFoto dudas={DUDAS} respuestas={{}} confirmadas={{}} onElegir={() => {}}
                otraConCampo onOtra={() => {}} centrarCampo={false} grande />);
            fireEvent.click(otraDe(0));
            act(() => { vi.advanceTimersByTime(400); });
            expect(centrar).not.toHaveBeenCalled();
        } finally {
            Element.prototype.scrollIntoView = antes;
        }
    });
});
