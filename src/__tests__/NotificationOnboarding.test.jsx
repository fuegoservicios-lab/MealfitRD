import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationOnboarding from '../components/dashboard/NotificationOnboarding';

const notificationDecisionKey = (userId) => `mealfit_notification_welcome_v2:${userId}`;

const mocks = vi.hoisted(() => ({ context: {}, status: vi.fn(), activate: vi.fn() }));
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => mocks.context }));
vi.mock('../utils/avisosDeComida', () => ({ estadoDeAvisos: mocks.status, activarAvisos: mocks.activate }));
vi.mock('../i18n', () => ({ useT: () => (text) => text }));

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(1000); });
beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    mocks.context = { session: { user: { id: 'a' } }, userProfile: { plan_mode: 'tracking' }, loadingData: false, isGuest: false };
    mocks.status.mockResolvedValue({ canal: 'local', activo: false, bloqueado: false });
    mocks.activate.mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('bienvenida de notificaciones después del formulario', () => {
    it('aparece en modo contador sin plan y no solicita permiso hasta pulsar Activar', async () => {
        render(<NotificationOnboarding />);
        await settle();
        expect(screen.getByRole('dialog')).toHaveAccessibleName('Activa tus recordatorios');
        expect(mocks.activate).not.toHaveBeenCalled();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Activar notificaciones' })); });
        expect(mocks.activate).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Notificaciones activadas')).toBeInTheDocument();
    });
    it('también aparece en modo plan y en web-push', async () => {
        mocks.context.userProfile.plan_mode = 'plan';
        mocks.status.mockResolvedValue({ canal: 'web-push', activo: false, bloqueado: false });
        render(<NotificationOnboarding />);
        await settle();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    it.each([
        { canal: 'local', activo: true },
        { canal: 'local', bloqueado: true },
        { canal: 'web-push', bloqueado: true },
        { canal: 'ios-instalar' },
        { canal: 'sin-soporte' },
        { canal: 'nativa-actualizar' },
    ])('no ofrece activar cuando el estado es %j', async (status) => {
        mocks.status.mockResolvedValue(status);
        render(<NotificationOnboarding />);
        await settle();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(mocks.activate).not.toHaveBeenCalled();
    });
    it('espera a la sesión y al perfil guardado; no aparece a invitados', async () => {
        mocks.context.loadingData = true;
        const view = render(<NotificationOnboarding />);
        await settle();
        expect(mocks.status).not.toHaveBeenCalled();
        mocks.context = { ...mocks.context, loadingData: false, isGuest: true };
        view.rerender(<NotificationOnboarding />);
        await settle();
        expect(mocks.status).not.toHaveBeenCalled();
        mocks.context = { ...mocks.context, isGuest: false };
        view.rerender(<NotificationOnboarding />);
        await settle();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    it('Ahora no persiste la decisión para esa cuenta, sin afectar a otra', async () => {
        const view = render(<NotificationOnboarding />);
        await settle();
        fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
        expect(localStorage.getItem(notificationDecisionKey('a'))).toBe('later');
        view.unmount();
        const next = render(<NotificationOnboarding />);
        await settle();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        mocks.context = { ...mocks.context, session: { user: { id: 'b' } } };
        next.rerender(<NotificationOnboarding />);
        await settle();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    it('no confunde el antiguo flag global visto con una decisión de esta cuenta', async () => {
        localStorage.setItem('mealfit_push_onboarding_seen', 'true');
        render(<NotificationOnboarding />);
        await settle();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(localStorage.getItem(notificationDecisionKey('a'))).toBeNull();
    });
    it('no marca decidido al mostrarse: vuelve si se cerró la app sin elegir', async () => {
        const view = render(<NotificationOnboarding />);
        await settle();
        view.unmount();
        render(<NotificationOnboarding />);
        await settle();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    it('espera a que cierre otro diálogo', async () => {
        const other = document.createElement('div');
        other.setAttribute('role', 'dialog');
        other.setAttribute('aria-modal', 'true');
        document.body.append(other);
        render(<NotificationOnboarding />);
        await settle();
        expect(screen.queryByText('Activa tus recordatorios')).not.toBeInTheDocument();
        other.remove();
        await settle();
        expect(screen.getByText('Activa tus recordatorios')).toBeInTheDocument();
    });
    it('un error de activación permite reintentar sin inventar éxito', async () => {
        mocks.activate.mockResolvedValue({ ok: false, code: 'server_error' });
        render(<NotificationOnboarding />);
        await settle();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Activar notificaciones' })); });
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.queryByText('Notificaciones activadas')).not.toBeInTheDocument();
        expect(localStorage.getItem(notificationDecisionKey('a'))).toBeNull();
    });
    it('respeta el rechazo del permiso y no vuelve a solicitarlo', async () => {
        mocks.activate.mockResolvedValue({ ok: false, code: 'permiso_denegado' });
        render(<NotificationOnboarding />);
        await settle();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Activar notificaciones' })); });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(localStorage.getItem(notificationDecisionKey('a'))).toBe('later');
    });
    it('Escape descarta y restaura el desplazamiento del fondo', async () => {
        const trigger = document.createElement('button');
        document.body.append(trigger);
        trigger.focus();
        render(<NotificationOnboarding />);
        await settle();
        expect(document.body.style.overflow).toBe('hidden');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(document.body.style.overflow).not.toBe('hidden');
        expect(document.activeElement).toBe(trigger);
        trigger.remove();
    });
    it('un doble toque y Escape durante la activación no duplican ni interrumpen la solicitud', async () => {
        let resolve;
        mocks.activate.mockReturnValue(new Promise((r) => { resolve = r; }));
        render(<NotificationOnboarding />);
        await settle();
        const button = screen.getByRole('button', { name: 'Activar notificaciones' });
        fireEvent.click(button);
        fireEvent.click(button);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(mocks.activate).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await act(async () => { resolve({ ok: true }); });
        expect(screen.getByText('Notificaciones activadas')).toBeInTheDocument();
    });
    it('ignora el resultado tardío de la cuenta anterior', async () => {
        let resolve;
        mocks.status.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
        const view = render(<NotificationOnboarding />);
        mocks.context = { ...mocks.context, session: null };
        view.rerender(<NotificationOnboarding />);
        await act(async () => { resolve({ canal: 'local', activo: false }); });
        await settle();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
