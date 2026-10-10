import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MicrosList from '../components/dashboard/MicrosList';
import { resumirMicros, formatoMicro } from '../components/dashboard/microsShared';
import { resumenDelDia, textoDelDia } from '../utils/compartirDia';

describe('Extended nutrient diary', () => {
    it('expands all nine additions and filters without a network request', () => {
        render(<MicrosList micros={{ magnesium_mg: 430, vit_b6_mg: .6, iodine_mcg: null }} coverage={{ total: 2, con_datos: 1 }} metas={{ magnesium_mg: { target: 400, kind: 'floor' } }} />);
        fireEvent.click(screen.getByRole('button', { name: /Ver todos los nutrientes/ }));
        for (const name of ['Magnesio', 'Zinc', 'Vitamina B12', 'Folato (B9)', 'Vitamina E', 'Vitamina K', 'Selenio', 'Vitamina B6', 'Yodo']) expect(screen.getByText(name)).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Magnesio' }).firstChild.className).not.toMatch(/over/);
        expect(screen.queryByRole('progressbar', { name: 'Yodo' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Minerales' }));
        expect(screen.queryByText('Vitamina B6')).toBeNull();
        expect(screen.getByText('Yodo')).toBeInTheDocument();
        cleanup();
    });
    it('retains zero, excludes invalid/missing values and agrees with sharing', () => {
        const meals = [{ micros: { values: { b12_mcg: 0, vit_b6_mg: .6, iodine_mcg: null, zinc_mg: -1, vit_e_mg: ' ', vit_d_mcg: Infinity }, coverage: { b12_mcg: { status: 'complete' }, vit_b6_mg: { status: 'complete' } } } }, { micros: null }];
        const { micros, coverage } = resumirMicros(meals);
        expect(micros.b12_mcg).toBe(0);
        expect(micros.zinc_mg).toBeNull();
        expect(micros.vit_e_mg).toBeNull();
        expect(micros.vit_d_mcg).toBeNull();
        expect(coverage.by_nutrient.vit_b6_mg).toMatchObject({ known: 1, total: 2, status: 'partial' });
        expect(formatoMicro(null, 'mg')).toBe('—');
        expect(formatoMicro(.015, 'mcg')).toBe('0.015');
        const summary = resumenDelDia({ consumed: { meals, micros, microsCoverage: coverage }, metas: {} });
        expect(summary.micros.find((f) => f.key === 'vit_b6_mg').valor).toBe(.6);
        expect(textoDelDia(summary)).toContain('Yodo: Sin datos');
        expect(textoDelDia(summary)).toContain('Datos parciales');
    });
});
