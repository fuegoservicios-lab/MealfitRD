// [P2-HIST-AUDIT-A · 2026-05-09] Batch frontend tests para los 6 P2
// del audit Historial 2026-05-09:
//
//   A. Cache-Control no-store en endpoints derivados (backend-only).
//   B. expected_preemption_seconds + reservation_status en chunk-metrics.
//   C. shift_days_accumulated chip en cardActions.
//   D. lessons quality split en tooltip del chip.
//   E. is_rolling_refill_drift chip warn en tab Métricas.
//   F. blocking_lock chip warn en tab Métricas (lock zombi).

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


describe('[P2-HIST-AUDIT-B] expected_preemption + reservation_status render', () => {
    it('marker presente', () => {
        expect(src).toMatch(/\[P2-HIST-AUDIT-B\s*·\s*2026-05-09\]/);
    });

    it('chip SLA aparece cuando expected_preemption_seconds > 0', () => {
        // Buscamos el chip dedicado al SLA. Anchor único: `c.expected_preemption_seconds`.
        const idx = src.indexOf('c.expected_preemption_seconds');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, idx - 200), idx + 800);
        expect(block).toMatch(/c\.expected_preemption_seconds\s*>\s*0/);
        expect(block).toMatch(/SLA:/);
    });

    it('chip Reserva: fallback con tierBadgeWarn', () => {
        const idx = src.indexOf("c.reservation_status === 'fallback'");
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 600);
        expect(block).toMatch(/Reserva:\s*fallback/);
        expect(block).toMatch(/styles\.tierBadgeWarn/);
    });
});


describe('[P2-HIST-AUDIT-C] shift_days_accumulated chip', () => {
    // [removed: it('marker presente') + it('chip aparece cuando
    //  shift_days_accumulated != 0') tras refactor UI — el chip de días
    //  acumulados por shift_plan ya NO se renderiza en la card de History.jsx.
    //  Confirmado por grep whole-file: ni el marker [P2-HIST-AUDIT-C] ni
    //  `plan.shift_days_accumulated`/`shiftDaysBadge` aparecen en History.jsx.
    //  La clase CSS .shiftDaysBadge quedó huérfana pero presente — su paleta
    //  slate se sigue verificando abajo.]
    it('CSS shiftDaysBadge palette slate (neutral, no warn)', () => {
        const blockMatch = cssSrc.match(/\.shiftDaysBadge\s*\{[\s\S]*?\}/);
        expect(blockMatch).toBeTruthy();
        expect(blockMatch[0]).toMatch(/background:\s*#F1F5F9/i);
        expect(blockMatch[0]).toMatch(/color:\s*#475569/i);
    });
});


describe('[P2-HIST-AUDIT-D] lessons quality split en tooltip', () => {
    it('marker presente', () => {
        expect(src).toMatch(/\[P2-HIST-AUDIT-D\s*·\s*2026-05-09\]/);
    });

    it('state lessonsCountsByQuality declarado', () => {
        expect(src).toMatch(
            /const\s*\[\s*lessonsCountsByQuality\s*,\s*setLessonsCountsByQuality\s*\]\s*=\s*useState/
        );
    });

    it('useEffect hidrata el split desde body.counts_by_quality', () => {
        const idx = src.indexOf('counts_by_quality');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, idx - 300), idx + 600);
        expect(block).toMatch(/setLessonsCountsByQuality/);
    });

    // [removed: it('tooltip enriquecido cuando hay split por tier') tras refactor
    //  UI — el chip "X lecciones" con tooltip de split por calidad ya NO se
    //  renderiza en la card de History.jsx (grep whole-file: `lessonsBadge` y
    //  `lessonsCountsByQuality[plan.id]` ausentes). El state lessonsCountsByQuality
    //  y su hidratación desde body.counts_by_quality SIGUEN presentes (tests
    //  arriba) — el dato se sigue trayendo del backend; el detalle de lecciones
    //  por plan vive ahora en el tab "Lecciones" del modal, no en un tooltip de
    //  la card.]
});


describe('[P2-HIST-AUDIT-E] is_rolling_refill_drift chip', () => {
    it('marker presente', () => {
        expect(src).toMatch(/\[P2-HIST-AUDIT-E\s*·\s*2026-05-09\]/);
    });

    it('chip "Kind drift" aparece solo si drift === true', () => {
        const idx = src.indexOf('c.is_rolling_refill_drift');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 800);
        // Triple-equals strict — solo true literal, no truthy random.
        expect(block).toMatch(/c\.is_rolling_refill_drift\s*===\s*true/);
        expect(block).toMatch(/Kind drift/);
        expect(block).toMatch(/styles\.tierBadgeWarn/);
    });
});


describe('[P2-HIST-AUDIT-F] blocking_lock zombi chip', () => {
    it('marker presente', () => {
        expect(src).toMatch(/\[P2-HIST-AUDIT-F\s*·\s*2026-05-09\]/);
    });

    it('chip "Lock zombi" aparece cuando blocking_lock_chunk_id non-empty', () => {
        // Anchor extendido hacia atrás para capturar el `typeof`
        // que precede a `c.blocking_lock_chunk_id`.
        const idx = src.indexOf('c.blocking_lock_chunk_id');
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, idx - 50), idx + 1200);
        // Type guard string + length > 0 (no string vacío).
        expect(block).toMatch(/typeof\s+c\.blocking_lock_chunk_id\s*===\s*['"]string['"]/);
        expect(block).toMatch(/c\.blocking_lock_chunk_id\.length\s*>\s*0/);
        expect(block).toMatch(/Lock zombi/);
        expect(block).toMatch(/styles\.tierBadgeWarn/);
    });

    it('tooltip incluye chunk_id truncado + age en segundos', () => {
        const idx = src.indexOf('c.blocking_lock_chunk_id');
        const block = src.slice(idx, idx + 1500);
        // Truncate del UUID a primeros 8 chars.
        expect(block).toMatch(/c\.blocking_lock_chunk_id\.slice\(0,\s*8\)/);
        expect(block).toMatch(/c\.blocking_lock_age_seconds/);
    });
});
