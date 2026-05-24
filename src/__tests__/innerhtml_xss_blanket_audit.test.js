// [P0-PROD-AUDIT-1 · 2026-05-23] Blanket audit: cada asignación
// `element.innerHTML = X` (o `.innerHTML += X`) en `src/` debe tener
// un marker `[*-XSS-AUDITED: <razón>]` en las 30 líneas anteriores, O
// estar en el allowlist explícito abajo.
//
// Gap original (audit production-readiness 2026-05-23, F-P0-4):
//   `Dashboard.jsx:1846` hace `element.innerHTML = htmlContent` para el
//   PDF de la lista de compras. El `htmlContent` se construye con template
//   literals interpolando datos del LLM (Gemini) y del formulario. La
//   sanitización vía `escapeHtml(...)` está aplicada en todos los call
//   sites — auditoría inline marker `[P1-PDF-XSS-AUDITED: ...]` lo documenta.
//
//   Pero NO existía un guard que enforzara este contrato para FUTUROS
//   call sites de `innerHTML`. Un refactor lateral o una nueva feature
//   podría introducir `element.innerHTML = userInput` sin sanitización
//   → XSS silencioso.
//
// Fix:
//   Este test escanea TODO src/ buscando `\.innerHTML\s*=|innerHTML\s*\+=`
//   y para cada match valida:
//     (a) Hay marker `[<PREFIX>-XSS-AUDITED: <razón>]` en las 30 líneas
//         previas (e.g. `[P1-PDF-XSS-AUDITED: ...]`,
//         `[P0-PROD-AUDIT-1-XSS-AUDITED: ...]`).
//     (b) OR el match está en `dangerouslySetInnerHTML` (React idiom
//         estándar — react-markdown + rehype-sanitize ya sanitizan).
//     (c) OR el archivo está en `ALLOWLIST_FILES` con razón.
//
// Si un nuevo call site aparece sin (a/b/c), el test FALLA loud con la
// ubicación + opciones para arreglar.
//
// Por qué blanket (no fix puntual):
//   El audit puntual cierra UNA línea (Dashboard.jsx:1846). El blanket
//   cierra TODAS las futuras. Es la misma estrategia que P0-AGENT-1
//   (override generic de `user_id` en agent tools) y P1-NEW-A (test
//   blanket frontend no escribe directo a meal_plans) — defensa
//   estructural en lugar de defensa puntual.
//
// Tooltip-anchor: P0-PROD-AUDIT-1-INNERHTML-BLANKET | audit 2026-05-23.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _SRC_ROOT = join(__dirname, '..');

// Files que pueden tener `.innerHTML` legítimamente sin marker porque
// es un helper que TRANSFORMA (no asigna) — e.g. usar `el.innerHTML`
// como source de truth para extraer texto. Cada entry debe tener razón
// explicada en el comment.
const ALLOWLIST_FILES = new Set([
    // (vacío al momento de la creación — añadir solo con razón clara y
    // revisión en PR. Cada exempt aquí es deuda implícita.)
]);

const REQUIRED_MARKER_PATTERN = /\[[A-Z0-9_-]+-XSS-AUDITED\s*:[^\]]+\]/;
const INNERHTML_ASSIGN_PATTERN = /\.innerHTML\s*[+]?=(?!=)/;
// `dangerouslySetInnerHTML={{ __html: ... }}` es la idiomática React.
// Validamos que el `__html` value pase por sanitización (escapeHtml,
// DOMPurify, react-markdown+rehype-sanitize). Out of scope blanket
// — react-markdown ya impone sanitize plugin si está configurado.
// Acá solo enforzamos `element.innerHTML = X` directo.

const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const IGNORED_DIRS = new Set(['__tests__', 'node_modules', '__snapshots__']);

function walkDir(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            if (IGNORED_DIRS.has(entry)) continue;
            out.push(...walkDir(full));
        } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
            out.push(full);
        }
    }
    return out;
}

function findInnerHTMLAssigns(filePath, content) {
    const lines = content.split('\n');
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments y strings que mencionen "innerHTML" como contexto.
        // Heurística: solo matchear si el line es código (no `*` prefix ni
        // `//` prefix antes del match).
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
        if (INNERHTML_ASSIGN_PATTERN.test(line)) {
            // Reduce false positives: la regex matchea `.innerHTML =` o `+=`.
            // Excluir patrones que NO son asignación real:
            //   - `el.innerHTML === 'x'` (comparison, ya excluido por `(?!=)`)
            //   - `obj.innerHTML.replace(...)` (read, no assign — excluir)
            // Validar que `=` no esté seguido de `=` (lookahead).
            matches.push({ lineIdx: i, line });
        }
    }
    return matches;
}

