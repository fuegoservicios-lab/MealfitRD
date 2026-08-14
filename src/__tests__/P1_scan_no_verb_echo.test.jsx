/**
 * [P1-SCAN-NO-VERB-ECHO · 2026-08-10] «No quiero que diga escanear dos veces».
 *
 * EL DEFECTO. El modal se titulaba «Escanear comida» y su primera opción decía
 * «Escanear mi plato». En el escritorio pasa medio desapercibido porque cada fila lleva
 * además un sublabel que la distingue — pero a ≤480px ese sublabel está oculto
 * (`.optionSub { display: none }` en ScanMealModal.module.css), así que en el teléfono
 * el rótulo es LO ÚNICO escrito en la fila, y la palabra del título aparecía dos veces
 * en una pantalla con tres frases.
 *
 * POR QUÉ CAMBIA EL RÓTULO Y NO EL TÍTULO: el título espeja el botón que abrió el modal
 * («Escanear comida» en TrackingProgress). Esa correspondencia es la que le dice al
 * usuario dónde aterrizó; romperla para ahorrar una palabra sería mal negocio. El
 * título aporta el verbo una vez, y a las filas solo les toca decir en qué se
 * diferencian: de dónde sale la foto.
 *
 * Este guard NO fija la copia — fija la RELACIÓN: ningún rótulo de opción repite el
 * verbo del título, sea cual sea ese verbo mañana. La raíz se DERIVA del título en
 * tiempo de test, así que renombrar el modal no lo deja obsoleto ni lo hace mentir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import ScanMealModal from '../components/dashboard/ScanMealModal';

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

// Rango de diacríticos combinantes por escape, NO como caracteres literales: pegados en
// crudo sobreviven mal a cualquier reencoding del archivo.
const sinAcentos = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Raíz del verbo del título: «Escanear comida» → «escane». Se queda con las letras
 *  comunes a toda la familia (escanear/escáner/escaneo), que es lo que hace visible la
 *  repetición a ojo. */
const raizDelVerbo = (titulo) => sinAcentos(titulo.trim().split(/\s+/)[0]).slice(0, 6);

describe('[P1-SCAN-NO-VERB-ECHO] el rótulo de una opción no repite el verbo del título', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.matchMedia = matchMediaWith(true); // táctil: es donde se ven las dos filas
    });

    const montar = () => render(<ScanMealModal isOpen onClose={vi.fn()} userId="u-1" />);

    it('el título sigue existiendo y aporta el verbo', () => {
        const { container } = montar();
        const titulo = container.querySelector('#scan-meal-title');
        expect(titulo, 'desapareció el título del modal de escaneo').not.toBeNull();
        expect(raizDelVerbo(titulo.textContent).length).toBe(6);
    });

    it('ningún rótulo de opción repite esa raíz', () => {
        const { container } = montar();
        const raiz = raizDelVerbo(container.querySelector('#scan-meal-title').textContent);
        const rotulos = [...container.querySelectorAll('[class*="optionLabel"]')]
            .map((n) => n.textContent.trim());

        expect(rotulos.length, 'no se renderizó ninguna tarjeta de opción').toBeGreaterThan(1);
        const repetidos = rotulos.filter((r) => sinAcentos(r).includes(raiz));
        expect(repetidos, `estos rótulos repiten el verbo del título («${raiz}…»): ${repetidos.join(' / ')}`)
            .toEqual([]);
    });

    it('las dos filas siguen diciendo en qué se diferencian: la fuente de la foto', () => {
        const { container } = montar();
        const rotulos = [...container.querySelectorAll('[class*="optionLabel"]')]
            .map((n) => sinAcentos(n.textContent));
        expect(rotulos.some((r) => r.includes('camara'))).toBe(true);
        expect(rotulos.some((r) => r.includes('galeria'))).toBe(true);
    });

    it('el sublabel tampoco vuelve a decirlo (donde sí se ve, no debe sonar a eco)', () => {
        const { container } = montar();
        const raiz = raizDelVerbo(container.querySelector('#scan-meal-title').textContent);
        const subs = [...container.querySelectorAll('[class*="optionSub"]')]
            .map((n) => n.textContent.trim());
        const repetidos = subs.filter((s) => sinAcentos(s).includes(raiz));
        expect(repetidos, `sublabels que repiten el verbo del título: ${repetidos.join(' / ')}`)
            .toEqual([]);
    });
});
