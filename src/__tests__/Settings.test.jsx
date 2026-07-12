import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import Settings from '../pages/Settings';
import * as router from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { useRegeneratePlan } from '../hooks/useRegeneratePlan';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: vi.fn(),
    };
});

vi.mock('../hooks/useRegeneratePlan', () => ({
    useRegeneratePlan: vi.fn()
}));

vi.mock('../authClient', () => ({
    authClient: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

describe('Settings Plan Regeneration', () => {
    let mockNavigate;
    let mockRegeneratePlan;

    beforeEach(() => {
        mockNavigate = vi.fn();
        mockRegeneratePlan = vi.fn();
        vi.mocked(router.useNavigate).mockReturnValue(mockNavigate);
        
        vi.mocked(useRegeneratePlan).mockReturnValue({
            regeneratePlan: mockRegeneratePlan
        });

        window.scrollTo = vi.fn();
    });

    it('should open modal and call regeneratePlan with correct payload when "Evaluar de Nuevo" is clicked (Renovar)', async () => {
        const user = userEvent.setup();
        
        render(<Settings />, {
            customContext: {
                planData: {
                    created_at: new Date().toISOString(),
                    duration: 'weekly',
                    days: [{ meals: [] }]
                },
                formData: {
                    groceryDuration: 'weekly'
                }
            }
        });

        // [APPEARANCE-THEME · 2026-05-28] Ajustes se dividió en secciones de
        // sidebar (refactor P3-PROFILE-*): "Evaluar de Nuevo" vive en la
        // sección "Plan & Objetivo", que NO es la sección por defecto
        // ('profile'). Navegamos a ella vía el botón del sidebar antes de
        // buscar el botón. (matchMedia mock → desktop → arranca en 'profile'.)
        const planNavItem = screen.getByText('Plan & Objetivo');
        await user.click(planNavItem.closest('button'));

        // [P3-PLANOBJETIVO-MOBILE · 2026-06-29] Settings monta DOS CTAs en el DOM a
        // la vez: el PlanObjetivo mobile ("Evaluar de nuevo") y el card desktop
        // ("Evaluar de Nuevo"), alternados solo por CSS media-query (jsdom no la aplica
        // → ambos existen). Targeteamos el desktop por su accessible name EXACTO
        // (case-sensitive) para desambiguar del mobile en minúscula.
        const evaluarBtn = screen.getByRole('button', { name: 'Evaluar de Nuevo' });
        await user.click(evaluarBtn);

        // Modal should open
        expect(screen.getByRole('heading', { name: /Evaluar de Nuevo/i })).toBeInTheDocument();

        // Select Renovar option (ya es el default del modal; lo seleccionamos explícito)
        const renovarOption = screen.getByText(/Renovar plan actual/i);
        await user.click(renovarOption.closest('button'));

        // [P3-EVALUATE-MODAL-REDESIGN · 2026-06-28] El modal es "elige y confirma":
        // la fila (ChoiceRow) SOLO selecciona la opción; regeneratePlan se dispara
        // con el botón de confirmación único, cuyo label es "Generar plan" cuando la
        // opción NO es destructiva (renovar). Sin este click el onConfirm nunca corre.
        const confirmBtn = screen.getByRole('button', { name: 'Generar plan' });
        await user.click(confirmBtn);

        // Verify regeneratePlan was called.
        // [APPEARANCE-THEME · 2026-05-28] El handler 'renovar' ahora pasa
        // props extra ({ toastId, entry_point: 'settings_renovar' }) además de
        // { reason, isPlanExpired }. `toastId` es un id dinámico de sonner, así
        // que asertamos con objectContaining sobre el contrato estable en vez
        // de un match exacto.
        await waitFor(() => {
            expect(mockRegeneratePlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    reason: 'variety',
                    isPlanExpired: false,
                    entry_point: 'settings_renovar',
                })
            );
        });
    });
});
