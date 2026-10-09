import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Clock, Settings } from 'lucide-react';
import AgentAccountMenu from '../components/agent/AgentAccountMenu';

vi.mock('../config/platform', () => ({ nativeHidesCommerce: () => true }));
afterEach(cleanup);
const items = [
    { path: '/history', label: 'Historial', icon: Clock },
    { path: '/dashboard/settings', label: 'Configuración', icon: Settings, asDialog: true },
];
const setup = (extra = {}) => {
    const props = { items, triggerRef: createRef(), onClose: vi.fn(), onNavigate: vi.fn(), onHelp: vi.fn(), onLogout: vi.fn(), ...extra };
    render(<AgentAccountMenu {...props} />);
    return props;
};

describe('menú completo del Agente', () => {
    it('mantiene la navegación y los ajustes como diálogo', () => {
        const props = setup();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Configuración' }));
        expect(props.onClose).toHaveBeenCalledOnce();
        expect(props.onNavigate).toHaveBeenCalledWith(items[1]);
    });
    it('pide la confirmación de salida del layout; no cierra la sesión directamente', () => {
        const props = setup();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
        expect(props.onClose).toHaveBeenCalledOnce();
        expect(props.onLogout).toHaveBeenCalledOnce();
        expect(props.onNavigate).not.toHaveBeenCalled();
    });
    it('abre la ayuda compartida después de cerrar el menú', () => {
        const props = setup();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Obtener ayuda' }));
        expect(props.onHelp).toHaveBeenCalledOnce();
        expect(props.onClose.mock.invocationCallOrder[0]).toBeLessThan(props.onHelp.mock.invocationCallOrder[0]);
    });
    it('en nativo muestra los enlaces legales sin enlaces de comercio; permite volver', () => {
        setup();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Más información' }));
        expect(screen.getByRole('menuitem', { name: 'Política de privacidad' }).getAttribute('href')).toContain('/privacy');
        expect(screen.queryByRole('menuitem', { name: 'Novedades' })).toBeNull();
        expect(screen.queryByRole('menuitem', { name: 'Ver planes' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Más información' }));
        expect(screen.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeTruthy();
    });
    it('distingue la salida de invitado', () => {
        setup({ logoutLabel: 'Salir del modo invitado' });
        expect(screen.getByRole('menuitem', { name: 'Salir del modo invitado' })).toBeTruthy();
        expect(screen.queryByRole('menuitem', { name: 'Cerrar sesión' })).toBeNull();
    });
    it('Escape cierra y las flechas recorren las opciones', async () => {
        const props = setup();
        const first = screen.getByRole('menuitem', { name: 'Historial' });
        await waitFor(() => expect(document.activeElement).toBe(first));
        fireEvent.keyDown(first, { key: 'End' });
        expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
        fireEvent.keyDown(document.activeElement, { key: 'Escape' });
        expect(props.onClose).toHaveBeenCalledOnce();
    });
});
