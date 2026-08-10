// [P1-LIGHT-INK-CONTRACT · 2026-08-10] Calibración del medidor contra valores
// WCAG publicados.
//
// Va primero y aparte del contrato: si la aritmética está mal, los otros tests
// dan cifras falsas con toda la confianza del mundo. Un medidor sin calibrar es
// peor que ninguno — nadie cuestiona un número.
import { describe, it, expect } from 'vitest';
import {
  loadLightTokens, parseColor, contrast, over, hex, lstar, threshold,
} from './utils/contrast';

const T = loadLightTokens();
const P = (s) => parseColor(s, T);
const W = P('#FFFFFF');

describe('[P1-LIGHT-INK-CONTRACT] el medidor está calibrado', () => {
  it('reproduce los ratios canónicos de WCAG', () => {
    expect(contrast(P('#000000'), W)).toBeCloseTo(21, 2);
    expect(contrast(W, W)).toBeCloseTo(1, 5);
    expect(contrast(P('#767676'), W)).toBeCloseTo(4.54, 1);   // límite AA clásico
    expect(contrast(P('#595959'), W)).toBeCloseTo(7.0, 1);    // límite AAA clásico
    expect(contrast(P('#64748B'), W)).toBeCloseTo(4.76, 1);
    expect(contrast(P('#94A3B8'), W)).toBeCloseTo(2.56, 1);
  });

  it('el ratio es simétrico', () => {
    expect(contrast(W, P('#767676'))).toBeCloseTo(contrast(P('#767676'), W), 6);
  });

  it('compone alfa sobre el fondo', () => {
    expect(hex(over(P('rgba(0,0,0,0.5)'), W))).toBe('#808080');
    expect(hex(over(P('transparent'), W))).toBe('#FFFFFF');
  });

  it('mezcla color-mix conservando el tono al mezclar contra transparent', () => {
    // Premultiplicar por alfa es lo que evita que `transparent` arrastre su RGB
    // (negro) y oscurezca el resultado. Es el patrón que más abunda en el panel
    // de micronutrientes, así que este caso no es teórico.
    expect(hex(P('color-mix(in srgb, #000000 50%, #FFFFFF)'))).toBe('#808080');
    const mix = P('color-mix(in srgb, #2DD4BF 17%, transparent)');
    expect(hex(mix)).toBe('#2DD4BF');
    expect(mix.a).toBeCloseTo(0.17, 3);
  });

  it('resuelve var() y su fallback', () => {
    expect(hex(P('var(--bg-card)'))).toBe('#FFFFFF');
    expect(hex(P('var(--no-existe, #123456)'))).toBe('#123456');
    expect(hex(P('color-mix(in srgb, var(--border) 100%, transparent)'))).toBe('#E2E8F0');
  });

  it('L* mide el escalón perceptual entre superficies', () => {
    expect(lstar(P('#FFFFFF'))).toBeCloseTo(100, 1);
    expect(lstar(P('#000000'))).toBeCloseTo(0, 1);
    // El escalón que hoy es imperceptible: tarjeta blanca → chip --bg-page.
    expect(lstar(P('#FFFFFF')) - lstar(P('#F8FAFC'))).toBeLessThan(2);
  });

  it('se niega a medir contra un fondo translúcido', () => {
    // Un fondo con alfa no tiene contraste propio. Aceptarlo mediría el color a
    // plena fuerza en vez del tinte: una cifra plausible y falsa. Pasó al
    // escribir el primer test del contrato, así que el medidor falla ruidoso.
    const tinte = P('color-mix(in srgb, #38BDF8 13%, transparent)');
    expect(() => contrast(P('#0369A1'), tinte)).toThrow(/transl/i);
    // Compuesto sobre la tarjeta sí se puede medir, y da el valor real.
    expect(contrast(P('#0369A1'), over(tinte, W))).toBeCloseTo(5.37, 1);
  });

  it('aplica el umbral WCAG que corresponde al tamaño', () => {
    expect(threshold({ rem: 0.7, weight: 400 })).toBe(4.5);
    expect(threshold({ rem: 1.6, weight: 400 })).toBe(3);    // ≥24px
    expect(threshold({ rem: 1.2, weight: 700 })).toBe(3);    // ≥18.66px en negrita
    expect(threshold({ rem: 1.0, weight: 700 })).toBe(4.5);  // 16px negrita NO es grande
    expect(threshold({ rem: 0.7, weight: 400, decorative: true })).toBe(3);
  });
});
