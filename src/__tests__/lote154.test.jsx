// [P1-PLAN-LOTE-154 · 2026-09-22] «Ni siquiera debe aparecerme este botón de saltar a la última
// pregunta, ya que no tengo la pregunta obligatoria llena — y aunque la llene no debería dejarme
// saltar otras preguntas que son obligatorias de llenar.»
//
// La captura: paso 2 de 26, «¿Cómo quieres que la IA arme tu plan?» marcada con * y sin elegir, y
// debajo el botón «Saltar a la última pregunta». Encima, el aviso de un intento anterior: «Antes de
// saltar, completa: Cómo arma tu plan la IA».
//
// O sea: la validación EXISTÍA y funcionaba —ese aviso es ella— pero vivía un click más tarde que
// el botón. `canSkip` decidía si pintarlo mirando la HISTORIA del usuario (¿llegó más lejos?, ¿ya
// tiene plan?, ¿viene del contador?) y `handleSkipToLastStep` decidía si dejarlo saltar mirando el
// CONTRATO. Dos respuestas a la misma pregunta, y la que el usuario ve es la que no manda: un botón
// que promete el final y devuelve al principio.
//
// Estos tests montan el componente de verdad (no leen el fichero): lo que se afirma es lo que el
// usuario ve. La guarda del handler se comprueba aparte, porque sigue siendo la segunda capa.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from './utils/test-utils';
import InteractiveAssessmentFlow from '../components/assessment/InteractiveAssessmentFlow';
import { REQUIRED_FORM_FIELDS } from '../config/formValidation';

vi.mock('react-router-dom', async () => {
    const real = await vi.importActual('react-router-dom');
    return { ...real, useNavigate: () => vi.fn() };
});

const PLAN_PREVIO = { days: [{ day_name: 'Día 1', meals: [] }], generation_status: 'complete' };

// Derivado del contrato, no escrito a mano: una pregunta obligatoria nueva entra sola aquí y no
// deja el fixture a medias sin que nadie se entere.
const _ARRAYS = new Set(['allergies', 'dislikes', 'medicalConditions', 'struggles', 'cultureProfiles']);
const formCompleto = (salvo = []) => Object.fromEntries(
    REQUIRED_FORM_FIELDS
        .filter((campo) => !salvo.includes(campo))
        .map((campo) => [campo, _ARRAYS.has(campo) ? ['Ninguna'] : 'x']),
);

// Un usuario que YA tiene plan: `canSkip` es cierto por su historia pase lo que pase con el
// formulario. Es justo el estado de la captura, y el que hacía aparecer el botón.
const montar = (ctx = {}) => render(<InteractiveAssessmentFlow />, {
    customContext: {
        currentStep: 1,
        maxReachedStep: 5,
        planData: PLAN_PREVIO,
        formData: formCompleto(),
        setCurrentStep: vi.fn(),
        nextStep: vi.fn(),
        prevStep: vi.fn(),
        updateData: vi.fn(),
        resetApp: vi.fn(),
        exitGuestSession: vi.fn(),
        loadingSensitive: false,
        isGuest: false,
        userProfile: null,
        ...ctx,
    },
});

const botonSaltar = () => screen.queryByRole('button', { name: /Saltar a la última pregunta/i });

