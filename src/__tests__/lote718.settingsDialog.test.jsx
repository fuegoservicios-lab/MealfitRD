/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] ESC (y el «atrás» de Android, que sintetiza un ESC) sobre una confirmación
 * abierta DESDE Configuración cerraba la confirmación Y la ventana entera.
 *
 * La causa: `SettingsDialog.isTopmost` solo buscaba otro diálogo DENTRO de su propio panel, y las confirmaciones
 * que Settings abre no viven ahí: `EvaluarDeNuevoModal` portaliza a <body> y `confirmToast` lo pinta el
 * `ConfirmDialogHost` de App. Son hijas en el árbol de React, pero la pregunta se hace al DOM.
 *
 * Se prueba el componente REAL con un Settings de mentira que abre un diálogo portalizado, igual que los de verdad.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';

const navigate = vi.fn();
vi.mock('react-router-dom', async (original) => ({ ...(await original()), useNavigate: () => navigate }));

// Settings de mentira: un botón que abre una confirmación PORTALIZADA a <body>, con su propio ESC.
vi.mock('../pages/Settings', () => ({
    default: function SettingsFalso() {
        const [abierta, setAbierta] = useState(false);
        return (
            <div>
                <button type="button" onClick={() => setAbierta(true)}>abrir confirmación</button>
                <button type="button">otro ajuste</button>
                {abierta && createPortal(
                    <div role="dialog" aria-modal="true" aria-label="confirmación" tabIndex={-1}>
                        <button type="button" onClick={() => setAbierta(false)}>cerrar confirmación</button>
                        <EscCierra onEsc={() => setAbierta(false)} />
                    </div>,
                    document.body,
                )}
            </div>
        );
    },
}));

// El ESC propio de la confirmación, como el de EvaluarDeNuevoModal / Modal: escucha en `document`.
function EscCierra({ onEsc }) {
    useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onEsc(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onEsc]);
    return null;
}

import SettingsDialog from '../components/dashboard/SettingsDialog';

beforeEach(() => { navigate.mockReset(); });

const esc = () => act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });

describe('[718] SettingsDialog: la capa de arriba se decide en el DOCUMENTO', () => {
    it('sin nada encima, ESC cierra la ventana (control)', () => {
        render(<SettingsDialog />);
        esc();
        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('con una confirmación portalizada a <body> abierta, ESC cierra SOLO la confirmación', () => {
        render(<SettingsDialog />);
        fireEvent.click(screen.getByText('abrir confirmación'));
        const confirmacion = screen.getByRole('dialog', { name: 'confirmación' });
        // Lo que hacía fallar la versión anterior: la confirmación NO está dentro del panel.
        const panel = screen.getByRole('dialog', { name: 'Configuración' });
        expect(panel.contains(confirmacion)).toBe(false);

        esc();
        expect(
            navigate,
            'ESC cerró también la ventana de Configuración: la confirmación portalizada no contó como capa de encima',
        ).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: 'confirmación' })).toBeNull();

        // Y en cuanto se va, la ventana vuelve a ser la de arriba: suspender es fácil, REANUDAR es lo que se rompe.
        esc();
        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('un diálogo que ya estaba abierto DEBAJO al abrir la ventana no le quita el ESC', () => {
        // p. ej. el cajón del historial del chat en móvil: es `role="dialog" aria-modal` mientras está desplegado.
        const fondo = document.createElement('div');
        fondo.setAttribute('role', 'dialog');
        fondo.setAttribute('aria-modal', 'true');
        document.body.appendChild(fondo);
        try {
            render(<SettingsDialog />);
            esc();
            expect(navigate, 'la ventana se quedó sin ESC por un diálogo que estaba DEBAJO de ella').toHaveBeenCalledWith(-1);
        } finally {
            fondo.remove();
        }
    });

    it('un `alertdialog` portalizado (el de confirmToast) también cuenta como capa de encima', () => {
        render(<SettingsDialog />);
        const alerta = document.createElement('div');
        alerta.setAttribute('role', 'alertdialog');
        alerta.setAttribute('aria-modal', 'true');
        document.body.appendChild(alerta);
        esc();
        expect(navigate).not.toHaveBeenCalled();
        alerta.remove();
        esc();
        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('con una capa encima, el Tab tampoco lo gestiona la ventana (su trampa queda suspendida)', () => {
        render(<SettingsDialog />);
        fireEvent.click(screen.getByText('abrir confirmación'));
        // El foco se quedó en la ventana (su último control). Con su trampa activa, Tab lo devolvía a SU primer
        // control una y otra vez: con teclado no había forma de llegar a la confirmación de encima.
        const ultimo = screen.getByText('otro ajuste');
        ultimo.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(
            document.activeElement,
            'la trampa de foco de Configuración siguió activa con una confirmación encima',
        ).toBe(ultimo);
    });
});
