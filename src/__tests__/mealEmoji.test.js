// [P1-CLINICAL-MEAL-COUNT · 2026-06-27] El emoji de comida del Historial se resuelve por SLOT
// (substring), NO por índice posicional. Ancla la decisión: con planes de 3/5/6 comidas el array
// posicional ['🍳','🍲','🥗','🍎'][i] descuadraba (ej. en un plan de 5, "Merienda AM" en índice 1
// mostraba 🍲 de almuerzo; en uno de 3, "Cena" en índice 2 mostraba 🥗).
import { describe, it, expect } from 'vitest';
import { mealEmojiFor } from '../utils/mealEmoji';

describe('mealEmojiFor', () => {
  it('mapea cada slot a su emoji por nombre (no por posición)', () => {
    expect(mealEmojiFor('Desayuno')).toBe('🍳');
    expect(mealEmojiFor('Almuerzo')).toBe('🍲');
    expect(mealEmojiFor('Comida')).toBe('🍲');
    expect(mealEmojiFor('Merienda')).toBe('🥗');
    expect(mealEmojiFor('Cena')).toBe('🍎');
  });

  it('las 3 meriendas (AM/PM/Nocturna) del plan de 5-6 comparten el emoji de merienda', () => {
    expect(mealEmojiFor('Merienda AM')).toBe('🥗');
    expect(mealEmojiFor('Merienda PM')).toBe('🥗');
    expect(mealEmojiFor('Merienda Nocturna')).toBe('🥗');
  });

  it('plan de 3 comidas: Cena (índice 2) NO toma el emoji posicional 🥗', () => {
    // regresión del bug posicional: emojis[2] era 🥗; ahora la cena resuelve a 🍎 por nombre.
    const plan3 = ['Desayuno', 'Almuerzo', 'Cena'];
    expect(plan3.map(mealEmojiFor)).toEqual(['🍳', '🍲', '🍎']);
  });

  it('plan de 5 comidas: cada slot correcto (no scrambled)', () => {
    const plan5 = ['Desayuno', 'Merienda AM', 'Almuerzo', 'Merienda PM', 'Cena'];
    expect(plan5.map(mealEmojiFor)).toEqual(['🍳', '🥗', '🍲', '🥗', '🍎']);
  });

  it('slot desconocido / vacío → fallback 🍽️', () => {
    expect(mealEmojiFor('')).toBe('🍽️');
    expect(mealEmojiFor(null)).toBe('🍽️');
    expect(mealEmojiFor(undefined)).toBe('🍽️');
    expect(mealEmojiFor('Brunch')).toBe('🍽️');
  });
});
