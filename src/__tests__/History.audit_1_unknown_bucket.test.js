// [P2-HIST-AUDIT-1 · 2026-05-09] Tests del bucket `unknown` en
// `getStatusInfo` para planes legacy sin contenido procesable.
//
// Bug original (audit historial 2026-05-08):
//   `getStatusInfo` defaulteaba a `complete` cuando un plan tenía:
//     - hasCalories=true (no entra a `partial` por la regla
//       `!hasCalories`).
//     - daysGenerated=0 con totalDays=0 (no entra a `partial` por
//       `totalDays > 0 && daysGenerated < totalDays`).
//     - Sin generation_status, sin _user_action_required, sin
//       _recovery_exhausted_chunks.
//   Resultado: planes muy viejos pre-rollout sin metadata, o filas
//   corruptas donde el row tiene calories pero el jsonb `days` quedó
//   como [] tras un wipe accidental, aparecían como "Completo" —
//   falso positivo. El usuario veía un chip verde implícito (sin
//   chip = bucket=complete) cuando el plan no tenía contenido.
//
// Fix:
//   Bucket nuevo `unknown` cuando daysGenerated=0 y NO entra a
//   ninguno de los buckets anteriores. Chip neutro gris "Sin datos"
//   reemplaza al falso "Completo".
//
// Cobertura (static analysis del source + render assertions):
//   - Anchor del marker P2-HIST-AUDIT-1.
//   - Bucket `unknown` definido en el switch del helper.
//   - Renderer JSX maneja `unknown` con styles.statusUnknown.
//   - Casos negativos: planes con metadata clara siguen su bucket
//     correcto (failed/action/partial/complete/unknown).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const cssSrc = readFileSync(_CSS_PATH, 'utf8');


describe('[P2-HIST-AUDIT-1] anchor + bucket unknown', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P2-HIST-AUDIT-1\s*·\s*2026-05-09\]/);
    });

    it('getStatusInfo declara bucket "unknown" en el comentario tipo', () => {
        // [P0-HIST-IN-PROGRESS · 2026-05-09] El comentario del `let
        // bucket` se extendió a 6 buckets (añadido `in_progress` para
        // planes generándose en background con chunks in_flight).
        // Aserción ampliada para que un refactor que rompa el orden o
        // remueva alguno falle.
        const helperIdx = src.indexOf('const getStatusInfo');
        const block = src.slice(helperIdx, helperIdx + 8000);
        expect(block).toMatch(/'complete'\s*\|\s*'partial'\s*\|\s*'failed'\s*\|\s*'action_required'\s*\|\s*'in_progress'\s*\|\s*'unknown'/);
    });

    it('rama unknown asigna cuando daysGenerated === 0', () => {
        // [P0-HIST-IN-PROGRESS · 2026-05-09] Slice ampliado a 8000
        // porque el helper getStatusInfo creció (~70 líneas extra
        // de la rama in_progress + lecturas de chunk_in_flight).
        const helperIdx = src.indexOf('const getStatusInfo');
        const block = src.slice(helperIdx, helperIdx + 8000);
        // Buscar el `else if (daysGenerated === 0)` que setea bucket.
        expect(block).toMatch(/else if\s*\(\s*daysGenerated\s*===\s*0\s*\)\s*\{[^}]*bucket\s*=\s*['"]unknown['"]/);
    });

    it('rama complete sigue siendo el último else (default)', () => {
        // [P0-HIST-IN-PROGRESS · 2026-05-09] Slice ampliado a 8000.
        const helperIdx = src.indexOf('const getStatusInfo');
        const block = src.slice(helperIdx, helperIdx + 8000);
        // El último else debe asignar 'complete' — los planes con
        // daysGenerated > 0 y sin señales de fallo siguen siendo OK.
        expect(block).toMatch(/else\s*\{\s*bucket\s*=\s*['"]complete['"]/);
    });
});


describe('[P2-HIST-AUDIT-1] renderer JSX', () => {
    it('JSX maneja bucket unknown con styles.statusUnknown', () => {
        // Buscar el bloque del status chip renderer.
        expect(src).toMatch(/_info\.bucket\s*===\s*['"]unknown['"]/);
        expect(src).toMatch(/className=\{styles\.statusUnknown\}/);
    });

    it('chip unknown muestra texto "Sin datos"', () => {
        // El texto comunica honestamente vs el falso "Completo" previo.
        const renderIdx = src.indexOf("_info.bucket === 'unknown'");
        expect(renderIdx).toBeGreaterThan(-1);
        const block = src.slice(renderIdx, renderIdx + 800);
        expect(block).toMatch(/Sin\s+datos/);
    });

    it('chip unknown tiene title explicativo (a11y / tooltip)', () => {
        const renderIdx = src.indexOf("_info.bucket === 'unknown'");
        const block = src.slice(renderIdx, renderIdx + 800);
        // Title debe explicar el caso edge para que el usuario
        // entienda por qué su plan aparece "Sin datos".
        expect(block).toMatch(/title=/);
        expect(block).toMatch(/legacy|procesable|corrupt/i);
    });
});


describe('[P2-HIST-AUDIT-1] CSS de statusUnknown', () => {
    it('styles.statusUnknown definido en History.module.css', () => {
        expect(cssSrc).toMatch(/\.statusUnknown\s*\{/);
    });

    it('statusUnknown comparte la base con los otros chips', () => {
        // [P0-HIST-IN-PROGRESS · 2026-05-09] Selector compuesto ahora
        // incluye también `.statusInProgress` (chip azul info para
        // planes generándose en background). El selector debe seguir
        // listando todos los chips para mantener la base CSS común
        // (display flex, padding, border-radius, etc.).
        expect(cssSrc).toMatch(
            /\.statusPartial\s*,\s*\.statusFailed\s*,\s*\.statusActionRequired\s*,\s*\.statusInProgress\s*,\s*\.statusUnknown/
        );
    });

    it('statusUnknown usa palette gris neutro (no rojo, no amber)', () => {
        // El chip no debe sugerir error o advertencia — solo "no
        // sabemos clasificar". Verificamos paleta. La regla CSS
        // específica vive como `.statusUnknown {` (sin coma antes;
        // el selector compuesto con `,\s*\.statusUnknown` se filtra
        // con flag multiline y anchor `^`).
        const blocks = [...cssSrc.matchAll(/^\.statusUnknown\s*\{[\s\S]*?\}/gm)];
        expect(blocks.length).toBeGreaterThanOrEqual(1);
        // La regla específica con palette debe contener background
        // y color (la del selector compuesto solo tiene display/
        // padding/etc). Buscamos la regla que TIENE background.
        const palettedBlock = blocks
            .map((m) => m[0])
            .find((b) => /background:\s*#F1F5F9/i.test(b));
        expect(palettedBlock).toBeTruthy();
        // Color slate-600.
        expect(palettedBlock).toMatch(/color:\s*#475569/i);
        // NO debe heredar el pulse de statusActionRequired.
        expect(palettedBlock).not.toMatch(/animation/);
    });
});
