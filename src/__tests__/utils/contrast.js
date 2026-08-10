// [P1-LIGHT-INK-CONTRACT · 2026-08-10] Medidor de contraste del tema claro.
//
// Por qué existe: «se ve lavado» no es accionable y no se puede verificar.
// «1,78:1 contra un mínimo de 4,5» sí, y además evita el error inverso —
// oscurecer algo que ya cumplía. Calibrado en lightContrast.calibration.test.js
// contra valores WCAG publicados; si esa calibración falla, ninguna cifra que
// salga de aquí es fiable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const INDEX_CSS = path.resolve(AQUI, '../../index.css');

/** Tokens del tema CLARO, leídos del bloque `:root`. Se LEEN en vez de
 *  copiarse: una copia mediría una paleta fantasma en cuanto alguien cambie un
 *  token sin acordarse de este archivo. */
export function loadLightTokens() {
  const css = fs.readFileSync(INDEX_CSS, 'utf8');
  const start = css.indexOf(':root {');
  if (start < 0) throw new Error('No encontré el bloque :root en index.css');
  const block = css.slice(start, css.indexOf('\n}', start));
  const tokens = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

const NOMBRADOS = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
};

function parseHex(s) {
  let h = s.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  if (h.length === 6) return { r: n(0), g: n(2), b: n(4), a: 1 };
  if (h.length === 8) return { r: n(0), g: n(2), b: n(4), a: n(6) / 255 };
  throw new Error(`hex no reconocido: ${s}`);
}

/** Corta por comas de PRIMER nivel. Un split(',') ingenuo parte por dentro de un
 *  color-mix anidado y devuelve basura sin avisar. */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseColor(expr, tokens, depth = 0) {
  if (depth > 12) throw new Error(`var() en ciclo: ${expr}`);
  const s = String(expr).trim().replace(/\s*!important$/, '');
  const low = s.toLowerCase();

  if (NOMBRADOS[low]) return { ...NOMBRADOS[low] };
  if (s.startsWith('#')) return parseHex(s);

  if (low.startsWith('var(')) {
    const args = splitTop(s.slice(4, -1));
    const val = tokens[args[0].trim()];
    if (val === undefined) {
      if (args[1] !== undefined) return parseColor(args[1], tokens, depth + 1);
      throw new Error(`token sin definir en el tema claro: ${args[0].trim()}`);
    }
    return parseColor(val, tokens, depth + 1);
  }

  if (low.startsWith('rgba(') || low.startsWith('rgb(')) {
    const inner = s.slice(s.indexOf('(') + 1, s.lastIndexOf(')'));
    const p = splitTop(inner.replace(/\//g, ',')).map((x) => x.trim());
    return { r: +p[0], g: +p[1], b: +p[2], a: p[3] === undefined ? 1 : +p[3] };
  }

  if (low.startsWith('color-mix(')) {
    const p = splitTop(s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')));
    if (!/^in\s+srgb$/i.test(p[0].trim())) throw new Error(`solo modelo srgb soportado: ${s}`);
    const leer = (chunk) => {
      const m = chunk.trim().match(/^(.*?)(?:\s+([\d.]+)%)?$/s);
      return { color: m[1].trim(), pct: m[2] === undefined ? null : +m[2] };
    };
    const A = leer(p[1]);
    const B = leer(p[2]);
    let pa = A.pct;
    let pb = B.pct;
    if (pa === null && pb === null) { pa = 50; pb = 50; } else if (pa === null) pa = 100 - pb;
    else if (pb === null) pb = 100 - pa;
    const wa = pa / (pa + pb);
    const wb = pb / (pa + pb);
    const ca = parseColor(A.color, tokens, depth + 1);
    const cb = parseColor(B.color, tokens, depth + 1);
    // Premultiplicado por alfa: sin esto, mezclar contra `transparent` arrastra
    // su RGB (negro) y oscurece el resultado.
    const a = ca.a * wa + cb.a * wb;
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (ca.r * ca.a * wa + cb.r * cb.a * wb) / a,
      g: (ca.g * ca.a * wa + cb.g * cb.a * wb) / a,
      b: (ca.b * ca.a * wa + cb.b * cb.a * wb) / a,
      a,
    };
  }
  throw new Error(`expresión de color no soportada: ${s}`);
}

export function over(fg, bg) {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

const canal = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const luminance = ({ r, g, b }) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

export function contrast(fg, bg) {
  // Un fondo translúcido no tiene contraste propio: hay que componerlo sobre lo
  // que tenga detrás. Aceptarlo en silencio mide el color a plena fuerza en vez
  // del tinte y devuelve una cifra plausible pero falsa — pasó al escribir el
  // primer test del contrato, y una cifra falsa que nadie cuestiona es
  // exactamente lo que este medidor existe para evitar. Falla ruidosamente.
  if (bg.a !== 1) {
    throw new Error(
      `el fondo es translúcido (alfa ${bg.a}): compónlo con over(fondo, superficie) `
      + 'antes de medir, si no estarías midiendo contra el color a plena fuerza',
    );
  }
  const f = luminance(fg.a === 1 ? fg : over(fg, bg));
  const b = luminance(bg);
  return (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
}

/** L* de CIELAB. Para SUPERFICIES contiguas el ratio WCAG es el instrumento
 *  equivocado: un borde de 1,5:1 puede leerse perfectamente y exigirle 3:1
 *  vuelve la interfaz pesada. Lo que percibe el ojo es el salto de L*.
 *  Referencia de oficio: ~2 apenas se intuye, ~4-5 es un escalón claro. */
export function lstar(color) {
  const y = luminance(color);
  return y <= 216 / 24389 ? (y * 24389) / 27 : Math.cbrt(y) * 116 - 16;
}

export function hex({ r, g, b }) {
  const h = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** Umbral WCAG 2.1 aplicable. 1rem = 16px en este proyecto (no hay override de
 *  html{font-size} en index.css — verificado). */
export function threshold({ rem, weight = 400, decorative = false }) {
  if (decorative) return 3.0;
  const px = rem * 16;
  return px >= 24 || (px >= 18.66 && weight >= 700) ? 3.0 : 4.5;
}
