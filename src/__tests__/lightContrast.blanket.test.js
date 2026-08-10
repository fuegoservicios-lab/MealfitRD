// [P1-LIGHT-INK-CONTRACT · 2026-08-10] Ningún tono pensado para fondo oscuro
// puede volver a usarse como color de TEXTO en el dashboard.
//
// Por qué blanket y no una lista de sitios: el defecto original no fue un
// descuido puntual, fue una REGLA AUSENTE. Se corrigieron 173 instancias; sin
// esto, la 174 entra con el próximo componente y nadie la ve hasta que el dueño
// la reporte — que es exactamente como llegó este trabajo.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(AQUI, '..');

/** Los -300/-400 de Tailwind que aparecían en el audit. Como TEXTO sobre una
 *  superficie clara ninguno llega a 3:1. Como RELLENO (punto, barra, tinte de
 *  fondo, borde) son legítimos y por eso este test solo mira `color:`. */
const TONOS_DE_OSCURO = [
  '#38BDF8', '#FB7185', '#C084FC', '#22D3EE', '#FB923C', '#34D399', '#FBBF24',
  '#2DD4BF', '#67E8F9', '#6EE7B7', '#FCD34D', '#A78BFA', '#A5B4FC', '#91E9F7',
  '#818CF8', '#F59E0B', '#10B981', '#94A3B8', '#93C5FD', '#CFFAFE', '#FDA4AF',
  '#FDBA74', '#E0E7FF', '#BEF2FA',
];

/** Archivos del producto autenticado. El marketing usa el tema `paper` (blanco
 *  y negro estricto) y queda fuera por decisión de producto. */
function archivosDelDashboard() {
  const dirs = [
    path.join(SRC, 'components/dashboard'),
    path.join(SRC, 'components/pantry'),
    path.join(SRC, 'components/common'),
  ];
  const sueltos = [
    path.join(SRC, 'pages/Pantry.fridge.module.css'),
    path.join(SRC, 'pages/Pantry.mobileFridge.module.css'),
  ].filter((f) => fs.existsSync(f));

  const out = [...sueltos];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.module.css')) out.push(path.join(d, f));
    }
  }
  return out;
}

const ARCHIVOS = archivosDelDashboard();

describe('[P1-LIGHT-INK-CONTRACT] ningún tono de tema oscuro se usa como texto', () => {
  it('el escáner encuentra archivos que revisar', () => {
    // Un bucle sobre cero elementos siempre pasa. Sin esta afirmación, mover un
    // directorio dejaría el guard verde y ciego.
    expect(ARCHIVOS.length).toBeGreaterThan(8);
  });

  it.each(ARCHIVOS)('%s', (archivo) => {
    const fuente = fs.readFileSync(archivo, 'utf8');
    const lineas = fuente.split('\n');

    /* Clases que YA tienen una rama de tema claro que les redefine el color. En
       esos casos el literal de la regla base solo se pinta en oscuro, donde es
       correcto. Sin esto el escáner acusaría precisamente a los sitios que sí
       están arreglados — un guard que castiga la solución. */
    const conRamaClara = new Set();
    for (const m of fuente.matchAll(
      /html:not\(\[data-theme=["']dark["']\]\)\)?\s*\.([A-Za-z0-9_-]+)[^{]*\{[^}]*?(^|[^-\w])color\s*:/gms,
    )) {
      conRamaClara.add(m[1]);
    }

    const infracciones = [];
    lineas.forEach((linea, i) => {
      const m = linea.match(/(^|[^-\w])color\s*:\s*([^;]+)/i);
      if (!m) return;
      const valor = m[2].toUpperCase();
      const tono = TONOS_DE_OSCURO.find((t) => valor.includes(t));
      if (!tono) return;

      // Exención 1: dentro de una rama explícita de tema oscuro es correcto —
      // ahí estos tonos son justo los que se eligieron y funcionan. El selector
      // puede venir con o sin `html` delante.
      const contexto = lineas.slice(Math.max(0, i - 6), i + 1).join('\n');
      if (/\[data-theme=["']dark["']\]/.test(contexto)) return;

      // Exención 2: la clase tiene su propia rama de tema claro más abajo.
      // El selector puede estar en ESTA línea (regla de una sola línea) o en la
      // que abrió el bloque: `color: #xxx;` a solas no menciona ninguna clase,
      // así que hay que retroceder hasta el `{` que la contiene.
      let selector = linea;
      if (!linea.includes('{')) {
        for (let j = i - 1; j >= 0 && j > i - 40; j -= 1) {
          if (lineas[j].includes('{')) { selector = lineas[j]; break; }
          if (lineas[j].includes('}')) break;
        }
      }
      const clases = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((x) => x[1]);
      if (clases.some((c) => conRamaClara.has(c))) return;

      infracciones.push(`  L${i + 1}: ${tono} → ${linea.trim().slice(0, 88)}`);
    });

    expect(
      infracciones,
      `\n${path.basename(archivo)} usa un tono de tema oscuro como color de TEXTO en `
      + 'modo claro. Ninguno de esos llega a 3:1 sobre una superficie clara.\n'
      + 'Usa el token --ink-* del acento; el color vivo se queda para punto, barra e icono.\n'
      + `${infracciones.join('\n')}\n`,
    ).toEqual([]);
  });
});
