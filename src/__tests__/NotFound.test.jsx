/**
 * [P3-10 · routing] 404 real + registry de prefetch consistente.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from '../pages/NotFound';
import fs from 'fs';
import path from 'path';

describe('NotFound (P3-10)', () => {
    it('renderiza el 404 con navegación de escape (inicio + panel)', () => {
        render(<MemoryRouter><NotFound /></MemoryRouter>);
        expect(screen.getByRole('heading', { name: /esta página no existe/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /ir al inicio/i })).toHaveAttribute('href', '/');
        expect(screen.getByRole('link', { name: /ir a mi panel/i })).toHaveAttribute('href', '/dashboard');
    });

    it('App.jsx usa NotFound en el wildcard (no Navigate a "/")', () => {
        const src = fs.readFileSync(path.join(__dirname, '../App.jsx'), 'utf-8');
        const wildcard = src.match(/path="\*"[\s\S]{0,120}/)?.[0] ?? '';
        expect(wildcard).toMatch(/NotFound/);
        expect(wildcard).not.toMatch(/Navigate to="\//);
    });

    it('routePreload registra /dashboard/upgrade (prefetch que era no-op muerto)', () => {
        const src = fs.readFileSync(path.join(__dirname, '../utils/routePreload.js'), 'utf-8');
        expect(src).toMatch(/'\/dashboard\/upgrade':\s*\(\)\s*=>\s*import\('\.\.\/pages\/Upgrade'\)/);
    });
});
