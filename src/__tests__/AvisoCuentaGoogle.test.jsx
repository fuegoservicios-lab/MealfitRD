// [P1-PLAN-LOTE-97 · 2026-09-18] El aviso «¿Es la cuenta que querías?»: se pinta cuando toca, «sí» recuerda la cuenta y
// «no» cierra la sesión sin recordarla.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const resetApp = vi.fn(async () => {});
const navigate = vi.fn();
let perfil = null;
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => ({ userProfile: perfil, loadingProfile: false, resetApp }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));

import AvisoCuentaGoogle from '../components/auth/AvisoCuentaGoogle';
import { recordarCuenta, marcarInicioGoogle, leerCuentas } from '../utils/cuentasDelDispositivo';

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

const escenarioDelIncidente = () => {
    localStorage.clear();
    recordarCuenta({ id: 'u-habitual', email: 'angelo@gmail.com' }, Date.now() - 86_400_000);
    marcarInicioGoogle(Date.now() - 30_000);
    perfil = { id: 'u-nueva', email: 'nuevo@gmail.com', created_at: new Date(Date.now() - 60_000).toISOString() };
};

describe('AvisoCuentaGoogle', () => {
    beforeEach(() => { cleanup(); resetApp.mockClear(); navigate.mockClear(); });

    it('pinta la pregunta con los dos correos enmascarados y dice que la cuenta es nueva', () => {
        escenarioDelIncidente();
        render(<MemoryRouter><AvisoCuentaGoogle /></MemoryRouter>);
        expect(screen.getByRole('dialog', { name: '¿Es la cuenta que querías?' })).toBeInTheDocument();
        expect(screen.getByText('nu***@gmail.com')).toBeInTheDocument();
        expect(screen.getByText('Cuenta nueva, creada por Google')).toBeInTheDocument();
        expect(screen.getByText(/Antes entrabas con an\*\*\*@gmail\.com/)).toBeInTheDocument();
    });

    it('«Sí, seguir con esta» recuerda la cuenta y cierra', () => {
        escenarioDelIncidente();
        render(<MemoryRouter><AvisoCuentaGoogle /></MemoryRouter>);
        fireEvent.click(screen.getByRole('button', { name: 'Sí, seguir con esta' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(leerCuentas().map((x) => x.id)).toContain('u-nueva');
        expect(resetApp).not.toHaveBeenCalled();
    });

    it('«No, salir» cierra la sesión, vuelve al login y NO recuerda la cuenta', async () => {
        escenarioDelIncidente();
        render(<MemoryRouter><AvisoCuentaGoogle /></MemoryRouter>);
        fireEvent.click(screen.getByRole('button', { name: 'No, salir' }));
        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login', { replace: true }));
        expect(resetApp).toHaveBeenCalledTimes(1);
        expect(leerCuentas().map((x) => x.id)).not.toContain('u-nueva');
    });

    it('sin acceso con Google no pinta nada', () => {
        localStorage.clear();
        recordarCuenta({ id: 'u-habitual', email: 'angelo@gmail.com' }, Date.now() - 86_400_000);
        perfil = { id: 'u-otra', email: 'otra@gmail.com', created_at: new Date().toISOString() };
        render(<MemoryRouter><AvisoCuentaGoogle /></MemoryRouter>);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('el login marca el inicio de Google y App monta el aviso perezoso y fuera del landing', () => {
        const login = src('src/pages/Login.jsx');
        expect(login).toContain("if (provider === 'google') marcarInicioGoogle();");
        const app = src('src/App.jsx').split(/\s+/).join(' ');
        expect(app).toContain("const AvisoCuentaGoogle = lazy(() => import('./components/auth/AvisoCuentaGoogle'));");
        expect(app).toContain('{!IS_APEX_HOST && ( <Suspense fallback={null}> <AvisoCuentaGoogle /> </Suspense> )}');
    });
});
