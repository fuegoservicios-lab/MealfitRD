/**
 * [P3-11 · skip-to-content] Sin un skip link, los usuarios de teclado tabulan por
 * TODA la navegación en cada ruta antes de llegar al contenido. Este componente es
 * el primer elemento focusable del app-shell: oculto hasta recibir foco, salta a
 * `#main-content` (el <main> de cada layout, tabIndex=-1 para recibir el foco).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SkipLink from '../components/common/SkipLink';

describe('SkipLink (P3-11)', () => {
    it('es un enlace con nombre accesible que apunta a #main-content', () => {
        render(<SkipLink />);
        const link = screen.getByRole('link', { name: /saltar al contenido/i });
        expect(link).toHaveAttribute('href', '#main-content');
    });
});
