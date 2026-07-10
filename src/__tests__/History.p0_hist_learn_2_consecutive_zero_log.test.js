// [P0-HIST-LEARN-2 · 2026-05-09] Render del counter
// `_consecutive_zero_log_chunks` en el modal del Historial (header
// del lifetime block) y en la card del listado.
//
// Bug original (audit Historial 2026-05-09 · gap P0):
//   El counter dispara push notification con copy alarmante a partir
//   de ≥3 ("Tu plan se está generando sin tu feedback") + flip de
//   generation_status a 'degraded_pending_engagement' (cron_tasks.py:
//   17487). Pero el modal del Historial no lo surfaceaba — un user
//   que recibió el push no podía verificar retroactivamente "¿este
//   plan se generó sin mi feedback?". Plan real 98d902e3 tiene el
//   counter = 1, completamente invisible.
//
// Fix:
//   Chip en el header del lifetime block del modal + chip en la card
//   del listado. Severity tiered:
//     - 1-2 chunks: zeroLogBadgeInfo (slate neutral).
//     - ≥3 chunks O generation_status='degraded_pending_engagement':
//       zeroLogBadgeAlarm (rojo).
//
// Cobertura (static analysis del source):
//   - Marker en History.jsx + History.module.css.
//   - Normalizer del fetch acepta consecutive_zero_log_chunks +
//     generation_status con default null.
//   - _hasContent extiende para counter > 0 (plan con counter pero
//     sin lifetime aggregates DEBE renderizar el header + chip).
//   - Header chip: alarming (≥3 O degraded) vs info (1-2).
//   - Card chip: misma lógica de severity.
//   - CSS: 2 clases dedicadas (info / alarm) con palettes distintas.

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


describe('[P0-HIST-LEARN-2] anchors', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P0-HIST-LEARN-2\s*·\s*2026-05-09\]/);
    });

    it('marker presente en History.module.css', () => {
        expect(cssSrc).toMatch(/\[P0-HIST-LEARN-2\s*·\s*2026-05-09\]/);
    });
});


