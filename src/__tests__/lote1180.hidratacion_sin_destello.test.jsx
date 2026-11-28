// [P1-PLAN-LOTE-1180 · 2026-11-27] La hidratación no se asoma en Progreso antes de que llegue el perfil.
// El dueño (hidratación APAGADA en su cuenta): «me aparece por unos milisegundos lo de hidratación» al iniciar sesión.
// La tarjeta se montaba sin perfil y decidía con la copia GLOBAL del dispositivo, que en ese dispositivo también
// escribe otra cuenta con la hidratación encendida.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const estado = { userProfile: null };
vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({ userProfile: estado.userProfile, formData: {}, planData: null, session: null }),
}));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn(() => new Promise(() => {})) }));
vi.mock('../components/dashboard/TrackingProgress', () => ({ default: () => null }));

import DashboardTracking from '../components/dashboard/DashboardTracking';

const pintar = () => render(<MemoryRouter><DashboardTracking /></MemoryRouter>);

describe('lote 1180 · hidratación sin destello', () => {
    beforeEach(() => { localStorage.clear(); });

    it('sin perfil no se dibuja, aunque el dispositivo recuerde «encendida» (de otra cuenta)', () => {
        localStorage.setItem('mealfit_water_tracker_enabled', 'true');
        estado.userProfile = null;
        const { container } = pintar();
        expect(container.querySelector('[aria-label="Hidratación"]')).toBeNull();
    });

    it('con el perfil, manda el perfil: apagada no se dibuja aunque el dispositivo diga lo contrario', () => {
        localStorage.setItem('mealfit_water_tracker_enabled', 'true');
        estado.userProfile = { id: 'u1', water_tracker_enabled: false };
        const { container } = pintar();
        expect(container.querySelector('[aria-label="Hidratación"]')).toBeNull();
    });

    it('con el perfil y encendida, se dibuja', () => {
        estado.userProfile = { id: 'u1', water_tracker_enabled: true };
        const { container } = pintar();
        expect(container.querySelector('[aria-label="Hidratación"]')).not.toBeNull();
    });
});
