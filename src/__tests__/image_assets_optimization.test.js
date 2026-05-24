// [F-P1-2 · 2026-05-23] Guard: imágenes en `public/` y `<img>` tags en
// `src/` deben seguir buenas prácticas de optimización.
//
// Gap original (audit production-readiness 2026-05-23, F-P1-2):
//   - PNG legacy `dashboard_bg.png` (~398KB) y `auth_bg.png` (~676KB)
//     existían en `public/` sin ser usados (CSS apunta a `.webp` y
//     `auth_bg_new.png` respectivamente). Vite copia TODO `public/`
//     verbatim a `dist/` → ~1MB de dead weight en cada deploy.
//   - `<img>` tags sin `loading="lazy"` ni `decoding="async"` → LCP
//     degradado, especialmente en listas de chat (MessageBubble,
//     ChatWidget) donde pueden haber decenas de imágenes user-uploaded.
//
// Fix:
//   - PNGs orphan eliminados via `git rm public/auth_bg.png
//     public/dashboard_bg.png`.
//   - `loading="lazy"` + `decoding="async"` añadidos a:
//     - MessageBubble.jsx (chat agent images)
//     - ChatWidget.jsx (chat widget images)
//     - AgentPage.jsx (upload preview)
//
// Cobertura:
//   A) `public/dashboard_bg.png` NO existe (orphan eliminado).
//   B) `public/auth_bg.png` NO existe (orphan eliminado).
//   C) `public/dashboard_bg.webp` SÍ existe (referenciado por CSS).
//   D) `public/auth_bg_new.png` SÍ existe (referenciado por CSS).
//   E) Cada `<img>` tag en componentes "below-fold" tiene `loading="lazy"`.
//      Allowlist para iconos pequeños (favicon, logos hero).
//
// Anchor: F-P1-2-IMG-OPT | audit 2026-05-23.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _REPO_ROOT = join(__dirname, '..', '..');
const _PUBLIC = join(_REPO_ROOT, 'public');
const _SRC = join(_REPO_ROOT, 'src');

// Files cuya `<img>` legítimamente NO necesita lazy:
//   - Favicon/logo small icons.
//   - Hero images above-the-fold (LCP candidate — lazy hurts LCP).
const _LAZY_EXEMPT_FILES = new Set([
    'IOSInstallPrompt.jsx',  // 44x44 banner icon
]);

// Path patterns dentro de un archivo legítimamente exempt:
const _LAZY_EXEMPT_IMG_PATTERNS = [
    /favicon/i,
    /logo/i,
];

function walkDir(dir, excludeNames = new Set()) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir)) {
        if (excludeNames.has(entry)) continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            out.push(...walkDir(full, excludeNames));
        } else if (/\.(jsx?|tsx?)$/.test(entry)) {
            out.push(full);
        }
    }
    return out;
}

