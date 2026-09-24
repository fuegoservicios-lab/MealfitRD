// [P1-NEVERA-OPCIONAL · 2026-09-23] La Nevera apagada desaparece de la nav y su ruta lleva al panel. La regla vive
// en el servidor (nevera_opcional.nevera_activa_de) y llega calculada en el perfil: aquí solo se LEE.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { navItemsFor, neveraActiva } from '../config/dashboardNav';

const leer = (...p) => fs.readFileSync(path.resolve(__dirname, '..', ...p), 'utf8');

beforeEach(() => { localStorage.clear(); });

describe('neveraActiva', () => {
    it('manda el perfil', () => {
        expect(neveraActiva({ nevera_activa: false })).toBe(false);
        expect(neveraActiva({ nevera_activa: true })).toBe(true);
    });
    it('sin perfil, el espejo; sin nada, activa', () => {
        expect(neveraActiva(null)).toBe(true);
        localStorage.setItem('mealfit_nevera_activa', 'false');
        expect(neveraActiva(null)).toBe(false);
        expect(neveraActiva({})).toBe(false);          // perfil de un backend viejo: sin el campo, manda el espejo
        expect(neveraActiva({ nevera_activa: true })).toBe(true);
    });
});

describe('navItemsFor', () => {
    it('sin Nevera no hay entrada pantry', () => {
        expect(navItemsFor({ trackingMode: true, nevera: false }).map((i) => i.key)).toEqual(['plan', 'agent', 'history']);
        expect(navItemsFor({ trackingMode: true }).map((i) => i.key)).toEqual(['plan', 'agent', 'pantry', 'history']);
    });
    it('los tres consumidores pasan la regla', () => {
        expect(leer('components', 'dashboard', 'DashboardLayout.jsx'))
            .toContain('navItemsFor({ trackingMode: isTrackingMode(userProfile, planData), nevera: neveraActiva(userProfile) })');
        expect(leer('components', 'dashboard', 'BottomTabBar.jsx'))
            .toContain('repartoTelefono(navItemsFor({ trackingMode: isTrackingMode(userProfile, planData), nevera: neveraActiva(userProfile) })).barra');
        expect(leer('pages', 'AgentPage.jsx')).toContain('nevera: neveraActiva(userProfile)');
    });
});

describe('la ruta y el espejo', () => {
    it('la Nevera apagada redirige al panel', () => {
        expect(leer('pages', 'Pantry.jsx')).toContain('if (!neveraActiva(userProfile)) return <Navigate to="/dashboard" replace />;');
    });
    it('el perfil siembra el espejo y cerrar sesión lo borra', () => {
        const ctx = leer('context', 'AssessmentContext.jsx');
        expect(ctx).toContain("safeLocalStorageSet('mealfit_nevera_activa', String(data.nevera_activa))");
        expect(ctx).toContain("safeLocalStorageRemove('mealfit_nevera_activa')");
        expect(ctx).toContain("safeLocalStorageRemove('mealfit_nevera_auto_off_visto')");
    });
});
