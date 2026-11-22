/**
 * [P1-PLAN-LOTE-1166 · 2026-11-22] Eliminar cuentas en lote desde el panel: revisa primero, las activas necesitan su
 * casilla, las bloqueadas no cuentan y el botón pide «ELIMINAR <n>» con el número de las que se van.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pedirAdmin = vi.fn();
vi.mock('../utils/adminCuentas', async (orig) => ({ ...(await orig()), pedirAdmin: (...a) => pedirAdmin(...a) }));

import AdminDialogoEliminar from '../pages/AdminDialogoEliminar';

const REVISION = {
    cuentas: [
        { user_id: 'a', email: 'vacia@x.com', ultima_actividad: null, comidas_total: 0, mensajes_coach: 0, planes: 0, activa: false, bloqueo: null },
        { user_id: 'b', email: 'activa@x.com', ultima_actividad: '2026-11-21T10:00:00Z', comidas_total: 120, mensajes_coach: 40, planes: 1, activa: true, bloqueo: null },
        { user_id: 'c', email: 'paga@x.com', ultima_actividad: null, comidas_total: 3, mensajes_coach: 0, planes: 0, activa: false, bloqueo: 'suscripcion_activa' },
    ],
};

describe('[1166] diálogo de eliminar en lote', () => {
    beforeEach(() => { pedirAdmin.mockReset(); });

    it('la activa no cuenta sin su casilla; la bloqueada nunca; confirma con el número correcto', async () => {
        pedirAdmin.mockImplementation((url) => Promise.resolve(url.endsWith('/revisar') ? REVISION : { resultados: [{ user_id: 'a', resultado: 'eliminada' }] }));
        const onTerminar = vi.fn();
        render(<AdminDialogoEliminar ids={['a', 'b', 'c']} onTerminar={onTerminar} onCerrar={() => {}} />);
        expect(await screen.findByText('Tiene suscripción de pago: cancélala antes')).toBeInTheDocument();
        expect(screen.getByLabelText('Escribe ELIMINAR 1 para confirmar')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox'));
        const campo = screen.getByLabelText('Escribe ELIMINAR 2 para confirmar');
        const boton = screen.getByRole('button', { name: 'Eliminar 2 cuentas' });
        expect(boton).toBeDisabled();
        fireEvent.change(campo, { target: { value: 'eliminar 2' } });
        expect(boton).not.toBeDisabled();
        fireEvent.click(boton);
        await waitFor(() => expect(onTerminar).toHaveBeenCalled());
        const [, cuerpo] = pedirAdmin.mock.calls.find(([u]) => u === '/api/admin/cuentas/eliminar');
        expect(cuerpo).toEqual({ user_ids: ['a', 'b'], confirmacion: 'ELIMINAR 2', confirmar_activas: ['b'] });
    });
});
