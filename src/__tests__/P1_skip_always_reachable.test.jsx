// [P1-SKIP-ALWAYS-REACHABLE · 2026-08-10] «¿Por qué en móvil no aparece el botón para
// saltar a la última pregunta?» — reportado por el dueño desde su teléfono.
//
// NO ERA COSA DEL MÓVIL. Medido como invitado contra producción: en el paso 1 el botón
// falta EN LOS DOS anchos, teléfono y escritorio; y `.mf-ghost-btn` no tiene una sola
// regla que dependa del ancho de pantalla.
//
// Lo que lo escondía es la combinación de dos reglas que por separado son razonables:
//   · el botón se pintaba solo si `currentStep === 0`;
//   · [P1-FORM-RESUME] el formulario arranca en el paso que guardaste.
// Quien ya avanzó no vuelve a pasar por el paso 0, así que el atajo quedaba fuera del
// alcance de EXACTAMENTE la persona para la que se escribió: la que ya tiene un plan y
// vuelve al formulario. Y como `localStorage` es por dispositivo, en el teléfono (con
// progreso guardado) no salía y en el PC (recién estrenado, paso 0) sí — de ahí la
// impresión de que fallaba en móvil.
//
// Ahora la condición es `canSkip` (ya llegaste más lejos antes, o ya tienes un plan) y
// no estar en la última pregunta. El flujo lineal de quien entra por primera vez no
// cambia: ahí `canSkip` es false y el botón sigue sin aparecer.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from './utils/test-utils';
import InteractiveAssessmentFlow from '../components/assessment/InteractiveAssessmentFlow';

vi.mock('react-router-dom', async () => {
    const real = await vi.importActual('react-router-dom');
    return { ...real, useNavigate: () => vi.fn() };
});

const PLAN_PREVIO = { days: [{ day_name: 'Día 1', meals: [] }], generation_status: 'complete' };

const montar = (ctx = {}) => render(<InteractiveAssessmentFlow />, {
    customContext: {
        currentStep: 0,
        maxReachedStep: 0,
        planData: null,
        formData: {},
        setCurrentStep: vi.fn(),
        nextStep: vi.fn(),
        prevStep: vi.fn(),
        updateData: vi.fn(),
        resetApp: vi.fn(),
        exitGuestSession: vi.fn(),
        loadingSensitive: false,
        isGuest: true,
        userProfile: null,
        ...ctx,
    },
});

const botonSaltar = () => screen.queryByRole('button', { name: /Saltar a la última pregunta/i });

// El total de pasos no es fijo (el invitado ve uno menos que una cuenta), así que se
// lee del propio contador en vez de clavarlo: un test que hardcodea 21 se rompe el día
// que se añada una pregunta, y no por el motivo que dice vigilar.
const totalDePasos = () => {
    const m = document.body.textContent.match(/PASO\s+\d+\s+DE\s+(\d+)/i);
    expect(m, 'no se encontró el contador «PASO N DE M»').toBeTruthy();
    return Number(m[1]);
};

describe('[P1-SKIP-ALWAYS-REACHABLE] el atajo alcanza a quien vuelve', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('EL CASO REPORTADO: con un plan hecho y el formulario reanudado a media altura, el botón está', () => {
        // Antes del arreglo este caso daba `null`: el botón existía solo en el paso 0 y
        // aquí se arranca en el 3 porque es donde el usuario lo dejó.
        montar({ currentStep: 2, maxReachedStep: 2, planData: PLAN_PREVIO });
        expect(botonSaltar()).toBeInTheDocument();
    });

    it('quien entra por primera vez NO lo ve: su recorrido es lineal', () => {
        // Si apareciera aquí sería una invitación a saltarse el formulario entero antes
        // de haber contestado nada — y el destino del salto sería un aviso de campos
        // incompletos. Mostrarlo solo cuando puede servir es parte del arreglo.
        montar({ currentStep: 0, maxReachedStep: 0, planData: null });
        expect(botonSaltar()).toBeNull();
    });

    it('quien avanzó y retrocedió sí lo ve, aunque no tenga plan todavía', () => {
        montar({ currentStep: 1, maxReachedStep: 3, planData: null });
        expect(botonSaltar()).toBeInTheDocument();
    });

    it('en la última pregunta NO se pinta: saltaría a donde ya estás', () => {
        const { unmount } = montar({ currentStep: 0, maxReachedStep: 0, planData: null });
        const ultimo = totalDePasos() - 1;
        unmount();

        montar({ currentStep: ultimo, maxReachedStep: ultimo, planData: PLAN_PREVIO });
        expect(botonSaltar()).toBeNull();
    });

    it('no depende del ancho de pantalla: nada lo oculta por CSS', () => {
        // La hipótesis del reporte era «en móvil no sale». Si alguien la reintroduce
        // como media query sobre el botón, esto lo caza antes de que el dueño lo note.
        montar({ currentStep: 2, maxReachedStep: 2, planData: PLAN_PREVIO });
        expect(botonSaltar()).toHaveClass('mf-ghost-btn');

        const cssBoton = fs.readFileSync(
            path.resolve(__dirname, '..', 'index.css'),
            'utf-8',
        );
        const bloques = cssBoton.split('@media').slice(1);
        for (const bloque of bloques) {
            const cabecera = bloque.slice(0, bloque.indexOf('{'));
            const cuerpo = bloque.slice(0, bloque.indexOf('\n}') + 2);
            if (/width/i.test(cabecera) && /\.mf-ghost-btn\b/.test(cuerpo)) {
                throw new Error(
                    `.mf-ghost-btn no puede depender del ancho: aparece bajo @media${cabecera.trim()}`,
                );
            }
        }
    });
});
