/**
 * [P2-SCAN-NO-WEBCAM-ON-DESKTOP · 2026-07-30] "Tomar foto" solo donde tomar una foto es el gesto
 * natural.
 *
 * Reporte del owner (escritorio, app.mealfitrd.com/dashboard): el modal "Escanear comida" ofrecía
 * "Tomar foto — Usa la cámara de tu dispositivo" **en la tarjeta primaria**, la recomendada. En un
 * PC eso abre la WEBCAM, y apuntar un portátil al plato no es algo que la gente haga: la acción rara
 * se llevaba el sitio de honor y la útil ("Elegir de galería") quedaba de segunda.
 *
 * La detección es `(pointer: coarse)`, NO sniffing de user-agent: describe el dispositivo de
 * entrada, que es exactamente lo que decide si "hacer una foto" tiene sentido. Un portátil con
 * pantalla táctil sigue reportando el ratón como puntero PRIMARIO ⇒ escritorio; una tablet en modo
 * táctil reporta coarse y conserva la cámara. Se reusa el hook SSOT `useMediaQuery` (P2-14), el
 * mismo que `PantryScanButton` ya usa para decidir su visor en vivo — la Nevera YA resolvía esto
 * bien ("Sube una foto de tu nevera" en PC), y por eso el de comida destacaba.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import ScanMealModal from '../components/dashboard/ScanMealModal';

// Mismo patrón que PantryScanButton.p1_pantry_camera_scan.test.jsx / Hero.p1_orb_autoplay_mobile:
// asignación directa de window.matchMedia para variar el puntero primario.
const matchMediaWith = (coarse) => vi.fn().mockImplementation((query) => ({
    matches: query === '(pointer: coarse)' ? coarse : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));

const renderModal = () => render(
    <ScanMealModal isOpen onClose={vi.fn()} userId="u-1" />
);

describe('[P2-SCAN-NO-WEBCAM-ON-DESKTOP] ScanMealModal — la cámara solo en táctil', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('en ESCRITORIO (puntero fino)', () => {
        beforeEach(() => { window.matchMedia = matchMediaWith(false); });

        it('NO ofrece "Tomar foto"', () => {
            renderModal();
            expect(screen.queryByText('Tomar foto')).not.toBeInTheDocument();
            expect(screen.queryByText('Usa la cámara de tu dispositivo')).not.toBeInTheDocument();
        });

        it('sí ofrece "Elegir de galería", con copy de computadora', () => {
            renderModal();
            expect(screen.getByText('Elegir de galería')).toBeInTheDocument();
            expect(screen.getByText('Sube una foto desde tu computadora')).toBeInTheDocument();
        });

        it('no deja ningún input con `capture` en el DOM', () => {
            const { container } = renderModal();
            expect(container.querySelector('input[capture]')).toBeNull();
        });

        it('el texto de ayuda dice SUBE, no TOMA', () => {
            renderModal();
            expect(screen.getByText(/Sube una foto de tu plato/)).toBeInTheDocument();
            expect(screen.queryByText(/Toma una foto de tu plato/)).not.toBeInTheDocument();
        });

        it('la única opción NO puede verse como la secundaria', () => {
            // La tarjeta primaria era la de la cámara; al quitarla, la galería hereda ese tile o la
            // pantalla queda con su única acción en gris.
            const { container } = renderModal();
            const primarios = container.querySelectorAll('[class*="optionIcoPrimary"]');
            expect(primarios.length).toBe(1);
        });
    });

    describe('en MÓVIL / tablet (puntero coarse)', () => {
        beforeEach(() => { window.matchMedia = matchMediaWith(true); });

        it('mantiene las DOS opciones — en móvil la cámara es el camino principal', () => {
            renderModal();
            expect(screen.getByText('Tomar foto')).toBeInTheDocument();
            expect(screen.getByText('Elegir de galería')).toBeInTheDocument();
        });

        it('conserva el input con `capture="environment"`', () => {
            const { container } = renderModal();
            const cam = container.querySelector('input[capture]');
            expect(cam).not.toBeNull();
            expect(cam.getAttribute('capture')).toBe('environment');
        });

        it('la cámara sigue siendo la tarjeta primaria', () => {
            const { container } = renderModal();
            const primarios = container.querySelectorAll('[class*="optionIcoPrimary"]');
            expect(primarios.length).toBe(1);
        });

        it('el texto de ayuda dice TOMA', () => {
            renderModal();
            expect(screen.getByText(/Toma una foto de tu plato/)).toBeInTheDocument();
        });
    });

    it('sin matchMedia (SSR/entorno raro) degrada a escritorio sin romper', () => {
        // `useMediaQuery` devuelve false sin `window.matchMedia` (SSR-safe por diseño del hook).
        // El peor caso es perder la cámara, no una pantalla en blanco — y en cualquier navegador
        // móvil real `matchMedia` existe siempre, así que no es un caso alcanzable en producto.
        const prev = window.matchMedia;
        delete window.matchMedia;
        try {
            renderModal();
            expect(screen.getByText('Elegir de galería')).toBeInTheDocument();
        } finally {
            window.matchMedia = prev;
        }
    });
});
