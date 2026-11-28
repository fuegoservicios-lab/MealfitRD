// [P1-PUNTOS-PLEGABLES · 2026-11-27] «Cómo sumar puntos hoy» se pliega: cerrado en el teléfono (la tarjeta subió bajo el
// contador), abierto en PC, y la elección del usuario se recuerda.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PuntosDeHoy from '../components/dashboard/PuntosDeHoy';

const LOGROS = { registro: true, completo: false, banda: true, proteina: false, proteina_parcial: false, agua: null, dia_perfecto: false };
const pintar = () => render(<PuntosDeHoy puntos={18} mult={1.6} racha={38} logros={LOGROS} onAbrir={vi.fn()} />);
const lista = () => document.getElementById('logros-de-hoy');
const pliegue = () => screen.getByRole('button', { name: /Cómo sumar puntos hoy/ });

function simularTelefono(esTelefono) {
    window.matchMedia = vi.fn().mockImplementation((q) => ({
        matches: esTelefono && q.includes('max-width'),
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
    }));
}

describe('PuntosDeHoy: logros plegables', () => {
    const original = window.matchMedia;
    beforeEach(() => { localStorage.clear(); });
    afterEach(() => { window.matchMedia = original; });

    it('en el teléfono arranca plegado, con el resumen «n de total», y se abre al tocar el título', () => {
        simularTelefono(true);
        pintar();
        expect(pliegue()).toHaveAttribute('aria-expanded', 'false');
        expect(lista()).not.toBeVisible();
        expect(screen.getByText('1 de 3 logrados')).toBeInTheDocument();   // pilas principales: calorías ✓, proteína y día completo pendientes
        fireEvent.click(pliegue());
        expect(pliegue()).toHaveAttribute('aria-expanded', 'true');
        expect(lista()).toBeVisible();
        expect(localStorage.getItem('bioboros_puntos_logros_abiertos')).toBe('1');
    });

    it('en PC arranca abierto, y lo que el usuario eligió manda sobre el ancho', () => {
        simularTelefono(false);
        const { unmount } = pintar();
        expect(pliegue()).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(pliegue());
        unmount();
        pintar();
        expect(pliegue()).toHaveAttribute('aria-expanded', 'false');
    });
});
