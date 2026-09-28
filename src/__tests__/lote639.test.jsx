// frontend/src/__tests__/lote639.test.jsx
// [P1-PLAN-LOTE-639 · 2026-09-28] La pestaña de /admin decía «Página no encontrada · Bioboros»: la ruta existe en
// App.jsx pero no estaba en ninguna lista de RouteTitle, que la trataba como un 404 (título, noindex y sin canonical).
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RouteTitle from '../components/layout/RouteTitle';

const enRuta = (ruta) => render(<MemoryRouter initialEntries={[ruta]}><RouteTitle /></MemoryRouter>);
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';

beforeEach(() => {
    cleanup();
    document.head.innerHTML = '';
    document.title = '';
});

describe('[639] la pestaña de /admin', () => {
    it('se llama como el panel, no «Página no encontrada»', () => {
        enRuta('/admin');
        expect(document.title).toBe('Panel de administración · Bioboros');
        expect(document.title).not.toContain('no encontrada');
    });

    it('sigue sin indexarse ni declararse canónica', () => {
        enRuta('/admin');
        expect(robots()).toContain('noindex');
        expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    });

    it('con barra final también', () => {
        enRuta('/admin/');
        expect(document.title).toBe('Panel de administración · Bioboros');
    });

    it('una ruta de verdad inexistente sigue siendo «no encontrada»', () => {
        enRuta('/admin2');
        expect(document.title).toContain('no encontrada');
    });
});
