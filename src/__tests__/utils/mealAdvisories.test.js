/**
 * [P2-DISHQUAL-SURFACE-UPDATES · 2026-06-29] (re-audit objetivo · P2 XCUT-DISHQUAL-NOT-SURFACED)
 *
 * `getMealAdvisories(meal)` traduce los flags advisory per-comida que el backend persiste en
 * plan_data a chips es-DO no-bloqueantes para la tarjeta de plato del Dashboard. Pre-fix el backend
 * los calculaba pero el frontend nunca los mostraba.
 */
import { describe, it, expect } from 'vitest';
import { getMealAdvisories } from '../../utils/mealAdvisories';
import fs from 'node:fs';
import path from 'node:path';

describe('P2 — getMealAdvisories', () => {
  it('devuelve [] para meal sin flags / inválido', () => {
    expect(getMealAdvisories({})).toEqual([]);
    expect(getMealAdvisories({ name: 'Pollo' })).toEqual([]);
    expect(getMealAdvisories(null)).toEqual([]);
    expect(getMealAdvisories(undefined)).toEqual([]);
    expect(getMealAdvisories('x')).toEqual([]);
  });

  it('mapea cada flag a un chip con su key', () => {
    expect(getMealAdvisories({ _dish_quality_degraded: true })[0].key).toBe('dish_quality');
    expect(getMealAdvisories({ _slot_advisory: true })[0].key).toBe('slot');
    expect(getMealAdvisories({ _appetibility_combo_warning: true })[0].key).toBe('combo');
    expect(getMealAdvisories({ _macro_band_low: true })[0].key).toBe('macro_band');
  });

  it('acumula múltiples advisories y cada uno trae label no vacío', () => {
    const adv = getMealAdvisories({
      _dish_quality_degraded: true,
      _slot_advisory: true,
      _appetibility_combo_warning: true,
      _macro_band_low: true,
    });
    expect(adv).toHaveLength(4);
    for (const a of adv) {
      expect(typeof a.label).toBe('string');
      expect(a.label.length).toBeGreaterThan(0);
    }
  });

  it('flags falsy NO generan chip', () => {
    expect(getMealAdvisories({ _dish_quality_degraded: false, _slot_advisory: 0, _macro_band_low: null })).toEqual([]);
  });

  it('Dashboard.jsx importa y usa getMealAdvisories (anti-regresión de wiring)', () => {
    const dash = fs.readFileSync(
      path.resolve(__dirname, '../../pages/Dashboard.jsx'), 'utf-8'
    );
    expect(/import\s*\{[^}]*\bgetMealAdvisories\b[^}]*\}\s*from\s*['"][^'"]*mealAdvisories/.test(dash)).toBe(true);
    expect(dash.includes('getMealAdvisories(meal)')).toBe(true);
  });
});
