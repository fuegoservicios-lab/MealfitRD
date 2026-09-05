/**
 * [P2-POLICY-PANEL-UI · 2026-09-05] Capturas del dueño: «Cambiar mis preferencias» se leía como un enlace y no como
 * acción, y la cocina aparecía DOS veces (resumen del encabezado + fila con icono). Y quien entra al asistente desde
 * ese botón ya tiene plan: su salida es volver al panel, no cerrar sesión.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../i18n', () => ({
    useT: () => (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v?.[k] ?? '')),
    i18nKey: (s) => s,
    t: (s) => s,
}));

import PlanPolicyPanel from '../components/dashboard/PlanPolicyPanel';

const POLICY = {
    effective: {
        recurrence: { global_mode: 'routine' },
        shopping: { main_cycle_days: 15, fresh_topup_days: null, freezer_mode: 'none', batch_cooking: 'never' },
        culture_weights: [{ profile_id: 'us_everyday', weight: 1.0 }],
        market_country: 'CO',
        food_anchors: [],
    },
    requested: { food_anchors: [] },
    relaxations: [],
    enforced: true,
};

const read = (p) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('PlanPolicyPanel · UI', () => {
    it('la cocina aparece UNA sola vez (en su fila, no en el resumen)', () => {
        const { container } = render(<PlanPolicyPanel policy={POLICY} onEdit={() => {}} />);
        // colapsado: el resumen del encabezado ya no la nombra
        expect(container.textContent.match(/cocina estadounidense/gi) || []).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        const veces = container.textContent.match(/cocina estadounidense/gi) || [];
        expect(veces).toHaveLength(1);
        // …y la fila no repite la palabra «Cocina» como etiqueta: «Cocina: Cocina estadounidense…»
        expect(container.textContent.includes('Cocina: Cocina')).toBe(false);
    });

    it('el panel habla al usuario, no de su «política»', () => {
        // [P2-POLICY-PANEL-COPY · 2026-09-05] título, hechos y motivos en la lengua del usuario.
        const { container } = render(<PlanPolicyPanel policy={POLICY} fidelity={{ mode: 'enforce' }} onEdit={() => {}} />);
        expect(screen.getByText('Tu plan, a tu medida')).toBeTruthy();
        expect(container.textContent).toContain('Organizado para comprar cada 15 días');
        expect(container.textContent).not.toMatch(/pol[ií]tica/i);
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        for (const frag of ['Compra principal:', 'cada 15 días', 'Sin compras adicionales',
            'Sin congelar alimentos', 'Cocinas cada día', 'Estilo de cocina:']) {
            expect(container.textContent).toContain(frag);
        }
        expect(screen.getByText('Ajustar mi plan')).toBeTruthy();
    });

    it('cada motivo lleva titular y explicación', () => {
        const policy = { ...POLICY, relaxations: [{ reason_code: 'budget_advisory_no_prices', field: 'budget.mode', action: 'applied' }] };
        const { container } = render(<PlanPolicyPanel policy={policy} fidelity={{ mode: 'enforce' }} onEdit={() => {}} />);
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        expect(container.textContent).toContain('Así adaptamos tu plan');
        expect(container.textContent).toContain('Presupuesto aproximado');
        expect(container.textContent).toContain('Aún no contamos con precios de tu país');
        const css = read('src/components/dashboard/PlanPolicyPanel.module.css');
        expect(css).toMatch(/\.reasonTitle\s*\{[^}]*font-weight/);
        expect(css).toMatch(/\.reasonDetail\s*\{/);
    });

    it('«Ajustar mi plan» es un botón con estilo de acción, no un enlace subrayado', () => {
        const src = read('src/components/dashboard/PlanPolicyPanel.jsx');
        expect(src).toContain('className={styles.editCta}');
        expect(src).toContain("t('Ajustar mi plan')");
        expect(src).not.toContain('className={styles.editLink}');
        const css = read('src/components/dashboard/PlanPolicyPanel.module.css');
        expect(css).toMatch(/\.editCta\s*\{[^}]*border:/);
        expect(css).toMatch(/\.editCta\s*\{[^}]*background:/);
        expect(css).not.toMatch(/\.editCta\s*\{[^}]*text-decoration:\s*underline/);
    });
});

describe('Asistente · salida', () => {
    it('con plan vivo y cuenta ofrece volver al panel; si no, el pill de login', () => {
        const src = read('src/components/assessment/InteractiveAssessmentLayout.jsx');
        expect(src).toContain('_puedeVolverAlPanel');
        expect(src).toContain("navigate('/dashboard')");
        expect(src).toContain("t('Volver al panel')");
        expect(src).toContain("t('Volver al login')");
        const i = src.indexOf('_puedeVolverAlPanel = ');
        expect(src.slice(i, i + 220)).toContain('!isGuest');
    });

    it('la cadena nueva está en los cuatro catálogos', () => {
        for (const loc of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            expect(cat['Volver al panel']).toBeTruthy();
        }
    });
});
