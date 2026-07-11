/* [P1-HERO-ORB-AUTOPLAY · 2026-07-11] El orbe-video del Hero quedaba CONGELADO
 * en móviles: Chrome Android bloquea el autoplay cuando `muted` existe solo como
 * propiedad (React nunca escribe el content attribute — bug conocido de React) y
 * el <video> montaba con autoPlay pero jamás arrancaba (reproducido con CDP:
 * paused=true/currentTime=0 bajo emulación móvil; en desktop sí reproducía).
 * Contrato del fix:
 *   1. El <video> montado lleva muted como ATTRIBUTE + defaultMuted (no solo prop).
 *   2. play() se invoca explícitamente al montar (no se confía en el atributo).
 *   3. Si play() es rechazado (Low Power Mode iOS, políticas), el orbe cae a un
 *      estado "vivo" (clase breath, animación CSS transform/opacity) y se
 *      reintenta play() en el primer gesto del usuario.
 *   4. En pantallas ≤767px se sirven los assets móviles orb-sm.* (640², ~2.25×
 *      menos costo de decode que el 1280×720 de desktop).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, act } from './utils/test-utils';
import Hero from '../components/home/Hero';
import * as heroCtaModule from '../context/HeroCtaContext';

// IntersectionObserver que dispara "intersecting" sincrónicamente al observe()
// → videoOn flip inmediato (el defer P2-HERO-VIDEO-DEFER queda cubierto).
class ImmediateIO {
    constructor(cb) { this.cb = cb; }
    observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
    disconnect() {}
    unobserve() {}
}

const renderHero = () => render(<Hero />, { customContext: { planData: null, session: null } });

// setupTests.js define window.matchMedia con matches:false; el test móvil lo
// reemplaza por asignación directa (no spy) → restaurar el default en cada test
// para que no se filtre al siguiente.
const defaultMatchMedia = (matchesQuery) => vi.fn().mockImplementation((query) => ({
    matches: matchesQuery ? query === matchesQuery : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));

describe('[P1-HERO-ORB-AUTOPLAY] resiliencia de autoplay del orbe en móviles', () => {
    let playMock;

    beforeEach(() => {
        window.matchMedia = defaultMatchMedia(null);
        vi.spyOn(heroCtaModule, 'useHeroCta').mockReturnValue({
            heroCtaVisible: true,
            setHeroCtaVisible: vi.fn(),
        });
        window.IntersectionObserver = ImmediateIO;
        playMock = vi.fn().mockResolvedValue(undefined);
        window.HTMLMediaElement.prototype.play = playMock;
        window.HTMLMediaElement.prototype.pause = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete window.IntersectionObserver;
    });

    it('el <video> monta con muted como content attribute + defaultMuted', async () => {
        const { container } = renderHero();
        const video = await waitFor(() => {
            const v = container.querySelector('video');
            expect(v).toBeTruthy();
            return v;
        });
        // El atributo (no solo la propiedad) es lo que la política de autoplay
        // de Chrome Android evalúa — React NO lo escribe por sí solo.
        expect(video.hasAttribute('muted')).toBe(true);
        expect(video.defaultMuted).toBe(true);
        expect(video.muted).toBe(true);
    });

    it('invoca play() explícitamente al montar el video (no confía en autoPlay)', async () => {
        renderHero();
        await waitFor(() => expect(playMock).toHaveBeenCalled());
    });

    it('play() rechazado → orbe cae a estado breath (vivo) y reintenta en el primer gesto', async () => {
        let rejectFirst = true;
        playMock.mockImplementation(function playImpl() {
            if (rejectFirst) {
                rejectFirst = false;
                return Promise.reject(new DOMException('denied', 'NotAllowedError'));
            }
            return Promise.resolve(undefined);
        });
        const { container } = renderHero();
        const video = await waitFor(() => {
            const v = container.querySelector('video');
            expect(v).toBeTruthy();
            return v;
        });
        // Rechazo procesado → clase breath presente (fallback "vivo", no congelado).
        await waitFor(() => expect(video.className).toMatch(/orbBreath/));
        const callsBefore = playMock.mock.calls.length;
        // Primer gesto del usuario → retry de play() (cubre iOS Low Power Mode).
        await act(async () => {
            fireEvent.pointerDown(window);
        });
        await waitFor(() => expect(playMock.mock.calls.length).toBeGreaterThan(callsBefore));
        // Retry exitoso → el breath se retira (el video ya corre).
        await waitFor(() => expect(video.className).not.toMatch(/orbBreath/));
    });

    it('AbortError (pause propio interrumpe play pendiente) NO degrada a breath', async () => {
        // En móvil el orbe monta bajo el fold: el observer de visibilidad lo
        // pausa y el play() pendiente rechaza con AbortError. Eso NO es un veto
        // de autoplay — el orbe no debe caer al fallback breath.
        playMock.mockRejectedValue(new DOMException('interrupted', 'AbortError'));
        const { container } = renderHero();
        const video = await waitFor(() => {
            const v = container.querySelector('video');
            expect(v).toBeTruthy();
            return v;
        });
        await waitFor(() => expect(playMock).toHaveBeenCalled());
        // Dar un tick para que el catch procese; la clase breath NUNCA aparece.
        await act(async () => { await Promise.resolve(); });
        expect(video.className).not.toMatch(/orbBreath/);
    });

    it('en ≤767px sirve los assets móviles orb-sm.* (webm y mp4)', async () => {
        window.matchMedia = defaultMatchMedia('(max-width: 767px)');
        const { container } = renderHero();
        const sources = await waitFor(() => {
            const list = container.querySelectorAll('video source');
            expect(list.length).toBe(2);
            return list;
        });
        expect(sources[0].getAttribute('src')).toBe('/orb-sm.webm');
        expect(sources[1].getAttribute('src')).toBe('/orb-sm.mp4');
    });

    it('en desktop (>767px) mantiene los assets originales orb.*', async () => {
        const { container } = renderHero();
        const sources = await waitFor(() => {
            const list = container.querySelectorAll('video source');
            expect(list.length).toBe(2);
            return list;
        });
        expect(sources[0].getAttribute('src')).toBe('/orb.webm');
        expect(sources[1].getAttribute('src')).toBe('/orb.mp4');
    });
});
