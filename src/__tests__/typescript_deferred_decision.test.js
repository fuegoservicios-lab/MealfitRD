// [F-P2-2 · 2026-05-23] TypeScript migration deferred — decisión de
// producto análoga a backend P3-I18N-DEFERRED.
//
// Gap aparente (audit production-readiness 2026-05-23, F-P2-2):
//   "Sin TypeScript — `@types/react` instalado pero sin uso. Bugs de
//    tipo en compile-time perdidos."
//
// Decisión documentada (este test):
//   El repo usa JS puro con prop-types parcial (en 2 components
//   críticos — ver `prop_types_audit_correction.test.js`). Migración
//   completa a TypeScript:
//     - **Costo**: refactorear ~50+ archivos JS/JSX a TS/TSX.
//     - **Beneficio**: type checking compile-time real.
//     - **Trade-off**: dev solo, MVP <100 MAU. ROI marginal vs el
//       costo de refactor masivo. PropTypes en componentes críticos
//       cubre el 80% del valor a 20% del costo.
//
//   `@types/react` + `@types/react-dom` ESTÁN en devDeps — quedan para
//   habilitar el TypeScript LSP en IDEs sin requerir compilación full.
//   Removerlos rompe autocompletado en JSX (vscode usa estos types para
//   inferencia incluso sin tsconfig.json).
//
//   Cuándo revisitar:
//     - Si el dev team crece a 2+ devs.
//     - Si emergen bugs de tipo recurrentes en hot paths (e.g. props
//       mal pasados a Components compartidos).
//     - Si se decide adoptar Next.js u otro framework que requiera TS.
//
//   Migration path (cuando se decida):
//     (1) Añadir tsconfig.json + ts-loader/vite-plugin-typescript.
//     (2) Migrar primero `src/components/common/*` (lib compartida).
//     (3) Migrar `src/context/AssessmentContext.jsx` (state crítico).
//     (4) Boy-scout migration para el resto.
//     (5) Eliminar prop-types dep tras migración completa de los 2
//         consumers actuales.
//
// Este test ancla la decisión:
//   Si alguien añade `tsconfig.json` sin documentar, falla con copy
//   explicativo. Si remueve `@types/react`, falla porque rompería el LSP.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _REPO_ROOT = join(__dirname, '..', '..');
const _PACKAGE_JSON = join(_REPO_ROOT, 'package.json');

const pkg = JSON.parse(readFileSync(_PACKAGE_JSON, 'utf8'));

describe('F-P2-2: TypeScript deferred (decisión de producto)', () => {
    it('A) tsconfig.json NO existe (decisión deferred)', () => {
        const tsconfig = join(_REPO_ROOT, 'tsconfig.json');
        const tsconfigNode = join(_REPO_ROOT, 'tsconfig.node.json');
        const tsconfigApp = join(_REPO_ROOT, 'tsconfig.app.json');

        const foundConfigs = [tsconfig, tsconfigNode, tsconfigApp].filter((p) =>
            existsSync(p),
        );

        if (foundConfigs.length > 0) {
            // Si se decidió migrar, validar que la decisión está documentada
            // en CLAUDE.md (backend) o en un follow-up test renamed.
            throw new Error(
                `\n[F-P2-2-TYPESCRIPT-DEFERRED] tsconfig file(s) detectado(s): ` +
                `${foundConfigs.map((p) => p.replace(_REPO_ROOT, '.')).join(', ')}\n\n` +
                `Si esto fue intencional (decisión de adoptar TypeScript):\n` +
                `  (a) Documentar la decisión en CLAUDE.md o frontend README.\n` +
                `  (b) Actualizar este test a reflejar la nueva decisión.\n` +
                `  (c) Plan migration incremental: src/components/common → ` +
                `      src/context → resto (boy scout).\n\n` +
                `Si fue accidental, eliminar el tsconfig.`,
            );
        }
    });

    it('B) @types/react preservado (necesario para LSP en JSX)', () => {
        const devDeps = pkg.devDependencies || {};
        expect(
            devDeps['@types/react'],
            '`@types/react` removido de devDependencies. VSCode/IDEs lo usan ' +
            'para autocompletado en JSX SIN tsconfig.json. Removerlo rompe DX. ' +
            'Si fue por migración completa a TypeScript, ver test A) decisión.',
        ).toBeDefined();
        expect(
            devDeps['@types/react-dom'],
            '`@types/react-dom` removido. Mismo razón que @types/react.',
        ).toBeDefined();
    });

    it('C) NO existen archivos .ts/.tsx en src/ (decisión deferred)', () => {
        // Si emerge un .ts/.tsx aislado sin tsconfig, vite lo bundle pero
        // sin type checking — pierde el beneficio de TS. Si genuinamente
        // se quiere TS, hacerlo completo.
        const { readdirSync, statSync } = require('fs');
        function findTsFiles(dir) {
            const out = [];
            for (const entry of readdirSync(dir)) {
                if (['node_modules', '__tests__'].includes(entry)) continue;
                const full = join(dir, entry);
                const st = statSync(full);
                if (st.isDirectory()) out.push(...findTsFiles(full));
                else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) {
                    out.push(full.replace(_REPO_ROOT, '.'));
                }
            }
            return out;
        }
        const srcDir = join(_REPO_ROOT, 'src');
        const tsFiles = findTsFiles(srcDir);
        expect(
            tsFiles,
            `\n[F-P2-2-TYPESCRIPT-DEFERRED] ${tsFiles.length} archivo(s) .ts/.tsx ` +
            `aislado(s) en src/:\n${tsFiles.map((f) => `  - ${f}`).join('\n')}\n\n` +
            `Sin tsconfig.json, vite-plugin-react los transpila pero NO ejecuta ` +
            `type checking → pierde el beneficio de TypeScript. Si genuinamente ` +
            `iniciaste migración, añadir tsconfig.json + actualizar este test.`,
        ).toHaveLength(0);
    });
});
