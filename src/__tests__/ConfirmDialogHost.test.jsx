// [P2-CONFIRM-DIALOG-PLACEMENT · 2026-09-04] Las confirmaciones de `confirmToast` dejan de ser
// un toast arriba («parece una notificación y se ve poquito») y pasan a un diálogo real:
// centrado en PC, hoja inferior en móvil. Misma API, misma Promise<boolean>.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../i18n', () => ({ t: (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k])) : s), useT: () => (s) => s }));

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

describe('ConfirmDialogHost', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('sin host montado, confirmToast cae al toast de respaldo (contrato viejo intacto)', async () => {
        const { confirmToast, hasConfirmHost } = await import('../utils/confirmToast');
        expect(hasConfirmHost()).toBe(false);
        const toastFn = vi.fn(() => 1);
        toastFn.dismiss = vi.fn();
        const p = confirmToast('¿Seguro?', { toastFn, confirmLabel: 'Sí', cancelLabel: 'No' });
        const opts = toastFn.mock.calls[0][1];
        expect(opts.className).toBe('bb-confirm-toast');
        opts.action.onClick();
        await expect(p).resolves.toBe(true);
    });

    it('con host montado dibuja un diálogo con pregunta, explicación y dos botones; confirmar resuelve true', async () => {
        const { confirmToast } = await import('../utils/confirmToast');
        const { default: Host } = await import('../components/common/ConfirmDialogHost');
        render(<Host />);
        let p;
        act(() => {
            p = confirmToast('¿Eliminar "Moro con pollo" del diario?', {
                description: 'Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true,
            });
        });
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog.textContent).toContain('¿Eliminar "Moro con pollo" del diario?');
        expect(dialog.textContent).toContain('Esta acción no se puede deshacer.');
        const confirmBtn = screen.getByText('Eliminar');
        expect(confirmBtn.className).toContain('ui-btn-danger');
        fireEvent.click(confirmBtn);
        await expect(p).resolves.toBe(true);
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    });

    it('cancelar, Escape o una segunda confirmación resuelven false; sin danger el botón no es rojo', async () => {
        const { confirmToast } = await import('../utils/confirmToast');
        const { default: Host } = await import('../components/common/ConfirmDialogHost');
        render(<Host />);
        let p1;
        act(() => { p1 = confirmToast('¿Pausar la generación de planes?', { confirmLabel: 'Pausar planes', cancelLabel: 'Volver' }); });
        await screen.findByRole('alertdialog');
        expect(screen.getByText('Pausar planes').className).not.toContain('ui-btn-danger');
        fireEvent.click(screen.getByText('Volver'));
        await expect(p1).resolves.toBe(false);

        let p2;
        act(() => { p2 = confirmToast('¿Olvidar?', {}); });
        await screen.findByRole('alertdialog');
        fireEvent.keyDown(document, { key: 'Escape' });
        await expect(p2).resolves.toBe(false);

        let p3; let p4;
        act(() => { p3 = confirmToast('Primera', {}); });
        await screen.findByRole('alertdialog');
        act(() => { p4 = confirmToast('Segunda', {}); });
        await expect(p3).resolves.toBe(false); // la anterior no se apila: se cancela
        fireEvent.click(screen.getByText('Confirmar'));
        await expect(p4).resolves.toBe(true);
    });

    it('el host está montado una vez en App.jsx y los borrados marcan danger', () => {
        const app = src('src/App.jsx');
        expect(app).toContain("import ConfirmDialogHost from './components/common/ConfirmDialogHost';");
        expect(app).toContain('<ConfirmDialogHost />');
        const tp = src('src/components/dashboard/TrackingProgress.jsx');
        expect(tp).toMatch(/confirmToast\([\s\S]{0,300}danger: true/);
        const settings = src('src/pages/Settings.jsx');
        expect(settings).toMatch(/olvidar esta información[\s\S]{0,200}danger: true/);
    });
});
