// [P1-Z-SCALE · 2026-08-10] Resuelve un z-index a número, venga como literal o
// como token de la escala.
//
// Por qué existe: al pasar los z-index a tokens, los dos guards que ya vigilaban
// el apilamiento (modalLayering y P1_settings_header_sticky) se rompieron —
// leían `/z-index:\s*(\d+)/` y `var(--z-modal)` no casa. Con esto siguen
// afirmando lo mismo (una capa por encima de otra) sin depender de que el valor
// esté escrito a mano.
//
// Efecto secundario que interesa: la escala deja de vivir solo en un comentario
// y pasa a ser algo que los tests pueden ejecutar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const INDEX_CSS = path.resolve(AQUI, '../../index.css');

/** Los `--z-*` declarados en `:root`. Se LEEN del archivo, no se copian: una
 *  copia mediría una escala fantasma en cuanto alguien cambie un peldaño. */
export function cargarEscala() {
  const css = fs.readFileSync(INDEX_CSS, 'utf8');
  const ini = css.indexOf(':root {');
  if (ini < 0) throw new Error('No encontré el bloque :root en index.css');
  const bloque = css.slice(ini, css.indexOf('\n}', ini));
  const escala = {};
  for (const m of bloque.matchAll(/(--z-[a-z0-9-]+)\s*:\s*(-?\d+)\s*;/gi)) {
    escala[m[1]] = Number(m[2]);
  }
  if (Object.keys(escala).length === 0) throw new Error('No hay tokens --z-* en :root');
  return escala;
}

/**
 * Primer z-index de un archivo, resuelto a número.
 * Acepta `z-index: 9990;`, `zIndex: 9999,` y `var(--z-dialog)` en cualquiera de
 * las dos formas.
 * @returns {number|null} null si el archivo no declara ninguno.
 */
export function zDeArchivo(rutaAbsoluta, escala = cargarEscala()) {
  const src = fs.readFileSync(rutaAbsoluta, 'utf8');
  const m = src.match(/z-?index:\s*'?\s*(var\(\s*(--z-[a-z0-9-]+)\s*\)|-?\d+)/i);
  if (!m) return null;
  if (m[2]) {
    const v = escala[m[2]];
    if (v === undefined) {
      throw new Error(
        `${path.basename(rutaAbsoluta)} usa ${m[2]}, que no existe en la escala de index.css`,
      );
    }
    return v;
  }
  return Number(m[1]);
}

/** Igual, pero sobre un trozo de CSS ya extraído (el cuerpo de una regla). */
export function zDeTexto(texto, escala = cargarEscala()) {
  const m = String(texto).match(/z-?index:\s*'?\s*(var\(\s*(--z-[a-z0-9-]+)\s*\)|-?\d+)/i);
  if (!m) return null;
  if (m[2]) {
    const v = escala[m[2]];
    if (v === undefined) throw new Error(`${m[2]} no existe en la escala de index.css`);
    return v;
  }
  return Number(m[1]);
}
