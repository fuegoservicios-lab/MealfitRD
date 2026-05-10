// [P2-HIST-AUDIT-11 · 2026-05-09] Tests del wiring de History.jsx
// con el singleton de caches.
//
// Bug original (audit Historial 2026-05-09):
//   useStates locales en History.jsx se reinicializan a `{}` al
//   re-montar el componente (navegación entre páginas). Los lazy
//   fetches del modal (lessons/coherence/blocked/metrics) corrían
//   de cero al volver — waste para tier ultra.
//
// Fix:
//   useState lazy init via `hydrateCacheDict(historyCaches.<X>)` y
//   write-through en cada `_ensure*` helper tras fetch exitoso.
//
// Cobertura:
//   1. Anchor del marker.
//   2. Import de historyCaches + setCachedEntry + hydrateCacheDict.
//   3. Los 4 useState usan lazy init `() => hydrateCacheDict(...)`.
//   4. Cada _ensure* helper escribe al singleton tras fetch
//      exitoso (write-through pattern).
//   5. NO escribe al singleton en el catch (sentinel 'error' no
//      debe sobrevivir cross-mount).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P2-HIST-AUDIT-11] anchor + imports', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P2-HIST-AUDIT-11\s*·\s*2026-05-09\]/);
    });

    it('importa historyCaches + setCachedEntry + hydrateCacheDict', () => {
        const importLine = src.match(
            /import\s*\{[^}]*\}\s*from\s*['"]\.\.\/utils\/historyCaches['"]/
        );
        expect(importLine).toBeTruthy();
        expect(importLine[0]).toMatch(/historyCaches/);
        expect(importLine[0]).toMatch(/setCachedEntry/);
        expect(importLine[0]).toMatch(/hydrateCacheDict/);
    });
});


describe('[P2-HIST-AUDIT-11] useState lazy init desde singleton', () => {
    it('lessonsDetailCache lazy init via hydrateCacheDict(historyCaches.lessonsDetail)', () => {
        expect(src).toMatch(
            /useState\(\s*\(\)\s*=>\s*hydrateCacheDict\(\s*historyCaches\.lessonsDetail\s*\)\s*\)/
        );
    });

    it('coherenceHistoryCache lazy init', () => {
        expect(src).toMatch(
            /useState\(\s*\(\)\s*=>\s*hydrateCacheDict\(\s*historyCaches\.coherenceHistory\s*\)\s*\)/
        );
    });

    it('blockedReasonsCache lazy init', () => {
        expect(src).toMatch(
            /useState\(\s*\(\)\s*=>\s*hydrateCacheDict\(\s*historyCaches\.blockedReasons\s*\)\s*\)/
        );
    });

    it('chunkMetricsCache lazy init', () => {
        expect(src).toMatch(
            /useState\(\s*\(\)\s*=>\s*hydrateCacheDict\(\s*historyCaches\.chunkMetrics\s*\)\s*\)/
        );
    });
});


describe('[P2-HIST-AUDIT-11] write-through al singleton tras fetch exitoso', () => {
    const _findHelperBlock = (name) => {
        const idx = src.indexOf(`const ${name} = async`);
        expect(idx).toBeGreaterThan(-1);
        // Slice generoso: helpers contienen try/catch + 2 setStates.
        return src.slice(idx, idx + 2500);
    };

    it('_ensureLessonsDetail escribe a historyCaches.lessonsDetail', () => {
        const block = _findHelperBlock('_ensureLessonsDetail');
        expect(block).toMatch(
            /setCachedEntry\(\s*historyCaches\.lessonsDetail\s*,\s*planId\s*,\s*lessons\s*\)/
        );
    });

    it('_ensureCoherenceHistory escribe a historyCaches.coherenceHistory', () => {
        const block = _findHelperBlock('_ensureCoherenceHistory');
        expect(block).toMatch(
            /setCachedEntry\(\s*historyCaches\.coherenceHistory\s*,\s*planId\s*,\s*history\s*\)/
        );
    });

    it('_ensureBlockedReasons escribe a historyCaches.blockedReasons', () => {
        const block = _findHelperBlock('_ensureBlockedReasons');
        expect(block).toMatch(
            /setCachedEntry\(\s*historyCaches\.blockedReasons\s*,\s*planId\s*,\s*reasons\s*\)/
        );
    });

    it('_ensureChunkMetrics escribe a historyCaches.chunkMetrics', () => {
        const block = _findHelperBlock('_ensureChunkMetrics');
        expect(block).toMatch(
            /setCachedEntry\(\s*historyCaches\.chunkMetrics\s*,\s*planId\s*,\s*chunks\s*\)/
        );
    });
});


describe('[P2-HIST-AUDIT-11] sentinel "error" NO se persiste', () => {
    const _findCatchBlock = (helperName) => {
        const idx = src.indexOf(`const ${helperName} = async`);
        const block = src.slice(idx, idx + 2500);
        // Capturar solo el bloque catch.
        const catchIdx = block.indexOf('catch (err)');
        expect(catchIdx).toBeGreaterThan(-1);
        return block.slice(catchIdx, catchIdx + 800);
    };

    it.each([
        ['_ensureLessonsDetail'],
        ['_ensureCoherenceHistory'],
        ['_ensureBlockedReasons'],
        ['_ensureChunkMetrics'],
    ])('%s catch block NO llama setCachedEntry', (helper) => {
        const catchBlock = _findCatchBlock(helper);
        // El catch debe setear sentinel 'error' en el state local
        // pero NO escribir al singleton — sentinels no sobreviven
        // cross-mount.
        expect(catchBlock).toMatch(/['"]error['"]/);
        expect(catchBlock).not.toMatch(/setCachedEntry/);
    });
});
