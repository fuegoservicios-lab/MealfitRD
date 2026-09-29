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
import {
    limiteDePlanes, planPagado, esSuscriptorDePago, regalosPorAnunciar, textoDeRegalo,
    planDeCobro, ultimoDiaDeRegalo,
} from '../utils/regalosCuenta';
import { formatDate } from '../i18n';
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

    // [fix-ronda-1 · 2026-09-28] La escalera de «Otros planes» (Settings) decidía por el plan
    // EFECTIVO: una cortesía Max sin pagar nada la dejaba sin nada seleccionable.
    it('planDeCobro normaliza igual que _tier, pero sobre lo PAGADO', () => {
        expect(planDeCobro({ plan_tier: 'ultra', plan_tier_pagado: 'gratis' })).toBe('gratis'); // cortesía Max, paga nada
        expect(planDeCobro({ plan_tier: 'plus', plan_tier_pagado: 'basic' })).toBe('basic'); // paga básico, cortesía plus
        expect(planDeCobro({ plan_tier: 'admin' })).toBe('admin');
        expect(planDeCobro({ plan_tier: 'no-existe' })).toBe('gratis');
        expect(planDeCobro(null)).toBe('gratis');
    });

    // [fix-ronda-1 · 2026-09-28] El fin que manda el servidor es EXCLUSIVO y de RD (00:00 UTC para
    // créditos, 00:00 America/Santo_Domingo para cortesías) — formatear en el huso del DISPOSITIVO
    // corría la fecha un día en Europa (créditos) y Brasil (cortesías). Determinista: sin importar
    // el huso de la máquina que corre el test, el resultado es el mismo (huso fijo dentro de la función).
    it('el último día del regalo es fijo a RD, para los dos tipos', () => {
        expect(ultimoDiaDeRegalo('2026-10-01T00:00:00+00:00', formatDate)).toBe('30 de septiembre'); // créditos, 00:00 UTC
        expect(ultimoDiaDeRegalo('2026-10-01T04:00:00+00:00', formatDate)).toBe('30 de septiembre'); // cortesía, 00:00 RD
    });

    it('las pantallas usan esas reglas (anclas del código)', () => {
        const settings = fuente('src/pages/Settings.jsx');
        expect(settings).toContain('esSuscriptorDePago(userProfile)');
        expect(settings).toContain("planPagado(userProfile) !== 'ultra'");
        // [fix-ronda-1] la escalera decide por el plan PAGADO, no el efectivo.
        expect(settings).toContain('const _tierPagado = planDeCobro(userProfile);');
        expect(settings).toContain('const isCurrent = tier === _tierPagado;');
        expect(settings).toContain('(TIER_RANK[tier] || 0) < (TIER_RANK[_tierPagado] || 0);');
        // [fix-ronda-1] la fecha de la cortesía, fija a RD.
        expect(settings).toContain('ultimoDiaDeRegalo(_cortesia.hasta, formatDate)');
        expect(fuente('src/pages/Upgrade.jsx')).toContain('planPagado(userProfile)');
        expect(fuente('src/components/home/Pricing.jsx')).toContain('planPagado(userProfile)');
        const ctx = fuente('src/context/AssessmentContext.jsx');
        expect(ctx).toContain('limiteDePlanes(');
        expect(ctx).not.toContain("userPlanLimit = 'Ilimitado'");
        expect(fuente('src/components/dashboard/DashboardLayout.jsx')).toContain('<AvisoRegalos');
        expect(fuente('src/components/dashboard/NotificationCenter.jsx')).toContain('regalo: { Icon: Gift');
        expect(fuente('src/pages/Dashboard.jsx')).toContain('regalo={creditosRegalo}');
        // [fix-ronda-1] el toast/notificación también usa el huso fijo, no el del dispositivo.
        expect(fuente('src/components/dashboard/AvisoRegalos.jsx')).toContain('ultimoDiaDeRegalo(iso, formatDate)');
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

    // [Revisión final · 2026-09-28] «Dont {n} offerts» no concuerda con n=1 (la clave no es plural): forma invariable.
    it('fr-FR: el «de regalo» del medidor vale para cualquier n', () => {
        const cat = JSON.parse(fuente('src/i18n/locales/fr-FR.json'));
        expect(cat['Incluye {n} de regalo']).toBe('Dont {n} en cadeau');
        expect(cat['(incluye {n} de regalo)']).toBe('(dont {n} en cadeau)');
    });
});
