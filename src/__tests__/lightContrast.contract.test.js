// [P1-LIGHT-INK-CONTRACT · 2026-08-10] El contrato de color del tema claro.
//
// Ancla las tres reglas del spec con números, no con nombres: si alguien cambia
// un token, esto falla diciendo cuánto se pasó.
import { describe, it, expect } from 'vitest';
import { loadLightTokens, parseColor, contrast, lstar, over } from './utils/contrast';

const T = loadLightTokens();
const P = (s) => parseColor(s, T);
const CARD = P('var(--surface-card)');
const SUNKEN = P('var(--surface-sunken)');

/** Un tinte al 13% no es una superficie: es una capa translúcida sobre la
 *  tarjeta. Medir contra el color a plena fuerza da una cifra plausible y
 *  falsa. */
const tinteSobreTarjeta = (fill) => over(P(`color-mix(in srgb, ${fill} 13%, transparent)`), CARD);

describe('[P1-LIGHT-INK-CONTRACT] la rampa de texto', () => {
  // Cada peldaño cumple su mínimo en LAS DOS superficies del dashboard. Medir
  // solo contra la tarjeta blanca es lo que dejó pasar el fallo original:
  // --text-muted daba 4,76 sobre blanco y 4,23 sobre el chip hundido.
  const RAMPA = [
    ['--text-main', 4.5],
    ['--text-muted', 4.5],
    ['--text-light', 3.0], // solo adorno: chevrons, separadores, deshabilitado
  ];

  it.each(RAMPA)('%s cumple %s:1 sobre la tarjeta y sobre el chip', (token, min) => {
    const c = P(`var(${token})`);
    expect(contrast(c, CARD)).toBeGreaterThanOrEqual(min);
    expect(contrast(c, SUNKEN)).toBeGreaterThanOrEqual(min);
  });

  it('los tres peldaños siguen distinguiéndose entre sí', () => {
    // Si --text-light sube hasta AA queda a 1,0 L* de --text-muted y la rampa
    // de tres niveles colapsa a dos. Este test es el que impide ese atajo.
    const main = lstar(P('var(--text-main)'));
    const muted = lstar(P('var(--text-muted)'));
    const light = lstar(P('var(--text-light)'));
    expect(muted - main).toBeGreaterThanOrEqual(25);
    expect(light - muted).toBeGreaterThanOrEqual(8);
  });
});

describe('[P1-LIGHT-INK-CONTRACT] la escalera de superficie', () => {
  it('el chip hundido se despega de la tarjeta', () => {
    // Hoy es 1,8 (imperceptible). El tema oscuro tiene 8,1 en el mismo sitio:
    // por eso allí un chip se lee como chip y en claro todo es una masa blanca.
    expect(lstar(CARD) - lstar(SUNKEN)).toBeGreaterThanOrEqual(4);
  });
});

describe('[P1-LIGHT-INK-CONTRACT] las diez parejas fill/ink', () => {
  // `fill` es el color vivo de hoy y NO se toca: puntos, barras e iconos
  // decorativos lo conservan. `ink` es lo único que se usa como texto.
  const PAREJAS = [
    ['--ink-dairy', '#38BDF8'],
    ['--ink-proteins', '#FB7185'],
    ['--ink-ready', '#C084FC'],
    ['--ink-door', '#22D3EE'],
    ['--ink-fruits', '#FB923C'],
    ['--ink-veggies', '#34D399'],
    ['--ink-pantry', '#FBBF24'],
    ['--ink-ok', '#2DD4BF'],
    ['--ink-warn', '#FB923C'],
    ['--ink-good', '#10B981'],
  ];

  it.each(PAREJAS)('%s es legible sobre la tarjeta y sobre el tinte de su acento', (ink, fill) => {
    const c = P(`var(${ink})`);
    expect(contrast(c, CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c, tinteSobreTarjeta(fill))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(PAREJAS)('%s es más oscuro que su fill (si no, no es una capa de tinta)', (ink, fill) => {
    expect(lstar(P(`var(${ink})`))).toBeLessThan(lstar(P(fill)));
  });
});
