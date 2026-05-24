// [F-P1-6 · 2026-05-23] Aclaración de gap mal-categorizado en audit
// production-readiness 2026-05-23.
//
// Gap aparente (audit F-P1-6):
//   "`prop-types` declarado pero nunca usado — sin validación runtime ni
//    TypeScript. Sin uso real, deuda de tipo."
//
// Investigación post-audit (2026-05-23):
//   El audit fue INCORRECTO. Grep cross-codebase muestra que `prop-types`
//   ESTÁ EN USO en al menos 2 componentes:
//     - src/components/assessment/InteractiveAssessmentLayout.jsx
//       (4 propTypes declaradas: children, totalSteps, title, subtitle)
//     - src/components/common/FormUI.jsx
//       (4 declaraciones para Label/Input/Select/TextArea)
//
// Decisión documentada (este test):
//   `prop-types` NO se elimina. Se mantiene como dep activa porque:
//     (a) Los componentes que la usan son del flow crítico (Assessment
//         es el form principal del usuario nuevo; FormUI es la lib
//         compartida de form widgets).
//     (b) Migración a TypeScript es decisión separada (P3-TYPESCRIPT-DEFERRED
//         si se decide algún día). Mientras tanto prop-types da
//         validación runtime en dev (silenciada en prod build por React).
//
//   Si se decide expandir el uso de prop-types (defensa-en-profundidad
//   en form widgets nuevos), seguir el patrón existente en FormUI.jsx.
//
//   Si se decide MIGRAR A TYPESCRIPT en lugar de expandir prop-types:
//     - Eliminar el dep `prop-types` de package.json.
//     - Convertir InteractiveAssessmentLayout.jsx + FormUI.jsx primero
//       (son los 2 únicos consumers).
//     - Actualizar este test para reflejar la decisión.
//
// Cobertura:
//   A) `prop-types` declarado en package.json (back-compat).
//   B) Al menos 2 archivos en src/components/ importan PropTypes.
//   C) Las decoraciones `.propTypes` son syntactically válidas (sanity).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _PACKAGE_JSON = join(__dirname, '..', '..', 'package.json');
const _SRC_ROOT = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(_PACKAGE_JSON, 'utf8'));

function walkDir(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        if (['node_modules', '__tests__', '__snapshots__'].includes(entry)) continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            out.push(...walkDir(full));
        } else if (/\.(jsx?|tsx?)$/.test(entry)) {
            out.push(full);
        }
    }
    return out;
}

describe('F-P1-6: prop-types audit correction', () => {
    it('A) prop-types declarado como dep activa en package.json', () => {
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        expect(
            deps['prop-types'],
            '`prop-types` removido de package.json — si fue por migración a ' +
            'TypeScript, eliminar también los imports en src/components/ ' +
            '(InteractiveAssessmentLayout, FormUI). Actualizar este test ' +
            'para reflejar la nueva decisión.',
        ).toBeDefined();
    });

    it('B) al menos 2 componentes importan PropTypes', () => {
        const files = walkDir(_SRC_ROOT);
        const importers = [];
        for (const file of files) {
            const content = readFileSync(file, 'utf8');
            if (/import\s+PropTypes\s+from\s+['"]prop-types['"]/.test(content)) {
                importers.push(file);
            }
        }
        expect(
            importers.length,
            `Solo ${importers.length} archivo(s) importan PropTypes — audit ` +
            `F-P1-6 (incorrecto) sugería que prop-types está NO usado. Si ` +
            `bajaste a 0 deliberadamente, eliminar el dep de package.json + ` +
            `actualizar este test. Si subiste el count, todo bien.`,
        ).toBeGreaterThanOrEqual(2);
    });

    it('C) decoraciones .propTypes presentes y syntactically válidas', () => {
        const files = walkDir(_SRC_ROOT);
        let declarationsFound = 0;
        for (const file of files) {
            const content = readFileSync(file, 'utf8');
            // Pattern: `ComponentName.propTypes = {` o
            // `propTypes: { children: PropTypes.node ... }` o
            // `propTypes = { ... }`.
            const matches = content.match(/\.propTypes\s*=\s*\{[\s\S]*?\}/g) || [];
            declarationsFound += matches.length;
        }
        expect(
            declarationsFound,
            `0 decoraciones \`.propTypes = { ... }\` encontradas. Si quitaste ` +
            `todas, eliminar el dep prop-types también.`,
        ).toBeGreaterThan(0);
    });

    it('D) PropTypes.node/string/number/etc usados (no solo placeholder)', () => {
        // Sanity: validamos que las decoraciones efectivamente referencian
        // tipos PropTypes (no solo declaraciones vacías).
        const files = walkDir(_SRC_ROOT);
        let typesUsed = new Set();
        for (const file of files) {
            const content = readFileSync(file, 'utf8');
            const matches = content.match(/PropTypes\.(\w+)/g) || [];
            for (const m of matches) {
                typesUsed.add(m);
            }
        }
        const minimumExpected = ['PropTypes.node', 'PropTypes.string'];
        const missing = minimumExpected.filter((t) => !typesUsed.has(t));
        expect(
            missing,
            `Tipos PropTypes mínimos ausentes: ${missing.join(', ')}. Si ` +
            `removiste todas las decoraciones, eliminar el dep también.`,
        ).toHaveLength(0);
    });
});
