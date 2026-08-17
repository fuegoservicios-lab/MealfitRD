// [P1-COUNTRY-SYSTEM-F2 · 2026-08-17] Preselección IANA en QCountry (Addendum §4 del dueño):
// el paso SIGUE siendo una pregunta — preselecciona, nunca decide en silencio, y jamás pisa
// una elección que ya no es el default sembrado.
//
// Harness con useState REAL (mismo patrón que QMedical.p1_medical_conditions_cap.test.jsx):
// un mockReturnValue estático no re-renderiza QCountry tras el updateData que el propio
// efecto de preselección dispara, así que el harness registra un valor FRESCO del mock en
// cada uno de sus propios re-renders — igual que un click real en producción.
//
// `COUNTRY_SYSTEM_UI` se evalúa en IMPORT TIME desde `import.meta.env.VITE_COUNTRY_SYSTEM`
// (ausente en el runner ⇒ false). Se mockea el módulo a `true` para ejercitar la rama
// "post-flip" del efecto; el caso `false` (defensa en profundidad, contrato Task 2) se
// prueba con el valor REAL del build — sin mockear nada — porque es justo lo que corre HOY.
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import * as assessmentModule from '../context/AssessmentContext';
import { QCountry } from '../components/assessment/questions/QCountry';
import { DEFAULT_COUNTRY, COUNTRIES } from '../config/countries';

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

vi.mock('../config/countries', async () => {
    const actual = await vi.importActual('../config/countries');
    return { ...actual, COUNTRY_SYSTEM_UI: true };
});

function Harness({ initialCountry, onUpdate }) {
    const [country, setCountry] = useState(initialCountry);
    vi.spyOn(assessmentModule, 'useAssessment').mockReturnValue({
        formData: { country },
        updateData: (key, value) => {
            onUpdate?.(key, value);
            if (key === 'country') setCountry(value);
        },
    });
    return <QCountry onAutoAdvance={() => {}} />;
}

function mockTimeZone(tz) {
    return vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
        resolvedOptions: () => ({ timeZone: tz }),
    }));
}

function checkedValue(container) {
    return container.querySelector('input[type="radio"]:checked')?.value ?? null;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('[P1-COUNTRY-SYSTEM-F2] QCountry preselecciona por zona IANA sin pisar al usuario', () => {
    it('formData.country sembrado en DO (default) + zona Europe/Madrid ⇒ preselecciona ES', () => {
        mockTimeZone('Europe/Madrid');
        const onUpdate = vi.fn();
        const { container } = render(<Harness initialCountry={DEFAULT_COUNTRY} onUpdate={onUpdate} />);

        expect(onUpdate).toHaveBeenCalledWith('country', 'ES');
        expect(checkedValue(container)).toBe('ES');
    });

    it('zona America/Puerto_Rico ⇒ preselecciona PR — nunca cae a DO por compartir offset -240', () => {
        mockTimeZone('America/Puerto_Rico');
        const { container } = render(<Harness initialCountry={DEFAULT_COUNTRY} />);

        expect(checkedValue(container)).toBe('PR');
    });

    it('formData.country AUSENTE (undefined, nunca tocó el paso) ⇒ mismo tratamiento que DO sembrado', () => {
        mockTimeZone('America/Bogota');
        const { container } = render(<Harness initialCountry={undefined} />);

        expect(checkedValue(container)).toBe('CO');
    });

    it('el usuario YA eligió un país distinto de DO ⇒ el efecto JAMÁS lo pisa, sin importar la zona', () => {
        mockTimeZone('Europe/Madrid'); // detectaría ES si corriera
        const onUpdate = vi.fn();
        const { container } = render(<Harness initialCountry="MX" onUpdate={onUpdate} />);

        expect(onUpdate).not.toHaveBeenCalled();
        expect(checkedValue(container)).toBe('MX');
    });

    it('el usuario ya había elegido DO EXPLÍCITAMENTE (indistinguible del default sembrado) ⇒ la preselección puede re-sugerir la zona — ambigüedad aceptada por el Addendum ("simplest honest approach")', () => {
        // Este test documenta la limitación aceptada a propósito (no un bug): con
        // el estado hoy disponible (formData.country === 'DO'), un pick explícito
        // de DO es indistinguible de "nunca tocó el campo". El efecto corre UNA
        // sola vez al montar, así que en la práctica esto solo puede ocurrir si el
        // componente se REMONTA después de ese pick explícito (navegar atrás y
        // adelante) — no en cada tecla/click dentro del mismo mount.
        mockTimeZone('America/Mexico_City');
        const { container } = render(<Harness initialCountry="DO" />);

        expect(checkedValue(container)).toBe('MX');
    });

    it('zona sin mapeo (Asia/Tokyo) + default sembrado ⇒ se queda en DO (countryFromTimeZone ya hace ese fail-safe)', () => {
        mockTimeZone('Asia/Tokyo');
        const onUpdate = vi.fn();
        const { container } = render(<Harness initialCountry={DEFAULT_COUNTRY} onUpdate={onUpdate} />);

        // countryFromTimeZone('Asia/Tokyo') === 'DO' === DEFAULT_COUNTRY: la
        // implementación puede optar por llamar updateData('country','DO') de
        // todos modos (idempotente) o por saltarlo — ambas son honestas. Lo único
        // que este test exige es el resultado final visible.
        expect(checkedValue(container)).toBe('DO');
    });

    it('corre EXACTAMENTE una vez al montar (no en cada re-render disparado por otros campos)', () => {
        const dtfSpy = mockTimeZone('Europe/Madrid');
        const { rerender, container } = render(<Harness initialCountry={DEFAULT_COUNTRY} />);
        expect(checkedValue(container)).toBe('ES');
        expect(dtfSpy).toHaveBeenCalledTimes(1);

        // Un segundo render del MISMO árbol (no un remount) no debe volver a
        // invocar Intl.DateTimeFormat — el efecto tiene deps [] a propósito.
        rerender(<Harness initialCountry={DEFAULT_COUNTRY} />);
        expect(dtfSpy).toHaveBeenCalledTimes(1);
    });

    it('el paso SIGUE visible tras la preselección: los 6 radios siguen montados y el usuario puede cambiar', () => {
        mockTimeZone('Europe/Madrid');
        const { container } = render(<Harness initialCountry={DEFAULT_COUNTRY} />);

        expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(COUNTRIES.length);
    });
});

// El caso COUNTRY_SYSTEM_UI=false (defensa en profundidad) vive en
// QCountry.p1_country_system_f2_dark.test.jsx, archivo separado: `vi.mock('../config/countries', …)`
// arriba es hoisted y cubre TODO este archivo — no puede convivir en el mismo archivo con el
// valor real (false) del build sin recurrir a vi.doUnmock/vi.resetModules a mitad de archivo.
