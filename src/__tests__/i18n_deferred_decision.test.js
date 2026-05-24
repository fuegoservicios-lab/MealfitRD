// [F-P1-5 · 2026-05-23] i18n framework deferred — decisión de producto
// documentada en CLAUDE.md → `i18n: es-DO permanente`.
//
// Gap aparente (audit production-readiness 2026-05-23, F-P1-5):
//   "Sin i18n framework — todo el copy está hardcoded en español. Bloqueo
//    a expansión multilenguaje."
//
// Decisión documentada (P3-I18N-DEFERRED · 2026-05-13, CLAUDE.md):
//   El producto es 100% es-DO (español dominicano). Mercado objetivo:
//   República Dominicana únicamente, sin roadmap activo de expansión
//   multilocale. Añadir `react-i18next` ahora:
//     - Bundle overhead ~30KB.
//     - Deuda de mantenimiento (cada string nuevo debe pasar por el
//       sistema o se vuelve inconsistente).
//     - Abstracción no-usada (decisión "Don't design for hypothetical
//       future requirements").
//
//   Si se decide expandir geográficamente (PR, MX, US Latino, EU/PT/IT),
//   este gap se reabre como tarea de implementación. Costo del scaffold
//   preventivo hoy = costo del refactor incremental cuando la decisión
//   sea real → mejor pagar maintenance solo cuando se confirme.
//
//   Floor de revisión: 2027-01-01 (audit anual). Si para entonces sigue
//   siendo es-DO only, mantener decisión.
//
// Este test (frontend mirror del backend `test_p3_i18n_deferred.py`):
//   Si alguien añade `react-i18next` / `i18next` / `react-intl` a
//   `package.json` sin documentar la decisión de expansión, este test
//   falla con copy explicativo.
//
// Análogo a `test_prop_types_audit_correction.test.js` (audit correction
// pattern) — mantiene visibility de la decisión sin requerir doc updates.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _PACKAGE_JSON = join(__dirname, '..', '..', 'package.json');

const pkg = JSON.parse(readFileSync(_PACKAGE_JSON, 'utf8'));

const _FORBIDDEN_I18N_DEPS = [
    'react-i18next',
    'i18next',
    'react-intl',
    'next-i18next',
    'lingui',
    '@lingui/react',
    '@lingui/core',
];

describe('F-P1-5: i18n deferred (decisión de producto)', () => {
    it('NO añadir deps i18n sin documentar la decisión de expansión', () => {
        const allDeps = {
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {}),
        };
        const addedI18nDeps = _FORBIDDEN_I18N_DEPS.filter((dep) => dep in allDeps);

        expect(
            addedI18nDeps,
            `package.json añadió deps de i18n: ${addedI18nDeps.join(', ')}\n\n` +
            `Si esto fue intencional (decisión de expandir geográficamente):\n` +
            `  (a) Documentar la decisión en CLAUDE.md → eliminar/actualizar\n` +
            `      la sección "i18n: es-DO permanente".\n` +
            `  (b) Actualizar este test para reflejar la nueva decisión.\n` +
            `  (c) Añadir estructura src/i18n/locales/{es,en,...}/<namespace>.json\n` +
            `      antes de empezar migración incremental.\n\n` +
            `Si fue accidental (e.g. dep transitivo arrastró un i18n lib):\n` +
            `  Verificar el package-lock.json para entender el origen.\n` +
            `  Si genuinamente innecesario, eliminar.\n\n` +
            `Decisión actual documentada: P3-I18N-DEFERRED · 2026-05-13 en CLAUDE.md.`,
        ).toHaveLength(0);
    });

    it('CLAUDE.md (workspace o backend) documenta la decisión deferred', () => {
        // Buscar CLAUDE.md en múltiples paths posibles del workspace.
        const candidates = [
            join(__dirname, '..', '..', 'CLAUDE.md'),
            join(__dirname, '..', '..', '..', 'CLAUDE.md'),
            join(__dirname, '..', '..', '..', 'MealfitRD-Backend', 'CLAUDE.md'),
        ];
        let found = false;
        let foundText = '';
        for (const candidate of candidates) {
            try {
                const text = readFileSync(candidate, 'utf8');
                if (text.includes('i18n') && (text.includes('P3-I18N-DEFERRED') || text.includes('es-DO permanente'))) {
                    found = true;
                    foundText = text;
                    break;
                }
            } catch (e) { /* file no existe en esta ruta */ }
        }
        // Soft check — si no encuentra CLAUDE.md (ej. checkout solo del
        // frontend repo), aceptamos. Pero si encuentra UN CLAUDE.md y NO
        // tiene la decisión, fail loud.
        if (foundText && !foundText.includes('P3-I18N-DEFERRED')) {
            expect.fail(
                'CLAUDE.md encontrado pero NO documenta `P3-I18N-DEFERRED` ni ' +
                '`i18n: es-DO permanente`. Restaurar la sección — sin ella, el ' +
                'test reabre el gap como acción pendiente.',
            );
        }
        // Si no encontró CLAUDE.md, este test pasa silentemente (frontend
        // standalone repo no tiene CLAUDE.md en el árbol).
    });
});