describe('[P1-PLAN-LOTE-154] el atajo del formulario no promete lo que no puede cumplir', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('EL CASO DE LA CAPTURA: con la obligatoria del paso en blanco, el botón NO existe', () => {
        // `planSource` es la pregunta de la captura («¿Cómo quieres que la IA arme tu plan?»).
        montar({ formData: formCompleto(['planSource']) });
        expect(botonSaltar()).toBeNull();
    });

    it('LA SEGUNDA QUEJA: contestada ésa, sigue sin aparecer mientras falte OTRA obligatoria', () => {
        // Aquí `planSource` ya está; lo que falta es una pregunta de más adelante. El contrato
        // cubre TODAS, no la del paso en curso: si mirara solo este paso, el botón volvería a
        // aparecer y volvería a rebotar.
        montar({ formData: formCompleto(['motivation']) });
        expect(botonSaltar()).toBeNull();
    });

    it('con el formulario entero contestado SÍ aparece: el atajo sigue existiendo para quien vuelve', () => {
        // El arreglo no es «quitar el botón»: es que solo esté cuando el salto es real. Este es el
        // caso que P1-SKIP-ALWAYS-REACHABLE defendía y que no se puede perder.
        montar();
        expect(botonSaltar()).toBeInTheDocument();
    });

    it('mientras el formulario cifrado se descifra tampoco aparece', () => {
        // `loadingSensitive` es la ventana en la que alergias/condiciones aún no se han leído: el
        // contrato diría que faltan. Sin esta condición el botón parpadearía a la inversa —visible
        // con datos sin leer, escondido al llegar—, que es el mismo susto de P1-14 por otra puerta.
        montar({ loadingSensitive: true });
        expect(botonSaltar()).toBeNull();
    });

    it('quien llega del contador ya no ve un atajo que no lo es (lo que el 151 dio de más)', () => {
        // El lote 151 encendió `canSkip` para quien termina la rama corta y activa el plan. Con el
        // formulario del contador completo y las 13 del plan sin contestar, aquel botón decía
        // «saltar a la última» y hacía «llévame a lo que falta». Sin plan previo y sin haber
        // avanzado, `canSkip` sigue siendo cierto por esa tercera vía — y el botón, no.
        montar({
            planData: null,
            currentStep: 1,
            maxReachedStep: 1,
            formData: { ...formCompleto(['planSource', 'motivation']), appMode: 'plan' },
        });
        expect(botonSaltar()).toBeNull();
    });
});

describe('[P1-PLAN-LOTE-154] la segunda capa sigue en pie', () => {
    const fuente = fs.readFileSync(
        path.resolve(__dirname, '..', 'components', 'assessment', 'InteractiveAssessmentFlow.jsx'),
        'utf-8',
    );

    it('el botón se pinta con `canSkipToEnd`, no con `canSkip`', () => {
        expect(fuente).toContain('{canSkipToEnd && currentStep < steps.length - 1 && (');
    });

    it('la condición mira el contrato de SU rama, el descifrado y el alcance clínico', () => {
        const bloque = fuente.slice(
            fuente.indexOf('const _faltaAlgoObligatorio'),
            fuente.indexOf('const canSkipToEnd') + 260,
        );
        expect(bloque).toContain('findFirstIncompleteFieldFor(formData, TRACKING_REQUIRED_FIELDS)');
        expect(bloque).toContain('findFirstIncompleteField(formData)');
        expect(bloque).toContain('!loadingSensitive');
        expect(bloque).toContain('!_faltaAlgoObligatorio');
        expect(bloque).toContain('!hasOutOfScopeMedical(formData)');
    });

    it('el handler CONSERVA su propia validación: esconder el botón no es cerrar la puerta', () => {
        // Si un día alguien afloja la condición de arriba, o llega aquí por otra vía, el salto
        // sigue rebotando al primer campo incompleto. La duplicación es deliberada.
        // El corte arranca en el handler y acaba en SU salto final: `setCurrentStep(steps.length - 1)`
        // aparece antes en el fichero (el clamp de P1-FORM-AUDIT-BATCH), y buscarlo desde el principio
        // devolvía un trozo vacío — un test que pasa sin mirar nada.
        const inicio = fuente.indexOf('const handleSkipToLastStep');
        const cuerpo = fuente.slice(
            inicio,
            fuente.indexOf('setCurrentStep(steps.length - 1);', inicio),
        );
        expect(cuerpo.length).toBeGreaterThan(200);
        expect(cuerpo).toContain('findFirstIncompleteField');
        expect(cuerpo).toContain('hasOutOfScopeMedical(formData)');
        expect(cuerpo).toContain('loadingSensitive');
    });
});