function hasMarkerInPreviousLines(content, lineIdx, windowSize = 30) {
    const lines = content.split('\n');
    const start = Math.max(0, lineIdx - windowSize);
    const window = lines.slice(start, lineIdx + 1).join('\n');
    return REQUIRED_MARKER_PATTERN.test(window);
}

describe('P0-PROD-AUDIT-1: blanket XSS audit de innerHTML', () => {
    it('scan baseline: encuentra al menos 1 callsite de innerHTML conocido', () => {
        const files = walkDir(_SRC_ROOT);
        let total = 0;
        for (const file of files) {
            const content = readFileSync(file, 'utf8');
            total += findInnerHTMLAssigns(file, content).length;
        }
        // Sanity: si el scan no encuentra Dashboard.jsx:1846 conocido,
        // probable que la regex se rompió o el scan camina el dir
        // equivocado.
        expect(
            total,
            'Scan no encontró ningún `innerHTML =` en src/. Probable que la ' +
            'regex se rompió o el scan camine el dir equivocado. Validar ' +
            'que Dashboard.jsx aún tiene `element.innerHTML = htmlContent`.'
        ).toBeGreaterThanOrEqual(1);
    });

    it('cada innerHTML assign tiene marker XSS-AUDITED o está en allowlist', () => {
        const files = walkDir(_SRC_ROOT);
        const violations = [];

        for (const file of files) {
            const content = readFileSync(file, 'utf8');
            const matches = findInnerHTMLAssigns(file, content);
            if (matches.length === 0) continue;

            const relPath = relative(_SRC_ROOT, file);
            if (ALLOWLIST_FILES.has(relPath)) continue;

            for (const { lineIdx, line } of matches) {
                if (!hasMarkerInPreviousLines(content, lineIdx)) {
                    violations.push({
                        file: relPath,
                        line: lineIdx + 1, // 1-indexed
                        snippet: line.trim().slice(0, 120),
                    });
                }
            }
        }

        if (violations.length > 0) {
            const detail = violations
                .map(
                    (v) =>
                        `  - src/${v.file}:${v.line}\n      ${v.snippet}`,
                )
                .join('\n');
            const msg =
                `\n[P0-PROD-AUDIT-1] ${violations.length} asignación(es) ` +
                `de innerHTML sin marker XSS-AUDITED en las 30 líneas previas:\n\n` +
                detail +
                `\n\nOpciones para arreglar:\n` +
                `  (a) Añadir comentario \`// [<PREFIX>-XSS-AUDITED: <razón>]\`\n` +
                `      en las 30 líneas antes del innerHTML assign. La razón\n` +
                `      debe explicar QUE sanitización aplica (e.g. escapeHtml\n` +
                `      en todo template literal interpolation, o DOMPurify\n` +
                `      sobre input externo).\n` +
                `  (b) Refactorizar a \`element.textContent = ...\` (no\n` +
                `      ejecuta markup, seguro por construcción).\n` +
                `  (c) Si es React idiom: usar \`dangerouslySetInnerHTML\`\n` +
                `      con sanitización explícita (react-markdown +\n` +
                `      rehype-sanitize, o DOMPurify).\n` +
                `  (d) Si es legítimamente exempt (helper de read-only,\n` +
                `      test fixture), añadir a \`ALLOWLIST_FILES\` con razón.\n`;
            throw new Error(msg);
        }

        // PASS: documentar el snapshot actual para visibilidad en CI logs.
        expect(violations.length).toBe(0);
    });

    it('regex de marker tolera variaciones de prefix', () => {
        // Smoke del pattern para evitar drift silencioso. Si esto falla,
        // el pattern se rompió y violations falsas pasarían.
        const samples = [
            '[P1-PDF-XSS-AUDITED: htmlContent compuesto con escapeHtml]',
            '[P0-PROD-AUDIT-1-XSS-AUDITED: react-markdown wrappea sanitize]',
            '[FUTURE-X-XSS-AUDITED: razón]',
        ];
        for (const s of samples) {
            expect(REQUIRED_MARKER_PATTERN.test(s)).toBe(true);
        }
        // Negative: marker sin razón debe fallar.
        expect(REQUIRED_MARKER_PATTERN.test('[X-XSS-AUDITED]')).toBe(false);
        // Negative: marker con prefix wrong debe fallar.
        expect(REQUIRED_MARKER_PATTERN.test('[X-AUDITED: razón]')).toBe(false);
    });
});