describe('[P0-HIST-LEARN-2] normalizer del _ensureLifetimeLessons', () => {
    it('normalizer acepta consecutive_zero_log_chunks con default null', () => {
        const helperIdx = src.indexOf('_ensureLifetimeLessons');
        expect(helperIdx).toBeGreaterThan(-1);
        const block = src.slice(helperIdx, helperIdx + 5000);
        expect(block).toMatch(/consecutive_zero_log_chunks:/);
        expect(block).toMatch(/typeof\s+payload\.consecutive_zero_log_chunks\s*===\s*['"]number['"]/);
    });

    it('normalizer acepta generation_status con default null', () => {
        const helperIdx = src.indexOf('_ensureLifetimeLessons');
        const block = src.slice(helperIdx, helperIdx + 5000);
        expect(block).toMatch(/generation_status:/);
        expect(block).toMatch(/typeof\s+payload\.generation_status\s*===\s*['"]string['"]/);
    });
});


describe('[P0-HIST-LEARN-2] guard _hasContent extiende para counter > 0', () => {
    it('_hasContent incluye `_czl !== null && _czl > 0`', () => {
        // Sin esta extensión, un plan con counter alarmante pero sin
        // lifetime aggregates (todos los chunks corrieron sin signal,
        // sin lecciones que sintetizar) tendría _hasContent=false y
        // el chip del header NUNCA aparecería.
        // Ancla por la lógica (el comentario inline puede variar):
        const fallbackIdx = src.indexOf('_czl !== null && _czl > 0');
        expect(fallbackIdx).toBeGreaterThan(-1);
    });
});


describe('[P0-HIST-LEARN-2] chip en header del lifetime block', () => {
    it('cómputo de _zeroLogAlarming considera ≥3 OR degraded_pending_engagement', () => {
        // El chip alarm aparece por DOS condiciones: counter ≥3 O
        // generation_status='degraded_pending_engagement'. Ambas son
        // señales independientes — el cron flippea status al cruzar
        // el threshold pero un plan podría tener status degraded por
        // otra razón (todavía el frontend debe escalar el chip).
        const anchorIdx = src.indexOf('_zeroLogAlarming');
        expect(anchorIdx).toBeGreaterThan(-1);
        const block = src.slice(anchorIdx, anchorIdx + 600);
        expect(block).toMatch(/_czl\s*>=\s*3/);
        expect(block).toMatch(/degraded_pending_engagement/);
    });

    it('cómputo de _zeroLogInfo: counter > 0 pero NO alarming', () => {
        const anchorIdx = src.indexOf('_zeroLogInfo');
        expect(anchorIdx).toBeGreaterThan(-1);
        const block = src.slice(anchorIdx, anchorIdx + 400);
        expect(block).toMatch(/_czl\s*>\s*0/);
        expect(block).toMatch(/!_zeroLogAlarming/);
    });

    it('JSX del chip alarming usa zeroLogBadgeAlarm', () => {
        // El chip alarming aparece DENTRO del lifetimeLessonsHeader
        // (junto al Sparkles + label + Proxy badge si aplica).
        const headerIdx = src.indexOf('lifetimeLessonsHeader');
        expect(headerIdx).toBeGreaterThan(-1);
        const block = src.slice(headerIdx, headerIdx + 4000);
        expect(block).toMatch(/_zeroLogAlarming\s*&&[\s\S]{0,500}zeroLogBadgeAlarm/);
        expect(block).toMatch(/Sin feedback:/);
    });

    it('JSX del chip info usa zeroLogBadgeInfo', () => {
        const headerIdx = src.indexOf('lifetimeLessonsHeader');
        const block = src.slice(headerIdx, headerIdx + 4000);
        expect(block).toMatch(/_zeroLogInfo\s*&&[\s\S]{0,500}zeroLogBadgeInfo/);
    });
});


// [removed: chip "Sin feedback: N" en la card del listado tras refactor
//  P3-HIST-DESKTOP-REDESIGN · 2026-06-24] La card/lista del Historial se
//  extrajo a HistoryDesktopPanel/HistoryMobilePanel (diseño aportado por el
//  owner) que NO renderiza chips de estado de generación —
//  `plan.consecutive_zero_log_chunks` ya no se surfacea en la fila. El chip
//  "Sin feedback" SOLO vive ahora en el header del modal (describe "chip en
//  header del lifetime block", arriba, anclado a `_zeroLogAlarming`/
//  `_zeroLogInfo` + `zeroLogBadgeAlarm`/`zeroLogBadgeInfo`), que sigue cubierto.
//  Los 3 it-blocks de la card (anclados a `plan.consecutive_zero_log_chunks`,
//  inexistente en el render actual) se eliminaron porque la feature ya no
//  existe en esa superficie.


describe('[P0-HIST-LEARN-2] CSS del chip', () => {
    it('clase .zeroLogBadgeInfo declarada (palette slate neutral)', () => {
        const match = cssSrc.match(/\.zeroLogBadgeInfo\s*\{[\s\S]*?\}/);
        expect(match).toBeTruthy();
        // Slate background coherente con shiftDaysBadge.
        expect(match[0]).toMatch(/#F1F5F9/);
        expect(match[0]).toMatch(/#475569/);
    });

    it('clase .zeroLogBadgeAlarm declarada (palette rojo escalado)', () => {
        const match = cssSrc.match(/\.zeroLogBadgeAlarm\s*\{[\s\S]*?\}/);
        expect(match).toBeTruthy();
        // Rojo bg + foreground oscuro distinto al ámbar de pantryDegraded
        // para diferenciar las dos señales visualmente.
        expect(match[0]).toMatch(/#FEF2F2/);
        expect(match[0]).toMatch(/#991B1B/);
    });

    it('mismo shape geométrico que pantryDegradedBadge / shiftDaysBadge', () => {
        // border-radius 99px + padding consistente para que la fila
        // de chips tenga ritmo visual uniforme.
        const info = cssSrc.match(/\.zeroLogBadgeInfo\s*\{[\s\S]*?\}/)[0];
        const alarm = cssSrc.match(/\.zeroLogBadgeAlarm\s*\{[\s\S]*?\}/)[0];
        for (const m of [info, alarm]) {
            expect(m).toMatch(/border-radius:\s*99px/);
            expect(m).toMatch(/padding:\s*0\.35rem\s+0\.7rem/);
        }
    });
});
