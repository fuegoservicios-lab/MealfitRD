/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] «Evaluar de nuevo» desde Configuración.
 *
 *   · El foco no entraba nunca en el modal (portal a <body>, fuera de la trampa de foco de Configuración): con teclado
 *     no se llegaba a ningún botón.
 *   · «Empezar desde cero» decía «elimina tu plan actual» y borra mucho más, de un solo clic, con el botón en blanco
 *     sobre #EF4444 (3,76:1). Ahora dice qué borra y qué conserva, pide un segundo paso y el botón va en --danger-fill.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import EvaluarDeNuevoModal from '../components/common/EvaluarDeNuevoModal';

afterEach(() => { vi.restoreAllMocks(); });

const montar = (props = {}) => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const r = render(<EvaluarDeNuevoModal open onConfirm={onConfirm} onClose={onClose} {...props} />);
    return { ...r, onConfirm, onClose };
};

describe('[718] EvaluarDeNuevoModal · foco y teclado', () => {
    it('al abrir, el foco ENTRA en el modal', async () => {
        montar();
        const dialogo = screen.getByRole('dialog');
        expect(dialogo).toHaveAttribute('aria-modal', 'true');
        expect(dialogo.getAttribute('aria-labelledby')).toBeTruthy();
        await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));
    });

    it('Tab no se escapa: desde el último control vuelve al primero', async () => {
        montar();
        const dialogo = screen.getByRole('dialog');
        await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));
        const confirmar = screen.getByRole('button', { name: 'Generar plan' });
        confirmar.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar' }));
    });

    it('ESC cierra; mientras trabaja (busy), no', () => {
        const { onClose, rerender, onConfirm } = montar();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
        rerender(<EvaluarDeNuevoModal open busy onConfirm={onConfirm} onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('[718] EvaluarDeNuevoModal · «Empezar desde cero»', () => {
    it('dice exactamente qué borra y qué conserva', () => {
        montar();
        expect(screen.getByText(/borra tus planes \(el actual y el historial\), tu Nevera \(con los suplementos\), lo que la IA aprendió de ti/)).toBeInTheDocument();
        expect(screen.getByText(/alergias, perfil clínico, preferencias, recordatorios e historial de peso/)).toBeInTheDocument();
        expect(screen.getByText('Se conservan tu cuenta, tu suscripción, tu historial de chats y lo que registraste en el diario (comidas, peso y agua).')).toBeInTheDocument();
        expect(screen.queryByText('Te lleva al formulario inicial y elimina tu plan actual.')).toBeNull();
    });

    it('renovar confirma a la primera (no es destructivo)', () => {
        const { onConfirm } = montar();
        fireEvent.click(screen.getByRole('button', { name: 'Generar plan' }));
        expect(onConfirm).toHaveBeenCalledWith('renovar');
    });

    it('lo irreversible pide un SEGUNDO paso, y un doble clic no vale por los dos', async () => {
        let ahora = 1_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => ahora);
        const { onConfirm } = montar();
        fireEvent.click(screen.getByRole('radio', { name: /Empezar desde cero/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Empezar desde cero' }));
        expect(onConfirm, 'borró con un solo clic').not.toHaveBeenCalled();

        // Segundo paso: aviso de que no se puede deshacer, cómo exportar antes, y el foco en el título (no en el botón rojo).
        const titulo = screen.getByRole('heading', { name: /¿Seguro que quieres empezar desde cero\?/ });
        await waitFor(() => expect(document.activeElement).toBe(titulo));
        expect(screen.getByText(/Configuración → Privacidad → Exportar datos/)).toBeInTheDocument();

        const siBorrar = screen.getByRole('button', { name: 'Sí, borrar y empezar de cero' });
        // El segundo clic de un doble clic llega a los pocos ms: no cuenta.
        ahora += 80;
        fireEvent.click(siBorrar);
        expect(onConfirm, 'un doble clic confirmó los dos pasos').not.toHaveBeenCalled();

        ahora += 1000;
        fireEvent.click(siBorrar);
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledWith('cero');
    });

    it('«Volver» regresa a las opciones sin borrar nada', async () => {
        const { onConfirm } = montar();
        fireEvent.click(screen.getByRole('radio', { name: /Empezar desde cero/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Empezar desde cero' }));
        fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
        expect(onConfirm).not.toHaveBeenCalled();
        const boton = screen.getByRole('button', { name: 'Empezar desde cero' });
        await waitFor(() => expect(document.activeElement).toBe(boton));
    });

    it('al cerrarse y reabrirse vuelve al primer paso', () => {
        const { onConfirm, onClose, rerender } = montar();
        fireEvent.click(screen.getByRole('radio', { name: /Empezar desde cero/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Empezar desde cero' }));
        expect(screen.getByRole('button', { name: 'Sí, borrar y empezar de cero' })).toBeInTheDocument();
        rerender(<EvaluarDeNuevoModal open={false} onConfirm={onConfirm} onClose={onClose} />);
        rerender(<EvaluarDeNuevoModal open onConfirm={onConfirm} onClose={onClose} />);
        expect(screen.queryByRole('button', { name: 'Sí, borrar y empezar de cero' })).toBeNull();
    });

    it('el botón destructivo es blanco sobre --danger-fill (no sobre --danger, que da 3,76:1)', () => {
        montar();
        fireEvent.click(screen.getByRole('radio', { name: /Empezar desde cero/ }));
        const boton = screen.getByRole('button', { name: 'Empezar desde cero' });
        expect(boton.style.background).toBe('var(--danger-fill)');
        expect(boton.style.color).toMatch(/^(#fff|rgb\(255, 255, 255\))$/);
        act(() => { fireEvent.click(boton); });
        const final = screen.getByRole('button', { name: 'Sí, borrar y empezar de cero' });
        expect(final.style.background).toBe('var(--danger-fill)');
    });
});
