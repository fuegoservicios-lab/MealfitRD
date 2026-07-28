// [P1-PANTRY-SCAN-PC-UPLOAD · 2026-07-28] Corrige P1-PANTRY-SCAN-MOBILE-ONLY
// (2026-07-28, mismo día): esa primera lectura del feedback del owner ("para
// PC, lo de escanear no tiene sentido, solo déjalo para móviles") ocultó la
// tarjeta ENTERA fuera de móvil. Lectura correcta: lo que no tiene sentido en
// desktop es el VISOR EN VIVO (nadie carga una nevera hasta el escritorio) —
// subir una foto SÍ tiene sentido ahí y debe seguir disponible.
//
// Contrato actual (`components/pantry/PantryScanButton.jsx`):
//   - La tarjeta es visible en TODO dispositivo — el único gate de
//     visibilidad es el flag backend `enabled` (photo_scan_enabled).
//   - La capacidad de dispositivo (puntero coarse + API de cámara real) ya
//     NO oculta nada: selecciona qué abre el tap.
//       · puntero coarse + getUserMedia → visor en vivo (comportamiento
//         idéntico a antes del gate mobile-only).
//       · cualquier otro caso (desktop, tablet sin cámara, matchMedia
//         ausente) → el <input type="file"> directo, SIN abrir el visor ni
//         pedir permiso de cámara.
//   - El copy de la tarjeta (y su ícono) reflejan el modo: "Escanear..." +
//     ícono de cámara para el visor; "Sube una foto..." + ícono de subida
//     para el archivo directo. El subtítulo NO cambia — describe lo que la
//     IA hace con la foto, verdad en ambos modos.
//
// Este archivo reemplaza (mismo alcance, contrato invertido) a
// PantryScanButton.p1_pantry_scan_mobile_only.test.jsx, que aserteba
// `container.toBeEmptyDOMElement()` en desktop — exactamente lo opuesto de
// lo correcto. Sigue siendo un archivo separado (sibling) de
// PantryScanButton.p1_pantry_camera_scan.test.jsx a propósito: ese archivo
// cubre el flujo de cámara en vivo completo una vez abierto (~300 líneas) y
// fija `(pointer: coarse)` a `true` por default porque asume contexto móvil
// siempre — no es el lugar para variar pointer/cámara ni copy. Este archivo
// es exclusivamente sobre la SELECCIÓN de modo: qué ve el usuario y qué
// dispara el tap según el dispositivo.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import { PantryScanButton } from '../components/pantry/PantryScanButton';

// Construye un matchMedia mock donde `matchesFn(query)` decide `matches` por
// query — necesitamos variar `(pointer: coarse)` caso por caso.
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

