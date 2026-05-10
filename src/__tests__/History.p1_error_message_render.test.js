// [P1-HIST-NEW-1 · 2026-05-09] Tests del render de `metrics.error_message`
// en el tab Métricas del modal del Historial.
//
// Bug original (audit profundo Historial 2026-05-09):
//   El endpoint `/{plan_id}/chunk-metrics` (P2-HIST-AUDIT-10) ya
//   devuelve `metrics.error_message` (texto crudo del exception del
//   último intento commiteado a `plan_chunk_metrics`). El frontend
//   renderizaba `dead_letter_reason` (categórico) pero descartaba
//   `error_message` — la pista más directa de "qué falló" quedaba
//   invisible salvo via SQL/admin.
//
// Fix:
//   Render del chip `Error: <truncated>` en el tab Métricas, justo
//   después del `dead_letter_reason` (relacionados conceptualmente).
//   Whitespace+newlines colapsados, truncate visual a 80 chars con
//   ellipsis, texto completo en `title=` tooltip. Palette tierBadgeBad
//   + errorMessageBadge (monospace + max-width) para diferenciar
//   visualmente del badge categórico.
//
// Cobertura:
//   1. Anchor del marker.
//   2. Render condicional: typeof string + trim no vacío.
//   3. Whitespace collapse antes de mostrar.
//   4. Truncate a 80 chars con ellipsis.
//   5. title= tooltip con texto completo (raw).
//   6. Composición de clases (tierBadgeBad + errorMessageBadge).
//   7. Css module declara .errorMessageBadge con monospace + max-width.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const css = readFileSync(_CSS_PATH, 'utf8');


describe('[P1-HIST-NEW-1] anchor + render condicional', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-NEW-1\s*·\s*2026-05-09\]/);
    });

    it('marker presente en History.module.css', () => {
        expect(css).toMatch(/\[P1-HIST-NEW-1\s*·\s*2026-05-09\]/);
    });

    it('lee c.metrics.error_message con typeof check defensivo', () => {
        // typeof === 'string' antes de leer length/trim — sin esto, un
        // payload con error_message=null/number/object rompería el
        // render del tab entero.
        expect(src).toMatch(
            /typeof\s+c\.metrics\.error_message\s*===\s*['"]string['"]/
        );
    });

    it('exige string no vacío post-trim antes de renderizar', () => {
        // `c.metrics.error_message.trim()` debe estar en la condición
        // — un string `"   "` no debería disparar un chip vacío.
        const idx = src.indexOf('c.metrics.error_message');
        const block = src.slice(idx, idx + 1500);
        expect(block).toMatch(/c\.metrics\.error_message\.trim\(\)/);
    });
});


