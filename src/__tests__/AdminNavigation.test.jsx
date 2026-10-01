import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdminNavigationProvider, useAdminNavigationState } from '../hooks/useAdminNavigation';

function Navigation() {
    const [page, setPage] = useAdminNavigationState('page', 1, (v) => Number.isInteger(v) && v > 0);
    return <button onClick={() => { setPage((v) => v + 1); setPage((v) => v + 1); }}>{page}</button>;
}
const mount = () => render(<AdminNavigationProvider><Navigation /></AdminNavigationProvider>);

describe('admin navigation across remounts', () => {
    beforeEach(() => { sessionStorage.clear(); localStorage.setItem('mealfit_user_id', 'admin-A'); });
    afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });
    it('saves the last navigation immediately and restores it without caching responses', () => {
        const first = mount();
        fireEvent.click(screen.getByRole('button'));
        expect(screen.getByRole('button')).toHaveTextContent('3');
        first.unmount();
        mount();
        expect(screen.getByRole('button')).toHaveTextContent('3');
    });
    it('does not restore another administrator’s navigation', () => {
        const first = mount();
        fireEvent.click(screen.getByRole('button'));
        first.unmount();
        localStorage.setItem('mealfit_user_id', 'admin-B');
        mount();
        expect(screen.getByRole('button')).toHaveTextContent('1');
    });
    it.each(['{invalid', '-5', '"3"', 'null'])('ignores invalid saved navigation: %s', (value) => {
        sessionStorage.setItem('mf:admin-navigation:v1:admin-A:page', value);
        mount();
        expect(screen.getByRole('button')).toHaveTextContent('1');
    });
});
