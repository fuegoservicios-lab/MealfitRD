// frontend/src/__tests__/lote776.test.jsx
// [P1-PLAN-LOTE-776 · 2026-09-28] Lo que ve la persona: el tope lo dice el servidor (a Ultra se le decía «Ilimitado»
// con un tope de 500), las pantallas de COBRO deciden por el plan pagado (una cortesía no ofrece «Cancelar
// suscripción»), y cada regalo se anuncia una vez por dispositivo.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('../utils/notifications', () => ({ addNotification: vi.fn() }));
let regalos = [];
vi.mock('../context/AssessmentContext', () => ({ useAssessment: () => ({ regalosRecientes: regalos }) }));
import { toast } from 'sonner';
import { addNotification } from '../utils/notifications';
import { limiteDePlanes, planPagado, esSuscriptorDePago, regalosPorAnunciar, textoDeRegalo } from '../utils/regalosCuenta';
import AvisoRegalos from '../components/dashboard/AvisoRegalos';
import CreditsMeter from '../components/dashboard/CreditsMeter';

const fuente = (ruta) => readFileSync(resolve(process.cwd(), ruta), 'utf8');
const tFalso = (k, v = {}) => k.replace(/\{(\w+)\}/g, (_, x) => String(v[x]));
const tnFalso = (n, uno, varios, v) => tFalso(n === 1 ? uno : varios, v);

describe('[776] el tope y el plan que ve la persona', () => {
    it('el tope lo dice el servidor; sin él, la tabla de plans.js (Ultra = 500, no «Ilimitado»)', () => {
        expect(limiteDePlanes('plus', { limit: 220 })).toBe(220);
        expect(limiteDePlanes('ultra', null)).toBe(500);
        expect(limiteDePlanes('admin', { limit: 999999 })).toBe('Ilimitado');
        expect(limiteDePlanes('gratis', { limit: 0 })).toBe(10);
        expect(limiteDePlanes(undefined, null)).toBe(10);
    });

    it('lo de cobro decide por el plan PAGADO', () => {
        expect(planPagado({ plan_tier: 'plus', plan_tier_pagado: 'gratis' })).toBe('gratis');
        expect(planPagado({ plan_tier: 'basic' })).toBe('basic');
        expect(planPagado(null)).toBeNull();
        expect(esSuscriptorDePago({ plan_tier: 'plus', plan_tier_pagado: 'gratis' })).toBe(false);
        expect(esSuscriptorDePago({ plan_tier: 'plus', plan_tier_pagado: 'basic' })).toBe(true);
        expect(esSuscriptorDePago({ plan_tier: 'admin' })).toBe(false);
    });

    it('las pantallas usan esas reglas (anclas del código)', () => {
        const settings = fuente('src/pages/Settings.jsx');
        expect(settings).toContain('esSuscriptorDePago(userProfile)');
        expect(settings).toContain("planPagado(userProfile) !== 'ultra'");
        expect(fuente('src/pages/Upgrade.jsx')).toContain('planPagado(userProfile)');
        expect(fuente('src/components/home/Pricing.jsx')).toContain('planPagado(userProfile)');
        const ctx = fuente('src/context/AssessmentContext.jsx');
        expect(ctx).toContain('limiteDePlanes(');
        expect(ctx).not.toContain("userPlanLimit = 'Ilimitado'");
        expect(fuente('src/components/dashboard/DashboardLayout.jsx')).toContain('<AvisoRegalos');
        expect(fuente('src/components/dashboard/NotificationCenter.jsx')).toContain('regalo: { Icon: Gift');
        expect(fuente('src/pages/Dashboard.jsx')).toContain('regalo={creditosRegalo}');
    });
});

describe('[776] el aviso del regalo', () => {
    beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

    it('cada regalo se anuncia una sola vez por dispositivo', () => {
        const lista = [{ id: 'a' }, { id: 'b' }];
        expect(regalosPorAnunciar(lista).map((r) => r.id)).toEqual(['a', 'b']);
        expect(regalosPorAnunciar(lista)).toEqual([]);
        expect(regalosPorAnunciar([{ id: 'a' }, { id: 'c' }]).map((r) => r.id)).toEqual(['c']);
    });

    it('el texto, en singular y en plural', () => {
        const ctx = { t: tFalso, tn: tnFalso, fecha: () => '30 de septiembre' };
        expect(textoDeRegalo({ tipo: 'creditos_generacion', cantidad: 20, hasta: 'x' }, ctx)).toEqual({
            title: 'Tienes un regalo 🎁',
            message: 'Te regalamos 20 créditos para crear planes, válidos hasta el 30 de septiembre.',
        });
        expect(textoDeRegalo({ tipo: 'creditos_coach', cantidad: 1, hasta: 'x' }, ctx).message)
            .toBe('Te regalamos 1 mensaje más con tu coach, válido hasta el 30 de septiembre.');
        expect(textoDeRegalo({ tipo: 'plan', plan: 'ultra', hasta: null }, ctx).message).toBe('Ahora tienes Max de cortesía.');
    });

    it('AvisoRegalos: toast y centro de notificaciones una vez', () => {
        regalos = [{ id: 'g1', tipo: 'creditos_generacion', cantidad: 20, plan: null, hasta: '2026-10-01T00:00:00+00:00' }];
        const { unmount } = render(<AvisoRegalos />);
        expect(toast.success).toHaveBeenCalledTimes(1);
        expect(toast.success.mock.calls[0][0]).toBe('Tienes un regalo 🎁');
        expect(addNotification).toHaveBeenCalledWith(expect.objectContaining({ id: 'regalo-g1', kind: 'regalo' }));
        unmount();
        render(<AvisoRegalos />);
        expect(toast.success).toHaveBeenCalledTimes(1);
    });

    it('el medidor dice cuánto es regalo', () => {
        render(<CreditsMeter remainingCredits={27} userPlanLimit={30} isLimitReached={false} regalo={20} />);
        expect(screen.getByRole('img').getAttribute('aria-label')).toContain('(incluye 20 de regalo)');
        expect(screen.getByText('+20')).toBeInTheDocument();
    });
});

describe('[776] traducciones', () => {
    const claves = [
        'Tienes un regalo 🎁', 'Tienes {nombre} de cortesía hasta el {fecha}.', 'Ahora tienes {nombre} de cortesía.',
        'Cortesía', 'Cortesía hasta', 'Incluye {n} de regalo', '(incluye {n} de regalo)',
        'Tienes {nombre} de cortesía. Si te suscribes, lo conservas cuando termine.',
    ];
    const plurales = [
        'Te regalamos {n} créditos para crear planes, válidos hasta el {fecha}.',
        'Te regalamos {n} mensajes más con tu coach, válidos hasta el {fecha}.',
    ];
    it.each(['en-US', 'pt-BR', 'fr-FR', 'it-IT'])('%s trae todas las frases del regalo', (l) => {
        const cat = JSON.parse(fuente(`src/i18n/locales/${l}.json`));
        for (const k of claves) expect(typeof cat[k], k).toBe('string');
        for (const k of plurales) expect(cat[k] && cat[k].one && cat[k].other, k).toBeTruthy();
    });
});
