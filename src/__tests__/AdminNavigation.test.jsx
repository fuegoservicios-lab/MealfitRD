import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdminNavigationProvider, useAdminNavigationState, useClearAdminNavigationPrefix } from '../hooks/useAdminNavigation';

function Navigation() {
    const [page, setPage] = useAdminNavigationState('page', 1, (v) => Number.isInteger(v) && v > 0);
    const clear = useClearAdminNavigationPrefix();
    return (
        <>
            <button onClick={() => { setPage((v) => v + 1); setPage((v) => v + 1); }}>{page}</button>
            <button type="button" onClick={() => clear('prueba:u1:')}>Limpiar</button>
        </>
    );
}
const mount = () => render(<AdminNavigationProvider><Navigation /></AdminNavigationProvider>);

describe('admin navigation across remounts', () => {
    beforeEach(() => { sessionStorage.clear(); localStorage.setItem('mealfit_user_id', 'admin-A'); });
    afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });
    it('saves the last navigation immediately and restores it without caching responses', () => {
        const first = mount();
        fireEvent.click(screen.getByRole('button', { name: '1' }));
        expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
        first.unmount();
        mount();
        expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
    });
    it('does not restore another administrator’s navigation', () => {
        const first = mount();
        fireEvent.click(screen.getByRole('button', { name: '1' }));
        first.unmount();
        localStorage.setItem('mealfit_user_id', 'admin-B');
        mount();
        expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    });
    it.each(['{invalid', '-5', '"3"', 'null'])('ignores invalid saved navigation: %s', (value) => {
        sessionStorage.setItem('mf:admin-navigation:v1:admin-A:page', value);
        mount();
        expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    });
    it('clears persisted keys matching a prefix while keeping unrelated keys', () => {
        sessionStorage.setItem('mf:admin-navigation:v1:admin-A:prueba:u1:pestana', '"conversaciones"');
        sessionStorage.setItem('mf:admin-navigation:v1:admin-A:prueba:u1:diasComidas', '30');
        sessionStorage.setItem('mf:admin-navigation:v1:admin-A:page', '2');
        mount();
        fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
        expect(sessionStorage.getItem('mf:admin-navigation:v1:admin-A:prueba:u1:pestana')).toBeNull();
        expect(sessionStorage.getItem('mf:admin-navigation:v1:admin-A:prueba:u1:diasComidas')).toBeNull();
        expect(sessionStorage.getItem('mf:admin-navigation:v1:admin-A:page')).toBe('2');
    });
});