describe('[P1-PANTRY-SCAN-PC-UPLOAD] PantryScanButton — la tarjeta SIEMPRE renderiza; el dispositivo selecciona el modo', () => {
    let originalMatchMedia;

    beforeEach(() => {
        vi.clearAllMocks();
        originalMatchMedia = window.matchMedia;
    });

    it('puntero coarse + getUserMedia presente → copy de ESCANEAR, y el tap abre el visor en vivo (getUserMedia)', async () => {
        setMatchMedia((q) => q === '(pointer: coarse)');
        const getUserMediaMock = setCameraApi(true);
        getUserMediaMock.mockReturnValue(new Promise(() => { /* nunca resuelve — no hace falta para este test */ }));

        renderButton();

        const btn = screen.getByRole('button', { name: /Escanear mi nevera con una foto/ });
        // El subtítulo describe lo que hace la IA — igual en ambos modos.
        expect(screen.getByText('Detecta alimentos, cantidades y marcas automáticamente')).toBeInTheDocument();
        expect(screen.getByText('beta')).toBeInTheDocument();

        await userEvent.click(btn);

        expect(getUserMediaMock).toHaveBeenCalledTimes(1);
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('puntero fino (desktop) + getUserMedia presente → copy de SUBIR FOTO, y el tap abre el <input type="file"> SIN llamar getUserMedia', async () => {
        // Ninguna query matchea — simula mouse/trackpad (fine pointer). La API
        // de cámara SÍ existe (a propósito): el modo lo decide el puntero, no
        // solo la disponibilidad de la API.
        setMatchMedia(() => false);
        const getUserMediaMock = setCameraApi(true);

        const { container } = renderButton();

        const btn = screen.getByRole('button', { name: /Sube una foto de tu nevera/ });
        expect(screen.getByText('Detecta alimentos, cantidades y marcas automáticamente')).toBeInTheDocument();
        expect(screen.getByText('beta')).toBeInTheDocument();

        const fileInput = container.querySelector('input[type="file"]');
        const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});

        await userEvent.click(btn);

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(getUserMediaMock).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(container.querySelector('video')).not.toBeInTheDocument();
    });

    it('puntero coarse + SIN getUserMedia (tablet sin cámara) → también copy de SUBIR FOTO, el tap abre el archivo directo', async () => {
        setMatchMedia((q) => q === '(pointer: coarse)');
        setCameraApi(false);

        const { container } = renderButton();

        const btn = screen.getByRole('button', { name: /Sube una foto de tu nevera/ });
        const fileInput = container.querySelector('input[type="file"]');
        const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});

        await userEvent.click(btn);

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('matchMedia indisponible (SSR/entorno raro) → falla hacia el modo MÁS SIMPLE (subir foto), NUNCA hacia ocultar la tarjeta', () => {
        // Antes de P1-PANTRY-SCAN-PC-UPLOAD, `useMediaQuery` degradando a
        // `false` sin `matchMedia` empujaba al gate de VISIBILIDAD (oculto).
        // Ahora empuja al gate de MODO (upload) — la tarjeta sigue presente.
        window.matchMedia = undefined;
        setCameraApi(true);

        renderButton();

        expect(screen.getByRole('button', { name: /Sube una foto de tu nevera/ })).toBeInTheDocument();

        window.matchMedia = originalMatchMedia;
    });

    describe('`enabled=false` (flag backend `photo_scan_enabled` apagado) → NADA renderiza, en NINGÚN dispositivo', () => {
        it('puntero coarse + cámara disponible', () => {
            setMatchMedia((q) => q === '(pointer: coarse)');
            setCameraApi(true);

            const { container } = renderButton({ enabled: false });

            expect(screen.queryByRole('button')).not.toBeInTheDocument();
            expect(container).toBeEmptyDOMElement();
        });

        it('puntero fino (desktop)', () => {
            setMatchMedia(() => false);
            setCameraApi(true);

            const { container } = renderButton({ enabled: false });

            expect(screen.queryByRole('button')).not.toBeInTheDocument();
            expect(container).toBeEmptyDOMElement();
        });
    });

    // [P1-PANTRY-SCAN-MOBILE-ONLY · closure follow-up, sigue vigente tras
    // P1-PANTRY-SCAN-PC-UPLOAD] `Pantry.jsx` solía envolver <PantryScanButton>
    // en su propio <div style={{margin}}>. El wrapper quedaba vacío-pero-
    // presente (hueco fantasma) cuando el componente ocultaba la tarjeta sin
    // que Pantry.jsx lo supiera. El único caso que sigue apagando la tarjeta
    // (`enabled=false`) mantiene el mismo riesgo — por eso el mecanismo
    // (margen viaja como prop `style`, mergeado en la MISMA raíz que colapsa
    // a null) sigue siendo necesario y se ancla acá independientemente del
    // modo elegido por capacidad de dispositivo.
    describe('prop `style` — mecanismo que reemplaza el <div> wrapper externo', () => {
        it('con `style`, el margen se aplica sobre la MISMA raíz — cero nodos extra (modo visor)', () => {
            setMatchMedia((q) => q === '(pointer: coarse)');
            setCameraApi(true);

            const { container } = renderButton({ style: { marginTop: '0.6rem' } });

            // Un solo hijo top-level: si hubiera un wrapper extra, container
            // tendría 2 niveles (wrapper > raíz del componente) en vez de 1.
            expect(container.children).toHaveLength(1);
            expect(container.firstChild.style.marginTop).toBe('0.6rem');
        });

        it('con `style`, el margen se aplica sobre la MISMA raíz — cero nodos extra (modo subir foto)', () => {
            setMatchMedia(() => false);
            setCameraApi(true);

            const { container } = renderButton({ style: { margin: '0.75rem 0' } });

            expect(container.children).toHaveLength(1);
            // jsdom normaliza el shorthand `0` → `0px` al parsear el style.
            expect(container.firstChild.style.margin).toBe('0.75rem 0px');
        });

        it('sin `style` (uso del wizard, QPantryBuilder), la raíz no lleva margen extra', () => {
            setMatchMedia((q) => q === '(pointer: coarse)');
            setCameraApi(true);

            const { container } = renderButton();

            expect(container.firstChild.style.marginTop).toBe('');
        });

        it('con `enabled=false`, cero DOM incluso pasando `style` — el gate de backend sigue colapsando a null (cero hueco fantasma)', () => {
            setMatchMedia(() => false);
            setCameraApi(true);

            const { container } = renderButton({ enabled: false, style: { margin: '0.75rem 0' } });

            expect(container).toBeEmptyDOMElement();
        });
    });
});
