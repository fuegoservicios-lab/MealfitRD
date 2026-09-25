/**
 * [P1-PLAN-LOTE-290 · 2026-09-25] Los suplementos viven en la Nevera → Alacena (grupo «Suplementos»), con su etiqueta
 * por porción y lo que el plan de hoy pide. Spec: docs/superpowers/specs/2026-09-25-suplementos-alacena-design.md.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { agrupar, lineaEtiqueta, sinSuplementos } from '../utils/suplementosAlacena';
import GrupoSuplementos from '../components/pantry/GrupoSuplementos';

const WHEY = {
    id: 1, ingredient_name: 'Proteína Whey', brand: 'Optimum', quantity: 27, unit: 'scoop', kind: 'supplement',
    serving_unit: 'scoop', label_source: 'foto', serving_label: { gramos_porcion: 31, kcal: 120, protein_g: 24, carbs_g: 3, fats_g: 1.5 },
};
const ARROZ = { id: 2, ingredient_name: 'Arroz', quantity: 2, unit: 'lb', kind: 'food' };
const VIEJA = { id: 3, ingredient_name: 'Habichuelas', quantity: 1, unit: 'lb' };   // fila sin `kind` (cache vieja)
const t = (s, v) => (v ? Object.entries(v).reduce((a, [k, x]) => a.replace(`{${k}}`, x), s) : s);

describe('[290] Alacena → Suplementos', () => {
    it('separa los potes de los alimentos y cruza con el plan por nombre', () => {
        const r = agrupar([WHEY, ARROZ, VIEJA], [
            { name: 'Proteína Whey', dose: '1 scoop', timing: 'Después de entrenar' },
            { name: 'Creatina Monohidrato', dose: '5 g', timing: 'Cualquier hora' },
        ]);
        expect(r.potes.map((p) => p.nombre)).toEqual(['Proteína Whey']);
        expect(r.potes[0].delPlan).toEqual({ dose: '1 scoop', timing: 'Después de entrenar' });
        expect(r.soloDelPlan.map((s) => s.name)).toEqual(['Creatina Monohidrato']);
    });

    it('los alimentos quedan para las zonas de siempre (una fila sin kind es alimento)', () => {
        expect(sinSuplementos([WHEY, ARROZ, VIEJA]).map((f) => f.id)).toEqual([2, 3]);
    });

    it('la línea de la etiqueta', () => {
        expect(lineaEtiqueta(WHEY.serving_label, 'scoop', t)).toBe('1 scoop (31 g) · 120 kcal · 24 g proteína');
        expect(lineaEtiqueta(null, 'scoop', t)).toBe('Sin etiqueta — pídesela al coach');
    });

    it('pinta el grupo con porciones y «Del plan»; vacío no pinta nada', () => {
        const { potes, soloDelPlan } = agrupar([WHEY], [{ name: 'Creatina Monohidrato', dose: '5 g', timing: 'Cualquier hora' }]);
        render(<GrupoSuplementos potes={potes} soloDelPlan={soloDelPlan} />);
        expect(screen.getByText('Suplementos')).toBeInTheDocument();
        expect(screen.getByText(/~27 scoops/)).toBeInTheDocument();
        expect(screen.getByText('Del plan')).toBeInTheDocument();
        const { container } = render(<GrupoSuplementos potes={[]} soloDelPlan={[]} />);
        expect(container.innerHTML).toBe('');
    });

    it('la Nevera los saca de las zonas y pinta el grupo en la Alacena (móvil y escritorio)', () => {
        const src = readFileSync(resolve(__dirname, '..', 'pages', 'Pantry.jsx'), 'utf8');
        expect(src).toContain('sinSuplementos(');
        expect((src.match(/<GrupoSuplementos /g) || []).length).toBe(2);
    });
});

describe('[292 · revisión C1] pote sin porciones conocidas', () => {
    it('no dice «~0 scoops»: pide el dato al coach', () => {
        const { potes } = agrupar([{ ...WHEY, quantity: 0, serving_label: null }], []);
        render(<GrupoSuplementos potes={potes} soloDelPlan={[]} />);
        expect(screen.queryByText(/~0/)).toBeNull();
        expect(screen.getByText('Porciones por confirmar — díselas al coach')).toBeInTheDocument();
    });
});

