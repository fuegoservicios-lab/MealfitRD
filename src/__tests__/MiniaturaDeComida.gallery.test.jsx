import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MiniaturaDeComida from '../components/dashboard/MiniaturaDeComida';
import { useFotosDeComida } from '../hooks/useFotosDeComidas';

vi.mock('../hooks/useFotosDeComidas', () => ({ useFotosDeComida: vi.fn() }));
beforeEach(() => { vi.mocked(useFotosDeComida).mockReturnValue([]); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const renderThumbnail = () => render(<MiniaturaDeComida userId="u1" mealId="meal1" className="mealThumb" />);

describe('miniatura de una comida con galería', () => {
    it('no muestra un contador mientras no hay fotos', () => {
        const { container } = renderThumbnail();
        expect(container).toBeEmptyDOMElement();
    });

    it('una foto sigue siendo una miniatura simple', () => {
        vi.mocked(useFotosDeComida).mockReturnValue([{ url: 'blob:one' }]);
        const { container } = renderThumbnail();
        expect(container.querySelector('img')).toHaveAttribute('src', 'blob:one');
        expect(container.querySelectorAll('img')).toHaveLength(1);
        expect(screen.queryByText('1')).not.toBeInTheDocument();
        expect(useFotosDeComida).toHaveBeenCalledWith('u1', 'meal1', 'mini');
    });

    it.each([2, 4])('muestra una pila y el número real de %i fotos', count => {
        vi.mocked(useFotosDeComida).mockReturnValue(Array.from({ length: count }, (_, i) => ({ url: `blob:${i}` })));
        const { container } = renderThumbnail();
        expect(screen.getByRole('img', { name: `${count} fotos` })).toBeInTheDocument();
        expect(screen.getByText(String(count))).toBeInTheDocument();
        expect(container.querySelectorAll('img')).toHaveLength(2);
        expect(container.querySelector('img[src="blob:0"]')).toBeInTheDocument();
        expect(container.querySelector('img[src="blob:1"]')).toBeInTheDocument();
    });

    it('el contador desaparece cuando la galería vuelve a una sola foto', () => {
        vi.mocked(useFotosDeComida).mockReturnValue([{ url: 'blob:0' }, { url: 'blob:1' }]);
        const { rerender } = renderThumbnail();
        expect(screen.getByText('2')).toBeInTheDocument();
        vi.mocked(useFotosDeComida).mockReturnValue([{ url: 'blob:0' }]);
        rerender(<MiniaturaDeComida userId="u1" mealId="meal1" />);
        expect(screen.queryByText('2')).not.toBeInTheDocument();
    });
});
