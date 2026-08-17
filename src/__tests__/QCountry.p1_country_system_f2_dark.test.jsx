// [P1-COUNTRY-SYSTEM-F2 · 2026-08-17] Defensa en profundidad del efecto de preselección de
// QCountry (contrato Task 2): con `COUNTRY_SYSTEM_UI` apagado — el valor REAL del build, sin
// mockear nada, que es EXACTAMENTE lo que corre en producción hoy (confirmado abajo con un
// guard propio) — el efecto no debe hacer nada, incluso si algún día alguien monta QCountry
// sin pasar por el gate externo de InteractiveAssessmentFlow.jsx (test, storybook, refactor
// futuro que olvide el `COUNTRY_SYSTEM_UI ? [...] : []` que hoy lo envuelve).
//
// Archivo SEPARADO de QCountry.p1_country_system_f2.test.jsx a propósito: ese archivo mockea
// `COUNTRY_SYSTEM_UI` a `true` (hoisted, cubre TODO el archivo) para ejercitar la rama
// post-flip — no puede convivir en el mismo archivo con este caso sin gimnasia de
// `vi.doUnmock`/`vi.resetModules` a mitad de archivo.
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import * as assessmentModule from '../context/AssessmentContext';
import { QCountry } from '../components/assessment/questions/QCountry';
import { COUNTRY_SYSTEM_UI, DEFAULT_COUNTRY } from '../config/countries';

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

function Harness({ onUpdate }) {
    const [country, setCountry] = useState(DEFAULT_COUNTRY);
    vi.spyOn(assessmentModule, 'useAssessment').mockReturnValue({
        formData: { country },
        updateData: (key, value) => {
            onUpdate?.(key, value);
            if (key === 'country') setCountry(value);
        },
    });
    return <QCountry onAutoAdvance={() => {}} />;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('[P1-COUNTRY-SYSTEM-F2] QCountry — defensa en profundidad (COUNTRY_SYSTEM_UI apagado)', () => {
    it('guard: este archivo prueba justo el valor que corre en producción hoy', () => {
        expect(COUNTRY_SYSTEM_UI).toBe(false);
    });

    it('COUNTRY_SYSTEM_UI=false ⇒ el efecto no llama a Intl.DateTimeFormat ni a updateData, y el radio se queda en DO', () => {
        const dtfSpy = vi.spyOn(Intl, 'DateTimeFormat');
        const onUpdate = vi.fn();
        const { container } = render(<Harness onUpdate={onUpdate} />);

        expect(dtfSpy).not.toHaveBeenCalled();
        expect(onUpdate).not.toHaveBeenCalled();
        expect(container.querySelector('input[type="radio"]:checked')?.value).toBe('DO');
    });
});
