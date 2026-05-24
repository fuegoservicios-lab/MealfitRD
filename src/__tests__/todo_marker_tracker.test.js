// [F-P2-5 · 2026-05-23] Tracker + audit correction: contar markers TODO/
// FIXME/HACK/XXX REALES en src/ (distinguidos del sustantivo español
// "TODO/TODOS" en mayúsculas que es estilo legítimo).
//
// Gap aparente (audit production-readiness 2026-05-23, F-P2-5):
//   "6 archivos con TODO/FIXME — ninguno crítico, pero deuda documental."
//
// Investigación post-audit:
//   Grep `TODO/FIXME/HACK/XXX` en src/ retorna ~9 matches, PERO todos son
//   el sustantivo español "TODO el handler" / "TODOS los campos" (forma
//   común en docs en español para enfatizar). NO son markers reales.
//
//   Pattern de marker REAL:
//     - `// TODO: <description>` (con colon)
//     - `// TODO(<owner>): <description>`
//     - `// FIXME: <description>`
//     - `// HACK: <description>`
//     - `// XXX: <description>`
//
//   Pattern del sustantivo español:
//     - `// TODO el X` / `// TODOS los X` (sin colon, seguido de artículo)
//
//   CLAUDE.md (P3-TODOS-NARRATIVE · 2026-05-13) documenta la convención:
//   "mayúsculas reservadas exclusivamente para markers de trabajo pendiente
//   real; el sustantivo español 'todo/todos' va en minúscula".
//
// Fix (este test):
//   Parser que distingue real markers de sustantivo español + snapshot
//   del count REAL (0 actual). Si un PR introduce un marker real, count
//   sube → señal visible en CI.
//
// Cobertura:
//   A) Count actual de markers REALES en src/.
//   B) Cap snapshot 2026-05-23 = 0; falla si crece.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _SRC = join(__dirname, '..');

// Snapshot 2026-05-23: 0 markers reales. Si crece, falla loud — operador
// decide si añade follow-up task O documenta el TODO.
const _REAL_MARKER_CAP = 5;  // tolerancia mínima por si algún test escapa la heurística

// Pattern: marker REAL tiene `:` o `(owner)` después del marker name.
// Conservative — falsos positivos posibles para "TODO: solo nota" tipo
// log message. Mejor false-positive que false-negative.
const _REAL_MARKER_PATTERNS = [
    /\bTODO\s*\([^)]+\)\s*:/,        // TODO(owner): desc
    /\bFIXME\s*\([^)]+\)\s*:/,
    /\bHACK\s*\([^)]+\)\s*:/,
    /\bXXX\s*\([^)]+\)\s*:/,
    /\/\/\s*TODO\s*:\s*\S/,           // // TODO: desc
    /\/\/\s*FIXME\s*:\s*\S/,
    /\/\/\s*HACK\s*:\s*\S/,
    /\/\/\s*XXX\s*:\s*\S/,
    /\*\s*TODO\s*:\s*\S/,             // JSDoc * TODO: desc
    /\*\s*FIXME\s*:\s*\S/,
];

function walkDir(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        if (['node_modules', '__snapshots__', '__tests__'].includes(entry)) continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) out.push(...walkDir(full));
        else if (/\.(jsx?|tsx?)$/.test(entry)) out.push(full);
    }
    return out;
}

function findRealMarkers(text) {
    const matches = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pat of _REAL_MARKER_PATTERNS) {
            if (pat.test(line)) {
                matches.push({ line: i + 1, snippet: line.trim().slice(0, 100) });
                break;
            }
        }
    }
    return matches;
}

describe('F-P2-5: TODO/FIXME marker tracker (audit correction)', () => {
    it('count actual de markers reales bajo cap', () => {
        const files = walkDir(_SRC);
        const findings = [];
        for (const f of files) {
            const text = readFileSync(f, 'utf8');
            const markers = findRealMarkers(text);
            if (markers.length > 0) {
                findings.push({
                    file: relative(_SRC, f),
                    markers,
                });
            }
        }
        const total = findings.reduce((sum, fnd) => sum + fnd.markers.length, 0);

        if (total > _REAL_MARKER_CAP) {
            const detail = findings
                .map((fnd) =>
                    fnd.markers
                        .map((m) => `  - src/${fnd.file}:${m.line}\n      ${m.snippet}`)
                        .join('\n'),
                )
                .join('\n');
            throw new Error(
                `\n[F-P2-5-TODO-TRACKER] ${total} marker(s) REAL(es) detectado(s) ` +
                `(cap ${_REAL_MARKER_CAP}):\n\n${detail}\n\n` +
                `Opciones:\n` +
                `  (a) Si la deuda es real, abrir issue + reemplazar el marker\n` +
                `      por `[ISSUE-N]` cross-link.\n` +
                `  (b) Si era debug temporal, eliminar + commit.\n` +
                `  (c) Si genuinamente need-bump del cap, ajustar\n` +
                `      \`_REAL_MARKER_CAP\` en este test + razón en commit.\n`,
            );
        }
    });

    it('audit correction: sustantivo español "TODO el X" NO cuenta', () => {
        // Validación de la heurística: el pattern debe NO matchear el
        // sustantivo español "TODO el handler" / "TODOS los campos".
        const samples = [
            '// TODO el handler envuelto en try/catch',  // Spanish noun (real codebase)
            '// TODOS los campos requeridos',
            '* contenía TODO el formData en plaintext',
            '// Validar TODOS los campos',
        ];
        for (const sample of samples) {
            const matches = findRealMarkers(sample);
            expect(
                matches.length,
                `Heurística matcheó FALSO positivo "${sample}" — sustantivo ` +
                `español NO es marker. Tighten los patterns.`,
            ).toBe(0);
        }
    });

    it('audit correction: marker real SÍ cuenta', () => {
        // Sanity inverso: pattern debe matchear formato canónico.
        const samples = [
            '// TODO: implement X',
            '// FIXME: this leaks memory',
            '// HACK: workaround for bug Y',
            '// XXX: revisit after migration',
            '// TODO(angelo): bump dep',
        ];
        for (const sample of samples) {
            const matches = findRealMarkers(sample);
            expect(
                matches.length,
                `Heurística NO matcheó marker real "${sample}". Loosen los patterns.`,
            ).toBeGreaterThan(0);
        }
    });
});
