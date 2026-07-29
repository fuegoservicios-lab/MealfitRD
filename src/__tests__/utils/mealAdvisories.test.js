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

  describe('[P1-SWAP-PROSE-HONEST · 2026-07-29] dish_quality reason-aware label', () => {
    it('_dish_quality_reason="portion_estimate" ya NO dice "Receta básica" ni empuja a regenerar', () => {
      // Evidencia viva: plan deefa5f0-51c6-40ba-9579-c9fc660cb4c4 — el flag venía de una
      // CANTIDAD estimada por el solver sobre una receta con 3 pasos completos. El label
      // histórico ("Receta básica — regenera para más detalle") era doblemente falso.
      const meal = {
        _dish_quality_degraded: true,
        _dish_quality_reason: 'portion_estimate',
        recipe: ['Mise en place: ...', 'El Toque de Fuego: ...', 'Montaje: ...'],
      };
      const chip = getMealAdvisories(meal).find((a) => a.key === 'dish_quality');
      expect(chip).toBeTruthy();
      expect(chip.label.toLowerCase()).not.toContain('receta básica');
      expect(chip.label.toLowerCase()).not.toContain('regenera');
    });

    it('sin _dish_quality_reason (planes viejos) conserva el label histórico — fallback seguro', () => {
      const chip = getMealAdvisories({ _dish_quality_degraded: true })
        .find((a) => a.key === 'dish_quality');
      expect(chip.label).toBe('Receta básica — regenera para más detalle');
    });

    it('_dish_quality_reason="recipe_missing"/"ingredients_missing" conservan el label histórico (regenerar SÍ ayuda)', () => {
      for (const reason of ['recipe_missing', 'ingredients_missing', 'name_missing']) {
        const chip = getMealAdvisories({ _dish_quality_degraded: true, _dish_quality_reason: reason })
          .find((a) => a.key === 'dish_quality');
        expect(chip.label).toBe('Receta básica — regenera para más detalle');
      }
    });
  });

  it('Dashboard.jsx importa y usa getMealAdvisories (anti-regresión de wiring)', () => {
    const dash = fs.readFileSync(
      path.resolve(__dirname, '../../pages/Dashboard.jsx'), 'utf-8'
    );
    expect(/import\s*\{[^}]*\bgetMealAdvisories\b[^}]*\}\s*from\s*['"][^'"]*mealAdvisories/.test(dash)).toBe(true);
    expect(dash.includes('getMealAdvisories(meal)')).toBe(true);
  });
});
