// [P1-WIZARD-EXIT-CONFIRM · 2026-08-10] El botón del paso 1 borraba el formulario
// entero al primer toque, y era indistinguible del «paso anterior».
//
// EL FLUJO REAL QUE LO CONVIERTE EN TRAMPA: el chevron del header es el único «atrás»
// que hay en móvil. El usuario retrocede con él tres, cuatro veces. Al llegar al paso 1
// el header pinta OTRO botón —misma clase, mismo icono, mismo tamaño, misma celda— que
// no retrocede: destruye. Lo único que los separaba era un media query de escritorio, o
// sea que en 320-430px eran píxel a píxel el mismo control en la misma posición.
//
// Y lo que hacía no era salir: para el invitado borra el formulario, el plan y el paso
// guardado; para una cuenta, además CIERRA LA SESIÓN. Sin deshacer. La misma operación
// desde el dashboard ya estaba detrás de una confirmación — la asimetría era el defecto.
//
// [P1-WIZARD-STEP-FOCUS] De paso, al cambiar de paso el foco caía al <body>: 21 veces
// seguidas hay que re-tabular desde el principio. Sin vista, el formulario era
// prácticamente incompletable.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import InteractiveAssessmentLayout from '../components/assessment/InteractiveAssessmentLayout';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
    const real = await vi.importActual('react-router-dom');
    return { ...real, useNavigate: () => navigateMock };
});

const montar = (ctx = {}) => {
    const exitGuestSession = vi.fn();
    const resetApp = vi.fn().mockResolvedValue(undefined);
    const prevStep = vi.fn();
    render(
        // El harness de `test-utils` ya envuelve en un Router; anidar otro es un error duro.
        <InteractiveAssessmentLayout totalSteps={21} stepKey="s0" title="Un título" subtitle="Un subtítulo">
            <div>contenido</div>
        </InteractiveAssessmentLayout>,
        {
            customContext: {
                currentStep: 0, prevStep, resetApp, exitGuestSession,
                isGuest: true, userProfile: null, ...ctx,
            },
        },
    );
    return { exitGuestSession, resetApp, prevStep };
};

describe('[P1-WIZARD-EXIT-CONFIRM] salir del formulario pide confirmación', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('el primer toque NO destruye nada: pregunta', async () => {
        const user = userEvent.setup();
        const { exitGuestSession } = montar();

        await user.click(screen.getByRole('button', { name: /Salir del formulario/i }));

        expect(exitGuestSession).not.toHaveBeenCalled();
        expect(navigateMock).not.toHaveBeenCalled();
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('cancelar deja al usuario donde estaba, con su formulario intacto', async () => {
        const user = userEvent.setup();
        const { exitGuestSession } = montar();

        await user.click(screen.getByRole('button', { name: /Salir del formulario/i }));
        await screen.findByRole('dialog');
        await user.click(screen.getByRole('button', { name: /Cancelar/i }));

        expect(exitGuestSession).not.toHaveBeenCalled();
        expect(navigateMock).not.toHaveBeenCalled();
    });

    it('confirmar sí ejecuta la salida (la confirmación no puede volverla inalcanzable)', async () => {
        // Una confirmación que no deja completar la acción es peor que no tenerla.
        const user = userEvent.setup();
        const { exitGuestSession } = montar();

        await user.click(screen.getByRole('button', { name: /Salir del formulario/i }));
        await screen.findByRole('dialog');
        await user.click(screen.getByRole('button', { name: /^Salir$/i }));

        await waitFor(() => expect(exitGuestSession).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true }));
    });

    it('en una cuenta, la salida cierra sesión — y también pregunta antes', async () => {
        const user = userEvent.setup();
        const { resetApp } = montar({ isGuest: false, userProfile: { email: 'a@b.do' } });

        await user.click(screen.getByRole('button', { name: /Salir del formulario/i }));
        expect(resetApp).not.toHaveBeenCalled();

        await screen.findByRole('dialog');
        await user.click(screen.getByRole('button', { name: /Cerrar sesión/i }));
        await waitFor(() => expect(resetApp).toHaveBeenCalledTimes(1));
    });

    it('el botón de salir NO se parece al de «paso anterior»', async () => {
        // El defecto no era solo la falta de confirmación: era que el control destructivo
        // fuese indistinguible del que el usuario acababa de pulsar tres veces. Si algún
        // día vuelven a compartir nombre accesible, esto avisa.
        montar();
        const salir = screen.getByRole('button', { name: /Salir del formulario/i });
        expect(salir).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Paso anterior' })).toBeNull();
    });
});

describe('[P1-WIZARD-STEP-FOCUS] el foco sigue al paso', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('el título es enfocable por código pero NO entra en el orden de tabulación', () => {
        montar();
        const h1 = screen.getByRole('heading', { level: 1 });
        expect(h1).toHaveAttribute('tabindex', '-1');
    });

    it('no roba el foco en la primera pantalla', () => {
        // Enfocar al montar sería intrusivo: el usuario acaba de llegar y no ha navegado.
        // Solo debe moverse cuando el paso CAMBIA.
        montar();
        expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
    });
});
