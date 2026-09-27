// [P1-PLAN-LOTE-417 · 2026-09-27] El panel «Lo que pediste» ya no pinta como TUYO lo que el plan supuso.
//
// Auditoría formulario→backend (otra sesión), verificada: el paso «Cómo compras y cocinas» es opcional y NO siembra
// valores (QShoppingHabits); sin respuesta, `plan_policy.policy_from_form` rellena congelador 'limited', tandas según el
// tiempo de cocina y frescos cada 7 días. Su comentario promete que la política «lo declara», pero no lo declaraba: el
// panel decía «Congelas algunos alimentos» / «A veces cocinas de más» a quien nunca contestó. Medido el 27-sep: los 14
// planes con política tienen las dos respuestas explícitas, así que hoy no afecta a nadie; el hueco era el contrato.
// Contrato (la mitad del servidor va con el lote 550 de la otra sesión): `requested.source.defaulted` = campos de compra
// rellenados sin respuesta, entre `freezer_mode`, `batch_cooking` y `fresh_topup_days`. `source` es volátil para el hash
// de la política: declararlo no cambia el sello del plan. Sin la lista (planes anteriores) no se marca nada.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const SUFIJO = '(no lo indicaste: usamos lo más habitual)';

const politica = (defaulted) => {
    const shopping = { main_cycle_days: 15, fresh_topup_days: 7, freezer_mode: 'limited', batch_cooking: 'sometimes' };
    return {
        requested: {
            recurrence: { global_mode: 'balanced' },
            shopping,
            food_anchors: [],
            source: { form_version: 'v2', adapter: '2026-09-02.1', ...(defaulted ? { defaulted } : {}) },
        },
        effective: { recurrence: { global_mode: 'balanced' }, shopping, food_anchors: [] },
        relaxations: [],
    };
};

describe('[417] los hechos supuestos se dicen como supuestos', () => {
    let PlanPolicyPanel;
    beforeEach(async () => {
        ({ default: PlanPolicyPanel } = await import('../components/dashboard/PlanPolicyPanel'));
    });

    it('congelador y tandas sin respuesta llevan la marca; los frescos contestados, no', () => {
        render(<PlanPolicyPanel policy={politica(['freezer_mode', 'batch_cooking'])} fidelity={{ mode: 'enforce' }} />);
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        expect(screen.getByText(`Congelas algunos alimentos ${SUFIJO}`)).toBeTruthy();
        expect(screen.getByText(`A veces cocinas de más ${SUFIJO}`)).toBeTruthy();
        expect(screen.getByText('Compras frescos cada 7 días')).toBeTruthy();
    });

    it('un plan sin la lista (anterior al contrato) no marca nada', () => {
        render(<PlanPolicyPanel policy={politica(undefined)} fidelity={{ mode: 'enforce' }} />);
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        expect(screen.getByText('Congelas algunos alimentos')).toBeTruthy();
        expect(screen.queryByText(new RegExp(SUFIJO.replace(/[()]/g, '\\$&')))).toBeNull();
    });
});