describe('[P1-HIST-NEW-1] sanitización para single-line', () => {
    it('whitespace + newlines colapsados antes de truncar', () => {
        // .replace(/\s+/g, ' ') — sin esto, un exception multi-línea
        // se rompería visualmente y el truncate cortaría a la mitad
        // de un salto de línea.
        const idx = src.indexOf('c.metrics.error_message');
        const block = src.slice(idx, idx + 5000);
        expect(block).toMatch(/replace\(\s*\/\\s\+\/g\s*,\s*['"`] ['"`]\s*\)/);
    });

    it('truncate a 80 chars con ellipsis', () => {
        // length > 80 ? slice(0, 79) + '…' : raw — el chip no debería
        // exceder 80 chars de texto visible.
        const idx = src.indexOf('c.metrics.error_message');
        const block = src.slice(idx, idx + 5000);
        expect(block).toMatch(/length\s*>\s*80/);
        expect(block).toMatch(/slice\(\s*0\s*,\s*79\s*\)/);
        expect(block).toMatch(/['"`]…['"`]/);
    });

    it('title= tooltip con texto completo (raw)', () => {
        // El `title=` debe contener el string completo del error
        // (post-trim) para que el operator pueda copiar el exception
        // hover-and-select sin perder info.
        // [P0-HIST-FIX-9 · 2026-05-09] Tooltip simplificado: solo
        // `_raw` (sin prefijo) — al solo renderizar para failed/
        // pending_user_action, el contexto "error activo" ya está
        // implícito y el prefijo histórico ya no aplica.
        const idx = src.indexOf('c.metrics.error_message');
        const block = src.slice(idx, idx + 5000);
        expect(block).toMatch(/const\s+_raw\s*=\s*c\.metrics\.error_message\.trim\(\)/);
        expect(block).toMatch(/title=\{_raw\}/);
    });
});


describe('[P1-HIST-NEW-1 + P0-HIST-FIX-9] composición de clases', () => {
    it('chip combina tierBadgeBad + errorMessageBadge', () => {
        // [P0-HIST-FIX-9 · 2026-05-09] Tras simplificar a solo
        // render para failed/pending_user_action, el chip siempre
        // es rojo (active error). El _toneClass condicional de
        // FIX-8 se eliminó — solo bad palette.
        const idx = src.indexOf('c.metrics.error_message');
        const block = src.slice(idx, idx + 5000);
        expect(block).toMatch(/styles\.tierBadgeBad/);
        expect(block).toMatch(/styles\.errorMessageBadge/);
    });

    it('renderiza después del badge dead_letter_reason', () => {
        // Orden visual importante: dead_letter_reason (categórico) antes
        // que error_message (raw). Mismo concepto, granularidad creciente.
        const dlr = src.indexOf('c.dead_letter_reason &&');
        const em = src.indexOf('c.metrics.error_message');
        expect(dlr).toBeGreaterThan(-1);
        expect(em).toBeGreaterThan(-1);
        expect(em).toBeGreaterThan(dlr);
    });
});


describe('[P0-HIST-FIX-9] error_message solo render cuando accionable', () => {
    // El usuario reportó que ver "Último error" en chunks en cola/
    // procesando seguía siendo confuso aunque diferenciado por color
    // (P0-HIST-FIX-8). Simplificación: solo mostrar cuando el error
    // bloquea al user (failed / pending_user_action).
    it('marker P0-HIST-FIX-9 presente', () => {
        expect(src).toMatch(/\[P0-HIST-FIX-9\s*·\s*2026-05-09\]/);
    });

    it('declara _shouldShowError = status === failed || pending_user_action', () => {
        const idx = src.indexOf('c.metrics.error_message');
        const block = src.slice(idx, idx + 5000);
        expect(block).toMatch(
            /_shouldShowError\s*=\s*c\.status\s*===\s*['"]failed['"][\s\S]{0,80}?c\.status\s*===\s*['"]pending_user_action['"]/
        );
    });

    it('return null cuando !_shouldShowError', () => {
        // Cubre completed (chunk hecho), pending/processing/stale
        // (cron va a reintentar — error histórico no es accionable).
        const idx = src.indexOf('c.metrics.error_message');
        const block = src.slice(idx, idx + 5000);
        expect(block).toMatch(/if\s*\(\s*!_shouldShowError\s*\)\s*return\s+null/);
    });

    it('NO declara variables del FIX-8 anterior (label condicional)', () => {
        // FIX-8 introdujo _isActiveError/_isCompleted/_toneClass/
        // _tooltipPrefix para diferenciar histórico vs activo. FIX-9
        // simplifica: solo renderizamos en estados activos. Las
        // variables del FIX-8 ya no aplican.
        const idx = src.indexOf('c.metrics.error_message');
        const block = src.slice(idx, idx + 5000);
        expect(block).not.toMatch(/_isActiveError\s*=/);
        expect(block).not.toMatch(/_tooltipPrefix\s*=/);
        // Tampoco hay label "Último error:" (no aplica si solo
        // mostramos active errors).
        expect(block).not.toMatch(/Último error:/);
    });

    it('label simple "Error: <short>" sin condicionales', () => {
        // JSX text content — toleramos whitespace (incluye newlines)
        // entre el `>` de apertura del span y el texto.
        const idx = src.indexOf('c.metrics.error_message');
        const block = src.slice(idx, idx + 5000);
        expect(block).toMatch(/Error:\s*\{_short\}/);
    });
});


describe('[P1-HIST-NEW-1] CSS errorMessageBadge', () => {
    it('declara la clase .errorMessageBadge', () => {
        expect(css).toMatch(/\.errorMessageBadge\s*\{/);
    });

    it('usa font-family monospace', () => {
        const idx = css.indexOf('.errorMessageBadge');
        const block = css.slice(idx, idx + 600);
        // ui-monospace o monospace explícito.
        expect(block).toMatch(/font-family\s*:[^;]*monospace/i);
    });

    it('aplica max-width + overflow ellipsis para truncate visual', () => {
        const idx = css.indexOf('.errorMessageBadge');
        const block = css.slice(idx, idx + 600);
        expect(block).toMatch(/max-width\s*:/);
        expect(block).toMatch(/overflow\s*:\s*hidden/);
        expect(block).toMatch(/text-overflow\s*:\s*ellipsis/);
        expect(block).toMatch(/white-space\s*:\s*nowrap/);
    });
});
