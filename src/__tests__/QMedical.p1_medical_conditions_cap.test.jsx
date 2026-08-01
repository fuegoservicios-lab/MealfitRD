// [P1-MEDICAL-CONDITIONS-CAP · 2026-08-01] Cap de 3 condiciones médicas
// simultáneas + eliminación de los inputs de texto libre "Otra condición
// médica..." / "Otro medicamento..." del assessment (decisión de producto
// del owner, espejo del backend `_validate_medical_conditions_cap` en
// `routers/plans.py`).
//
// Este archivo reemplaza la cobertura que un futuro test de QMedical.jsx
// hubiera necesitado para los free-text inputs retirados: NO existía un
// test previo de QMedical (grep confirmó 0 archivos referenciando
// `QMedical`/`otherConditions`/`otherMedications` en `src/__tests__` antes
// de este cambio), así que no hay nada que "actualizar" — este es el primer
// test de este componente, y cubre explícitamente la ausencia de los inputs
// retirados para que una regresión futura (reintroducirlos) se detecte.
//
// Harness: `useAssessment` se mockea con `vi.spyOn` (mismo patrón que
// `utils/test-utils.jsx`), pero envuelto en un componente `Harness` con
// `useState` REAL — necesario porque `mockReturnValue` estático no
// re-renderiza QMedical tras un `updateData`; el harness registra un valor
// FRESCO del mock en cada uno de sus propios re-renders (disparados por
// `setMedicalConditions`), así que un click real en un chip se refleja en
// el siguiente render de QMedical, igual que en producción.
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as assessmentModule from '../context/AssessmentContext';
import { QMedical } from '../components/assessment/questions/QMedical';

