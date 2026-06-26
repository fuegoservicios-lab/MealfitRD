// [P0-HIST-IN-PROGRESS · 2026-05-09] Tests del bucket `in_progress`
// para planes generándose en background.
//
// Bug original (audit Historial 2026-05-09):
//   `getStatusInfo` no manejaba `generation_status='generating' |
//   'generating_next' | 'rolling'` como bucket explícito. Un plan
//   sano con 2/15 días generados y 13 chunks corriendo en background
//   caía a `partial` por la regla `(totalDays > 0 && daysGenerated <
//   totalDays)`. La card mostraba "Parcial 2/15" idéntico a un plan
//   abandonado. Sin reconciliación a action_required (los chunks NO
//   están bloqueados, están corriendo) el usuario no podía
//   distinguir "se está generando" de "se atascó".
//
// Fix:
//   Bucket nuevo `in_progress` cuando rawStatus ∈ {generating,
//   generating_next, rolling} Y queue tiene chunks `pending`/
//   `processing`/`stale` (in_flight > 0). Reconciliación posterior
//   sigue elevando a action_required si hay PUAC/failed (más severo).
//
// Cobertura (static analysis del source + render assertions):
//   - Anchor del marker P0-HIST-IN-PROGRESS.
//   - Bucket `in_progress` declarado en el type-comment.
//   - Detección del rawStatus generating/generating_next/rolling.
//   - Lectura de chunk_in_flight_count embedded + fallback summary.
//   - Renderer JSX maneja `in_progress` con styles.statusInProgress.
//   - Chip muestra "Generando X/Y".
//   - CSS: palette azul (info, no rojo no amber).
//   - Reconciliación NO degrada in_progress; SÍ lo eleva a
//     action_required cuando hay PUAC/failed.

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