describe('F-P1-2: image assets optimization', () => {
    it('A) orphan PNG `dashboard_bg.png` eliminado de public/', () => {
        expect(
            existsSync(join(_PUBLIC, 'dashboard_bg.png')),
            '`public/dashboard_bg.png` reapareció — orphan ~398KB. Verificar ' +
            'que CSS NO lo referencia (`grep dashboard_bg.png src/`). El ' +
            'archivo activo es `.webp`.',
        ).toBe(false);
    });

    it('B) orphan PNG `auth_bg.png` eliminado de public/', () => {
        expect(
            existsSync(join(_PUBLIC, 'auth_bg.png')),
            '`public/auth_bg.png` reapareció — orphan ~676KB. El archivo ' +
            'activo es `auth_bg_new.png`.',
        ).toBe(false);
    });

    it('C) `dashboard_bg.webp` presente (referenciado por CSS)', () => {
        expect(
            existsSync(join(_PUBLIC, 'dashboard_bg.webp')),
            '`public/dashboard_bg.webp` ausente — `DashboardLayout.module.css` ' +
            'lo referencia. Sin él, el background no carga.',
        ).toBe(true);
    });

    it('D) `auth_bg_new.png` presente (referenciado por CSS)', () => {
        expect(
            existsSync(join(_PUBLIC, 'auth_bg_new.png')),
            '`public/auth_bg_new.png` ausente — `Auth.module.css` lo ' +
            'referencia. Sin él, el background de login/register no carga.',
        ).toBe(true);
    });

    it('E) `<img>` tags en componentes below-fold usan `loading="lazy"`', () => {
        const files = walkDir(_SRC, new Set(['__tests__', 'node_modules']));
        const violations = [];

        for (const file of files) {
            const filename = file.split('/').pop();
            if (_LAZY_EXEMPT_FILES.has(filename)) continue;

            const rawContent = readFileSync(file, 'utf8');
            // Strip line + block comments — false positives típicos vienen
            // de docs explicando XSS examples como `<img onerror=...>`.
            const content = rawContent
                .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
                .replace(/^\s*\*[^\n]*/gm, '')        // JSDoc continuation lines
                .replace(/\/\/[^\n]*/g, '');         // line comments

            // Match `<img` tag JSX — debe tener `src=` o JSX attrs reales
            // para distinguir de doc strings.
            const imgPattern = /<img\b[^>]*?\/?\s*>/gs;
            const matches = content.match(imgPattern) || [];
            for (const tag of matches) {
                // Skip si NO tiene `src=` real (doc example sin src).
                if (!/\bsrc\s*=/.test(tag)) continue;
                // Skip si la src pattern matchea exempt (favicon/logo).
                if (_LAZY_EXEMPT_IMG_PATTERNS.some((p) => p.test(tag))) continue;
                // Validar `loading="lazy"` o `loading={'lazy'}` o `loading="eager"` (explicit).
                if (!/loading=["'{]?lazy["'}]?|loading=["'{]?eager["'}]?/.test(tag)) {
                    violations.push({
                        file: relative(_SRC, file),
                        snippet: tag.replace(/\s+/g, ' ').slice(0, 120),
                    });
                }
            }
        }

        if (violations.length > 0) {
            const detail = violations
                .map((v) => `  - src/${v.file}\n      ${v.snippet}`)
                .join('\n');
            const msg =
                `\n[F-P1-2-IMG-OPT] ${violations.length} \`<img>\` tag(s) sin ` +
                `\`loading="lazy"\` ni \`loading="eager"\` explícito:\n\n${detail}\n\n` +
                `Opciones para arreglar:\n` +
                `  (a) Añadir \`loading="lazy"\` + \`decoding="async"\` (default ` +
                `para below-the-fold).\n` +
                `  (b) Añadir \`loading="eager"\` si es hero LCP element\n` +
                `      (lazy hurts LCP en above-the-fold).\n` +
                `  (c) Añadir el filename a \`_LAZY_EXEMPT_FILES\` o el path\n` +
                `      pattern a \`_LAZY_EXEMPT_IMG_PATTERNS\` con razón.\n`;
            throw new Error(msg);
        }
        expect(violations.length).toBe(0);
    });

    it('F) anchor F-P1-2 presente en al menos 1 componente tocado', () => {
        // Soft check: validar que el anchor está vivo. Permite mirar al
        // commit que cerró el gap.
        const files = walkDir(_SRC, new Set(['__tests__', 'node_modules']));
        const hasAnchor = files.some((f) => {
            const text = readFileSync(f, 'utf8');
            return text.includes('F-P1-2') || text.includes('loading="lazy"');
        });
        expect(
            hasAnchor,
            'Ningún archivo en src/ menciona F-P1-2 ni `loading="lazy"`. ' +
            'Eso sugiere que TODOS los <img> perdieron lazy loading — ' +
            'regresión masiva.',
        ).toBe(true);
    });
});