// Mismo mock que `utils/test-utils.jsx` — necesario porque importar
// AssessmentContext.jsx (para poder espiar `useAssessment`) ejecuta sus
// imports top-level, incluyendo `authClient`.
vi.mock('../authClient', () => ({
    authClient: {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
            getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
            signOut: vi.fn().mockResolvedValue({ error: null }),
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    getBackendToken: vi.fn().mockResolvedValue(null),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
}));

function Harness({ initialConditions = [], gender = 'male', onAdvance = () => {} }) {
    const [medicalConditions, setMedicalConditions] = useState(initialConditions);
    const [extra, setExtra] = useState({});
    // Re-registrado en CADA render de Harness (incluyendo los disparados por
    // setMedicalConditions/setExtra) — el mock siempre refleja el estado
    // actual cuando QMedical (hijo) lo consulta.
    vi.spyOn(assessmentModule, 'useAssessment').mockReturnValue({
        formData: { medicalConditions, medications: [], gender, ...extra },
        updateData: (key, value) => {
            if (key === 'medicalConditions') { setMedicalConditions(value); return; }
            setExtra((prev) => ({ ...prev, [key]: value }));
        },
    });
    return <QMedical onManualAdvance={onAdvance} />;
}

const chip = (name) => screen.getByRole('button', { name });
const nextButton = () => screen.getByRole('button', { name: /Siguiente/i });

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('[P1-MEDICAL-CONDITIONS-CAP] cap de 3 condiciones reales', () => {
    it('con 3 condiciones seleccionadas, los chips NO seleccionados quedan aria-disabled', () => {
        render(<Harness initialConditions={['Diabetes T2', 'Hipertensión', 'Colesterol Alto']} />);
        expect(chip('Gastritis')).toHaveAttribute('aria-disabled', 'true');
        expect(chip('SOP (PCOS)')).toHaveAttribute('aria-disabled', 'true');
        // Los YA seleccionados nunca se marcan disabled (deben poder deseleccionarse).
        expect(chip('Diabetes T2')).not.toHaveAttribute('aria-disabled');
    });

    it('con menos de 3, ningún chip está aria-disabled', () => {
        render(<Harness initialConditions={['Diabetes T2']} />);
        expect(chip('Gastritis')).not.toHaveAttribute('aria-disabled');
        expect(chip('Hipertensión')).not.toHaveAttribute('aria-disabled');
    });

    it('intentar marcar una 4ª condición real muestra el mensaje inline y NO la agrega', () => {
        render(<Harness initialConditions={['Diabetes T2', 'Hipertensión', 'Colesterol Alto']} />);
        expect(screen.queryByRole('alert')).toBeNull();

        fireEvent.click(chip('Gastritis'));

        expect(screen.getByRole('alert')).toHaveTextContent(
            /Máximo 3 condiciones para garantizar la calidad clínica del plan/
        );
        // Gastritis sigue sin seleccionarse (aria-pressed sigue false).
        expect(chip('Gastritis')).toHaveAttribute('aria-pressed', 'false');
    });

    it('deseleccionar una condición SIEMPRE funciona en el cap y libera un slot', () => {
        render(<Harness initialConditions={['Diabetes T2', 'Hipertensión', 'Colesterol Alto']} />);
        fireEvent.click(chip('Diabetes T2')); // deselecciona
        expect(chip('Diabetes T2')).toHaveAttribute('aria-pressed', 'false');
        // Con 2 reales, el resto ya no está disabled.
        expect(chip('Gastritis')).not.toHaveAttribute('aria-disabled');
    });

    it('marcar "Ninguna" SIEMPRE funciona en el cap (sentinel exclusivo)', () => {
        render(<Harness initialConditions={['Diabetes T2', 'Hipertensión', 'Colesterol Alto']} />);
        fireEvent.click(chip('Ninguna'));
        expect(chip('Ninguna')).toHaveAttribute('aria-pressed', 'true');
        expect(chip('Diabetes T2')).toHaveAttribute('aria-pressed', 'false');
        // El cap se resetea (0 reales) → nada queda disabled.
        expect(chip('Gastritis')).not.toHaveAttribute('aria-disabled');
    });

    it('el mensaje se limpia tras un toggle exitoso (deseleccionar tras un intento bloqueado)', () => {
        render(<Harness initialConditions={['Diabetes T2', 'Hipertensión', 'Colesterol Alto']} />);
        fireEvent.click(chip('Gastritis')); // bloqueado, muestra mensaje
        expect(screen.getByRole('alert')).toBeInTheDocument();
        fireEvent.click(chip('Diabetes T2')); // deselecciona con éxito
        expect(screen.queryByRole('alert')).toBeNull();
    });
});

describe('[P1-MEDICAL-CONDITIONS-CAP] Embarazo/Lactancia exentos del cap (safety)', () => {
    it('Embarazo NUNCA está aria-disabled aunque el cap esté alcanzado', () => {
        render(<Harness gender="female" initialConditions={['Diabetes T2', 'Hipertensión', 'Colesterol Alto']} />);
        expect(chip('Embarazo')).not.toHaveAttribute('aria-disabled');
        expect(chip('Lactancia')).not.toHaveAttribute('aria-disabled');
    });

    it('marcar Embarazo con 3 condiciones reales SIEMPRE funciona (no dispara el mensaje del cap)', () => {
        render(<Harness gender="female" initialConditions={['Diabetes T2', 'Hipertensión', 'Colesterol Alto']} />);
        fireEvent.click(chip('Embarazo'));
        expect(chip('Embarazo')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByRole('alert')).toBeNull();
        // Las 3 condiciones reales originales siguen intactas (Embarazo no las desplazó).
        expect(chip('Diabetes T2')).toHaveAttribute('aria-pressed', 'true');
        expect(chip('Hipertensión')).toHaveAttribute('aria-pressed', 'true');
        expect(chip('Colesterol Alto')).toHaveAttribute('aria-pressed', 'true');
    });

    it('una 4ª condición REAL sigue bloqueada aunque ya se haya marcado Embarazo', () => {
        render(<Harness gender="female" initialConditions={['Diabetes T2', 'Hipertensión', 'Colesterol Alto', 'Embarazo']} />);
        fireEvent.click(chip('Gastritis'));
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(chip('Gastritis')).toHaveAttribute('aria-pressed', 'false');
    });
});

describe('[P1-MEDICAL-CONDITIONS-CAP] medicamentos sin cap', () => {
    it('los chips de medicamentos nunca quedan aria-disabled ni disparan el mensaje del cap', () => {
        render(<Harness initialConditions={['Diabetes T2', 'Hipertensión', 'Colesterol Alto']} />);
        // 3 condiciones médicas en el cap, pero medicamentos es un dominio aparte.
        for (const med of ['Metformina', 'Insulina', 'Lisinopril', 'Atorvastatina']) {
            expect(chip(med)).not.toHaveAttribute('aria-disabled');
        }
        fireEvent.click(chip('Metformina'));
        expect(chip('Metformina')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByRole('alert')).toBeNull();
    });
});

describe('[P1-MEDICAL-CONDITIONS-CAP] inputs de texto libre eliminados', () => {
    it('NO renderiza el input "Otra condición médica..."', () => {
        render(<Harness />);
        expect(screen.queryByPlaceholderText(/Otra condición médica/i)).toBeNull();
    });

    it('NO renderiza el input "Otro medicamento..."', () => {
        render(<Harness />);
        expect(screen.queryByPlaceholderText(/Otro medicamento/i)).toBeNull();
    });

    it('NO renderiza ningún <input type="text"> (0 free-text fields en el step)', () => {
        const { container } = render(<Harness />);
        expect(container.querySelectorAll('input[type="text"]').length).toBe(0);
    });
});

describe('[P1-MEDICAL-CONDITIONS-CAP] gate del NextButton (sin OR de otherConditions)', () => {
    it('deshabilitado con medicalConditions vacío', () => {
        render(<Harness initialConditions={[]} />);
        expect(nextButton()).toBeDisabled();
    });

    it('habilitado con "Ninguna" marcada', () => {
        render(<Harness initialConditions={['Ninguna']} />);
        expect(nextButton()).not.toBeDisabled();
    });

    it('habilitado con al menos 1 condición real', () => {
        render(<Harness initialConditions={['Diabetes T2']} />);
        expect(nextButton()).not.toBeDisabled();
    });
});
