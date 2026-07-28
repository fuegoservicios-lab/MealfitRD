// [P1-PANTRY-SCAN-MOBILE-ONLY · 2026-07-28] La entrada al escaneo de nevera
// (`components/pantry/PantryScanButton.jsx`) NO se renderiza fuera de móvil
// (feedback owner: "para PC, lo de escanear no tiene sentido, solo déjalo
// para móviles" — nadie carga una nevera hasta el escritorio, y desde que
// existe el visor en vivo tocar la tarjeta en desktop abre la webcam
// apuntando a la cara del usuario).
//
// Gate por CAPACIDAD, no por breakpoint de viewport:
//   - puntero primario coarse — matchMedia('(pointer: coarse)')
//   - Y una API de cámara real — navigator.mediaDevices?.getUserMedia
// Ambas TRUE → la tarjeta renderiza. Cualquier otro caso → NO renderiza NADA
// (el componente retorna null completo, sin wrapper vacío).
//
// Archivo separado (sibling) de PantryScanButton.p1_pantry_camera_scan.test.jsx
// a propósito: ese archivo ya cubre el flujo de cámara en vivo completo
// (~300 líneas) y fija `(pointer: coarse)` a `true` por default porque asume
// contexto móvil siempre — no es el lugar para variar pointer/cámara. Este
// archivo es exclusivamente sobre el gate: cuándo aparece la entrada, no qué
// hace una vez que aparece.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import { PantryScanButton } from '../components/pantry/PantryScanButton';

// Construye un matchMedia mock donde `matchesFn(query)` decide `matches` por
// query — más flexible que el helper single-query del archivo hermano porque
// acá SÍ necesitamos variar `(pointer: coarse)` caso por caso.
const setMatchMedia = (matchesFn) => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: matchesFn(query),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
};

// `undefined` simula un navigator.mediaDevices sin getUserMedia (API de
// cámara ausente) — no solo "sin permiso" sino sin la API en absoluto.
const setCameraApi = (present) => {
    const getUserMediaMock = present ? vi.fn() : undefined;
    Object.defineProperty(window.navigator, 'mediaDevices', {
        value: present ? { getUserMedia: getUserMediaMock } : undefined,
        configurable: true,
        writable: true,
    });
    return getUserMediaMock;
};

const renderButton = (props = {}) => render(
    <PantryScanButton enabled inventory={[]} onInventoryChanged={vi.fn()} {...props} />
);

describe('[P1-PANTRY-SCAN-MOBILE-ONLY] PantryScanButton — gate de capacidad (mobile-only)', () => {
    let originalMatchMedia;

    beforeEach(() => {
        vi.clearAllMocks();
        originalMatchMedia = window.matchMedia;
    });

    it('puntero coarse + getUserMedia presente → la tarjeta SÍ renderiza', () => {
        setMatchMedia((q) => q === '(pointer: coarse)');
        setCameraApi(true);

        renderButton();

        expect(screen.getByRole('button', { name: /Escanear mi nevera con una foto/ })).toBeInTheDocument();
    });

    it('puntero fino (desktop) + getUserMedia presente → la tarjeta NO renderiza', () => {
        // Ninguna query matchea — simula mouse/trackpad (fine pointer).
        setMatchMedia(() => false);
        setCameraApi(true);

        const { container } = renderButton();

        expect(screen.queryByRole('button', { name: /Escanear mi nevera con una foto/ })).not.toBeInTheDocument();
        // Cero DOM — el componente retorna null completo, no un wrapper vacío.
        expect(container).toBeEmptyDOMElement();
    });

    it('puntero coarse + SIN getUserMedia → la tarjeta NO renderiza (falta la API de cámara)', () => {
        setMatchMedia((q) => q === '(pointer: coarse)');
        setCameraApi(false);

        const { container } = renderButton();

        expect(screen.queryByRole('button', { name: /Escanear mi nevera con una foto/ })).not.toBeInTheDocument();
        expect(container).toBeEmptyDOMElement();
    });

    it('matchMedia indisponible (SSR/entorno raro) → falla-seguro: NO renderiza', () => {
        // `useMediaQuery` degrada a `false` cuando `window.matchMedia` no
        // existe — el gate hereda ese `false` sin caso especial. Preferimos
        // NO mostrar una affordance opcional antes que mostrar una rota.
        window.matchMedia = undefined;
        setCameraApi(true);

        const { container } = renderButton();

        expect(screen.queryByRole('button', { name: /Escanear mi nevera con una foto/ })).not.toBeInTheDocument();
        expect(container).toBeEmptyDOMElement();

        window.matchMedia = originalMatchMedia;
    });

    it('con la tarjeta oculta (desktop), NO se monta ni el visor ni la maquinaria de escaneo', () => {
        setMatchMedia(() => false);
        const getUserMediaMock = setCameraApi(true);

        const { container } = renderButton();

        // Sin tarjeta no hay tap posible → cero invocación de getUserMedia y
        // cero diálogo/visor en el árbol, aunque la API exista.
        expect(getUserMediaMock).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(container.querySelector('video')).not.toBeInTheDocument();
        expect(container).toBeEmptyDOMElement();
    });
});
