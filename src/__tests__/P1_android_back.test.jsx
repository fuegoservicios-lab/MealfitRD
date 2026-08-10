// [P1-ANDROID-BACK · 2026-08-10] Grupo 3 de la auditoría de listo-para-tienda: el gesto
// «atrás» de Android no significaba nada.
//
// En Android el deslizamiento desde el borde es la forma canónica de decir «atrás», y en
// un formulario de 21 pasos es el reflejo que más se usa. Google lo revisa.
//
//   WIZARD — los pasos eran estado de React, no entradas de historial. En el mejor caso
//     el gesto producía un parpadeo que dejaba al usuario en el mismo paso (y parecía
//     que la app lo ignoraba); con la pila consumida, salía del formulario.
//
//   LOGIN — la transición correo→código era `setStep` puro. El gesto atrás en el paso
//     del código no volvía al correo: salía de /login. Y si /login era la primera
//     entrada —arranque en frío de la app instalada, el caso NORMAL en tienda— CERRABA
//     LA APP, con el código ya consumido.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import InteractiveAssessmentLayout from '../components/assessment/InteractiveAssessmentLayout';
import * as assessmentModule from '../context/AssessmentContext';

vi.mock('react-router-dom', async () => {
    const real = await vi.importActual('react-router-dom');
    return { ...real, useNavigate: () => vi.fn() };
});

// El harness espía `useAssessment` con un objeto FIJO, así que para simular un avance
// real hay que re-espiarlo antes de volver a renderizar: cambiar solo las props no mueve
// el paso, y un test que no mueve el paso no mide nada.
const ctx = (currentStep, prevStep) => ({
    currentStep, prevStep,
    resetApp: vi.fn(), exitGuestSession: vi.fn(), isGuest: true, userProfile: null,
});
const ponerPaso = (currentStep, prevStep) => {
    vi.spyOn(assessmentModule, 'useAssessment').mockReturnValue(ctx(currentStep, prevStep));
};
const vista = (n) => (
    <InteractiveAssessmentLayout totalSteps={21} stepKey={`s${n}`} title="T" subtitle="S">
        <div>contenido</div>
    </InteractiveAssessmentLayout>
);

const montar = (currentStep, prevStep) => render(
    <InteractiveAssessmentLayout totalSteps={21} stepKey={`s${currentStep}`} title="T" subtitle="S">
        <div>contenido</div>
    </InteractiveAssessmentLayout>,
    { customContext: { currentStep, prevStep, resetApp: vi.fn(), exitGuestSession: vi.fn(), isGuest: true, userProfile: null } },
);

describe('[P1-ANDROID-BACK] el gesto atrás retrocede un paso del wizard', () => {
    let pushSpy;
    beforeEach(() => {
        vi.clearAllMocks();
        pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    });
    afterEach(() => { pushSpy.mockRestore(); });

    it('avanzar de paso deja una entrada en el historial', async () => {
        const prevStep = vi.fn();
        const { rerender } = montar(0, prevStep);
        pushSpy.mockClear();
        ponerPaso(1, prevStep);
        rerender(vista(1));
        await waitFor(() => expect(pushSpy).toHaveBeenCalledTimes(1));
    });

    it('el gesto atrás llama a prevStep en vez de salir del formulario', async () => {
        const prevStep = vi.fn();
        montar(5, prevStep);
        window.dispatchEvent(new PopStateEvent('popstate'));
        await waitFor(() => expect(prevStep).toHaveBeenCalledTimes(1));
    });

    it('en el PRIMER paso el gesto NO se intercepta: debe poder salir', async () => {
        // Atrapar el gesto en el paso 1 dejaría al usuario encerrado en el formulario,
        // que es peor que el defecto original.
        const prevStep = vi.fn();
        montar(0, prevStep);
        window.dispatchEvent(new PopStateEvent('popstate'));
        await new Promise((r) => setTimeout(r, 20));
        expect(prevStep).not.toHaveBeenCalled();
    });

    it('retroceder NO empuja una entrada nueva (harían falta dos gestos por paso)', async () => {
        const prevStep = vi.fn();
        const { rerender } = montar(5, prevStep);
        window.dispatchEvent(new PopStateEvent('popstate'));
        await waitFor(() => expect(prevStep).toHaveBeenCalled());
        pushSpy.mockClear();
        // El padre aplica el retroceso: el paso baja de verdad.
        ponerPaso(4, prevStep);
        rerender(vista(4));
        await new Promise((r) => setTimeout(r, 20));
        expect(pushSpy).not.toHaveBeenCalled();
    });

    it('el oyente se retira al desmontar (no deja fugas entre pantallas)', async () => {
        const prevStep = vi.fn();
        const { unmount } = montar(5, prevStep);
        unmount();
        window.dispatchEvent(new PopStateEvent('popstate'));
        await new Promise((r) => setTimeout(r, 20));
        expect(prevStep).not.toHaveBeenCalled();
    });

    it('el título sigue siendo el destino del foco (no se rompió el grupo anterior)', () => {
        montar(3, vi.fn());
        expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('tabindex', '-1');
    });
});