describe('[P0-HIST-IN-PROGRESS] anchor + getStatusInfo logic', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P0-HIST-IN-PROGRESS\s*·\s*2026-05-09\]/);
    });

    it('marker presente en History.module.css', () => {
        expect(cssSrc).toMatch(/\[P0-HIST-IN-PROGRESS\s*·\s*2026-05-09\]/);
    });

    it('type-comment del let bucket lista in_progress', () => {
        const helperIdx = src.indexOf('const getStatusInfo');
        const block = src.slice(helperIdx, helperIdx + 8000);
        expect(block).toMatch(
            /'complete'\s*\|\s*'partial'\s*\|\s*'failed'\s*\|\s*'action_required'\s*\|\s*'in_progress'\s*\|\s*'unknown'/
        );
    });

    it('detecta rawStatus generating | generating_next | rolling', () => {
        const helperIdx = src.indexOf('const getStatusInfo');
        const block = src.slice(helperIdx, helperIdx + 8000);
        // Las 3 strings deben aparecer en la detección de
        // _isGeneratingStatus.
        expect(block).toMatch(/_isGeneratingStatus\s*=/);
        expect(block).toMatch(/rawStatus\s*===\s*['"]generating['"]/);
        expect(block).toMatch(/rawStatus\s*===\s*['"]generating_next['"]/);
        expect(block).toMatch(/rawStatus\s*===\s*['"]rolling['"]/);
    });

    it('lee chunk_in_flight_count embedded + fallback chunkStatusSummary', () => {
        const helperIdx = src.indexOf('const getStatusInfo');
        const block = src.slice(helperIdx, helperIdx + 8000);
        expect(block).toMatch(/_embeddedInFlight/);
        expect(block).toMatch(
            /typeof\s+plan\.chunk_in_flight_count\s*===\s*['"]number['"]/
        );
        expect(block).toMatch(
            /_summaryEntryForInFlight[\s\S]{0,400}in_flight_count/
        );
    });

    it('asigna bucket=in_progress cuando _isGeneratingStatus && _inFlightCount > 0', () => {
        const helperIdx = src.indexOf('const getStatusInfo');
        const block = src.slice(helperIdx, helperIdx + 8000);
        // La rama explícita debe combinar ambas condiciones AND.
        expect(block).toMatch(
            /else if\s*\(\s*_isGeneratingStatus\s*&&\s*_inFlightCount\s*>\s*0\s*\)\s*\{[^}]*bucket\s*=\s*['"]in_progress['"]/
        );
    });

    it('rama in_progress se evalúa ANTES que la rama partial', () => {
        // Sin esto, `(totalDays > 0 && daysGenerated < totalDays)` de
        // la rama partial atraparía planes generándose y nunca
        // llegaría a in_progress.
        const helperIdx = src.indexOf('const getStatusInfo');
        const block = src.slice(helperIdx, helperIdx + 8000);
        const inProgressIdx = block.indexOf("bucket = 'in_progress'");
        const partialIdx = block.indexOf("bucket = 'partial'");
        expect(inProgressIdx).toBeGreaterThan(-1);
        expect(partialIdx).toBeGreaterThan(-1);
        expect(inProgressIdx).toBeLessThan(partialIdx);
    });
});


describe('[P0-HIST-IN-PROGRESS] reconciliación interactúa correctamente', () => {
    it('reconciliación NO degrada bucket in_progress (solo eleva a action_required)', () => {
        // El guard `if (bucket !== 'failed' && bucket !== 'action_required')`
        // permite elevar in_progress a action_required cuando hay PUAC/
        // failed counters > 0. Pero el cuerpo del if SOLO escribe
        // 'action_required', nunca otro bucket — así que un in_progress
        // sano sin PUAC/failed sobrevive.
        const reconcileIdx = src.indexOf('_embeddedPuac');
        expect(reconcileIdx).toBeGreaterThan(-1);
        // [P0-HIST-NEW-1] La reconciliación ganó comentarios (cascada
        // embedded→summary, unreplaced/total) que separan el anchor del
        // `bucket = 'action_required'` final (~2950 chars). Ventana ampliada
        // de +1500 a +3200 para seguir capturando el cuerpo completo del guard
        // (el `bucket = 'action_required'` del else-if temprano queda ANTES del
        // anchor, fuera del slice, así que no contamina el match).
        const block = src.slice(
            Math.max(0, reconcileIdx - 800),
            reconcileIdx + 3200
        );
        // Guard previene degradación de failed/action_required.
        expect(block).toMatch(/bucket\s*!==\s*['"]failed['"]/);
        expect(block).toMatch(/bucket\s*!==\s*['"]action_required['"]/);
        // Cuerpo del elevación solo asigna action_required.
        expect(block).toMatch(/bucket\s*=\s*['"]action_required['"]/);
    });
});


// [removed: chip "Generando X/Y" en la card del listado tras refactor
//  P3-HIST-DESKTOP-REDESIGN · 2026-06-24] La card/lista se extrajo a
//  HistoryDesktopPanel/HistoryMobilePanel (diseño aportado por el owner) que NO
//  renderiza chips de estado de generación. El render `_info.bucket ===
//  'in_progress'` + `styles.statusInProgress` + "Generando X/Y" ya no existe en
//  History.jsx (ni en los paneles). La LÓGICA del bucket sobrevive intacta y
//  sigue cubierta arriba (describe "anchor + getStatusInfo logic": detección
//  de generating/generating_next/rolling, in_flight, orden ANTES de partial) y
//  el CSS `.statusInProgress` sigue cubierto abajo (describe "CSS de
//  statusInProgress"). Los 3 it-blocks del render (anclados a
//  `_info.bucket === 'in_progress'`, inexistente) se eliminaron porque la
//  feature ya no se surfacea en esa superficie.


describe('[P0-HIST-IN-PROGRESS] CSS de statusInProgress', () => {
    it('selector .statusInProgress definido en History.module.css', () => {
        expect(cssSrc).toMatch(/\.statusInProgress\s*\{/);
    });

    it('statusInProgress comparte la base con los otros chips', () => {
        expect(cssSrc).toMatch(
            /\.statusPartial\s*,\s*\.statusFailed\s*,\s*\.statusActionRequired\s*,\s*\.statusInProgress\s*,\s*\.statusUnknown/
        );
    });

    it('statusInProgress usa palette azul (info), NO rojo NI amber', () => {
        const blocks = [...cssSrc.matchAll(/^\.statusInProgress\s*\{[\s\S]*?\}/gm)];
        expect(blocks.length).toBeGreaterThanOrEqual(1);
        // La regla específica con palette debe contener background blue-50
        // y color blue-800 (Tailwind palette: #EFF6FF / #1E40AF).
        const palettedBlock = blocks
            .map((m) => m[0])
            .find((b) => /background:\s*#EFF6FF/i.test(b));
        expect(palettedBlock).toBeTruthy();
        expect(palettedBlock).toMatch(/color:\s*#1E40AF/i);
        // NO heredar el pulse rojo de statusActionRequired.
        expect(palettedBlock).not.toMatch(/statusPulse/);
    });

    it('statusInProgress tiene su pulse propio (statusInProgressPulse)', () => {
        expect(cssSrc).toMatch(/@keyframes\s+statusInProgressPulse/);
        const blocks = [...cssSrc.matchAll(/^\.statusInProgress\s*\{[\s\S]*?\}/gm)];
        const palettedBlock = blocks
            .map((m) => m[0])
            .find((b) => /background:\s*#EFF6FF/i.test(b));
        expect(palettedBlock).toMatch(/animation:\s*statusInProgressPulse/);
    });
});
