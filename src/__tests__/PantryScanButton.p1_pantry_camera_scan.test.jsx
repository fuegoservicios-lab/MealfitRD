// [P1-PANTRY-CAMERA-SCAN · 2026-07-28] Visor de cámara en vivo del escáner de
// nevera (`components/pantry/PantryScanButton.jsx`). Cubre:
//   1. un tap en la tarjeta abre el visor DIRECTO y pide getUserMedia con
//      facingMode:'environment' (rear camera) — sin menú intermedio.
//   2. TODO track del stream se para en cada salida del lifecycle: cierre
//      explícito, unmount, y la carrera "visor cerrado antes de que resuelva
//      el permiso" — el bug clásico ("la luz de la cámara se queda prendida").
//   3. permiso denegado cae al <input type="file"> preexistente con el copy
//      exacto pedido, sin dejar al usuario en un callejón sin salida.
//   4. el <video> lleva muted/playsinline como CONTENT ATTRIBUTE + defaultMuted
//      (mismo fix que P1-HERO-ORB-AUTOPLAY-MOBILE, 2026-07-11, cuyo test se
//      borró con el vídeo del hero en P1-PAPER-HERO-FIG00 — la técnica de
//      aserción sobrevive aquí).
//   5. la captura dibuja el <video> en un <canvas> a sus dimensiones REALES,
//      la reescala con el MISMO `_downscaleToB64` que el <input type="file">
//      y llama el MISMO POST — cero drift de payload entre orígenes.
//   6. prefers-reduced-motion desactiva el barrido (retícula estática + pulso).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import { PantryScanButton } from '../components/pantry/PantryScanButton';
import { fetchWithAuth } from '../config/api';

// setupTests.js define window.matchMedia con matches:false; algunos tests lo
// reemplazan por asignación directa para simular prefers-reduced-motion true
// — el patrón venía de Hero.p1_orb_autoplay_mobile.test.jsx, borrado en
// P1-PAPER-HERO-FIG00 junto con el vídeo que probaba.
//
// [P1-PANTRY-SCAN-MOBILE-ONLY · 2026-07-28 · vigente tras P1-PANTRY-SCAN-PC-
// UPLOAD · 2026-07-28] Este archivo cubre el flujo de cámara EN VIVO, que
// solo se dispara con puntero coarse + API de cámara real (ver
// PantryScanButton.p1_pantry_scan_pc_upload.test.jsx para la selección de
// modo en sí — la tarjeta YA NO se oculta por dispositivo, solo elige entre
// visor en vivo y subir archivo directo). Por eso `(pointer: coarse)`
// matchea `true` por default acá — estos tests asumen contexto móvil
// siempre; NO son el lugar para variar pointer.
const defaultMatchMedia = (matchesQuery) => vi.fn().mockImplementation((query) => ({
    matches: query === '(pointer: coarse)' ? true : (matchesQuery ? query === matchesQuery : false),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));

const makeStream = (trackCount = 1) => {
    const tracks = Array.from({ length: trackCount }, () => ({ stop: vi.fn(), kind: 'video' }));
    return { getTracks: () => tracks, tracks };
};

const renderButton = (props = {}) => render(
    <PantryScanButton enabled inventory={[]} onInventoryChanged={vi.fn()} {...props} />
);

const openViewfinder = async () => {
    await userEvent.click(screen.getByRole('button', { name: /Escanear mi nevera con una foto/ }));
};

const waitForLive = async () => {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeEnabled());
};

describe('[P1-PANTRY-CAMERA-SCAN] PantryScanButton — visor de cámara en vivo', () => {
    let getUserMediaMock;
    let playMock;

    beforeEach(() => {
        vi.clearAllMocks();
        window.matchMedia = defaultMatchMedia(null);

        playMock = vi.fn().mockResolvedValue(undefined);
        window.HTMLMediaElement.prototype.play = playMock;

        getUserMediaMock = vi.fn();
        Object.defineProperty(window.navigator, 'mediaDevices', {
            value: { getUserMedia: getUserMediaMock },
            configurable: true,
            writable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('abre el visor DIRECTO al tocar la tarjeta y pide getUserMedia con facingMode environment (rear camera)', async () => {
        getUserMediaMock.mockResolvedValue(makeStream(0));
        renderButton();

        await openViewfinder();

        // Un solo tap → el visor, sin menú intermedio.
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await waitFor(() => expect(getUserMediaMock).toHaveBeenCalledTimes(1));
        expect(getUserMediaMock).toHaveBeenCalledWith({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
        });
    });

    describe('lifecycle de tracks del stream (la luz de la cámara NUNCA se queda prendida)', () => {
        it('para TODO track al cerrar el visor con el botón "Cerrar"', async () => {
            const stream = makeStream(2);
            getUserMediaMock.mockResolvedValue(stream);
            renderButton();

            await openViewfinder();
            await waitForLive();

            await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

            stream.tracks.forEach((t) => expect(t.stop).toHaveBeenCalledTimes(1));
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        });

        it('para TODO track al desmontar el componente con el visor abierto', async () => {
            const stream = makeStream(3);
            getUserMediaMock.mockResolvedValue(stream);
            const { unmount } = renderButton();

            await openViewfinder();
            await waitForLive();

            unmount();

            stream.tracks.forEach((t) => expect(t.stop).toHaveBeenCalledTimes(1));
        });

        it('para el stream si el visor se cierra ANTES de que resuelva el permiso (carrera)', async () => {
            const stream = makeStream(1);
            let resolveGetUserMedia;
            getUserMediaMock.mockReturnValue(new Promise((resolve) => { resolveGetUserMedia = resolve; }));
            renderButton();

            await openViewfinder();
            await waitFor(() => expect(getUserMediaMock).toHaveBeenCalledTimes(1));

            // Cierra YA, antes de que el browser resuelva el permiso.
            await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

            resolveGetUserMedia(stream);
            await waitFor(() => expect(stream.tracks[0].stop).toHaveBeenCalledTimes(1));
        });

        it('para TODO track al capturar (el feed en vivo se apaga antes de analizar)', async () => {
            const stream = makeStream(2);
            getUserMediaMock.mockResolvedValue(stream);
            fetchWithAuth.mockImplementation(() => new Promise(() => { /* nunca resuelve — no importa para este test */ }));

            const originalImage = global.Image;
            class FrozenImage {
                constructor() { this.width = 800; this.height = 600; }
                set src(_v) { /* nunca dispara onload — no llegamos a esa parte */ }
            }
            global.Image = FrozenImage;
            vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
            vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,X');
            vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb, type) => cb(new Blob(['x'], { type })));
            vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(800);
            vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(600);
            global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
            global.URL.revokeObjectURL = vi.fn();

            renderButton();
            await openViewfinder();
            await waitForLive();

            await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));

            await waitFor(() => stream.tracks.forEach((t) => expect(t.stop).toHaveBeenCalledTimes(1)));

            global.Image = originalImage;
        });
    });

    it('permiso denegado cae al <input type="file"> con el copy exacto — nunca deja al usuario en un callejón', async () => {
        getUserMediaMock.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
        const { container } = renderButton();

        await openViewfinder();

        await waitFor(() => expect(
            screen.getByText('No pudimos abrir la cámara. Puedes subir una foto en su lugar.')
        ).toBeInTheDocument());

        const fileInput = container.querySelector('input[type="file"]');
        const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});

        await userEvent.click(screen.getByRole('button', { name: 'Subir una foto en su lugar' }));

        expect(clickSpy).toHaveBeenCalledTimes(1);
        // Cae al flujo de siempre — el visor se cierra, no queda un modal muerto.
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('el <video> monta con muted/playsinline como CONTENT ATTRIBUTE + defaultMuted (P1-HERO-ORB-AUTOPLAY-MOBILE)', async () => {
        getUserMediaMock.mockResolvedValue(makeStream(1));
        const { container } = renderButton();

        await openViewfinder();

        const video = await waitFor(() => {
            const v = container.querySelector('video');
            expect(v).toBeTruthy();
            return v;
        });
        await waitFor(() => expect(playMock).toHaveBeenCalled());
        // El ATRIBUTO (no solo la propiedad) — React nunca lo escribe solo.
        await waitFor(() => expect(video.hasAttribute('muted')).toBe(true));
        expect(video.hasAttribute('playsinline')).toBe(true);
        expect(video.defaultMuted).toBe(true);
        expect(video.muted).toBe(true);
    });

    describe('pipeline de captura — mismo payload que el <input type="file">', () => {
        class FakeImage {
            constructor() { this.width = 1920; this.height = 1080; this._src = ''; }
            set src(v) { this._src = v; queueMicrotask(() => { if (this.onload) this.onload(); }); }
            get src() { return this._src; }
        }
        let originalImage;

        beforeEach(() => {
            originalImage = global.Image;
            global.Image = FakeImage;
            vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
            // Determinista: la salida codifica width/height del canvas que la produjo,
            // así el test puede leer directo qué dimensiones tenía el JPEG final.
            vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function toDataURL() {
                return `data:image/jpeg;base64,W${this.width}H${this.height}`;
            });
            vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(cb, type) {
                cb(new Blob(['fake-bytes'], { type: type || 'image/jpeg' }));
            });
            vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1920);
            vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(1080);
            global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
            global.URL.revokeObjectURL = vi.fn();
            fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
        });

        afterEach(() => {
            global.Image = originalImage;
        });

        it('la captura de cámara produce un JPEG ≤1024px y llama el MISMO POST que el flujo de archivo', async () => {
            getUserMediaMock.mockResolvedValue(makeStream(1));
            renderButton();

            await openViewfinder();
            await waitForLive();
            await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));

            await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledWith(
                '/api/inventory/photo-scan',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_b64: 'W1024H576' }),
                }),
            ));

            const [, opts] = fetchWithAuth.mock.calls[0];
            const { image_b64 } = JSON.parse(opts.body);
            const [, wStr, hStr] = image_b64.match(/^W(\d+)H(\d+)$/);
            expect(Number(wStr)).toBeLessThanOrEqual(1024);
            expect(Number(hStr)).toBeLessThanOrEqual(1024);
        });

        it('el <input type="file"> produce el payload IDÉNTICO para la misma imagen — prueba de equivalencia', async () => {
            getUserMediaMock.mockResolvedValue(makeStream(0));
            const { container } = renderButton();

            const fileInput = container.querySelector('input[type="file"]');
            const file = new File(['fake-bytes'], 'nevera.jpg', { type: 'image/jpeg' });
            fireEvent.change(fileInput, { target: { files: [file] } });

            await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledWith(
                '/api/inventory/photo-scan',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_b64: 'W1024H576' }),
                }),
            ));
        });
    });

    it('prefers-reduced-motion desactiva el barrido — retícula estática con pulso de opacidad', async () => {
        window.matchMedia = defaultMatchMedia('(prefers-reduced-motion: reduce)');
        getUserMediaMock.mockResolvedValue(makeStream(1));
        const { container } = renderButton();

        await openViewfinder();
        await waitForLive();

        expect(container.querySelector('.qpb-vf-sweep')).not.toBeInTheDocument();
        const corner = container.querySelector('.qpb-vf-corner');
        expect(corner).toBeTruthy();
        expect(corner.getAttribute('style')).toMatch(/qpb-pulse/);
    });

    it('sin reduced-motion SÍ renderiza el barrido en loop', async () => {
        getUserMediaMock.mockResolvedValue(makeStream(1));
        const { container } = renderButton();

        await openViewfinder();
        await waitForLive();

        const sweep = container.querySelector('.qpb-vf-sweep');
        expect(sweep).toBeTruthy();
        expect(sweep.getAttribute('style')).toMatch(/qpb-vf-sweep 1\.6s/);
    });
});
