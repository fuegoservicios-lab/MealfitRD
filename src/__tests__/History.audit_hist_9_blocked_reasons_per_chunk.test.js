// [P2-HIST-AUDIT-9 · 2026-05-09] Tests del lazy fetch + render de
// reasons per-chunk en el banner del modal del Historial.
//
// Bug original (audit Historial 2026-05-09):
//   El banner del modal mostraba un único `_user_action_required.reason`
//   agregado de plan_data. Si un plan tenía 3 chunks bloqueados por
//   razones distintas (e.g. stale_snapshot + tz_unresolved +
//   recovery_exhausted), el usuario veía un único reason genérico
//   sin poder diagnosticar cada chunk.
//
// Fix:
//   Endpoint `/blocked_reasons?include_failed=true` devuelve la lista
//   per-chunk con reasons específicos. Modal hace lazy fetch al abrir
//   cuando hay drift y renderiza una `<ul>` debajo del body.
//
// Cobertura:
//   1. Anchor del marker.
//   2. Wrapper getPlanBlockedReasons en config/api.js apunta al endpoint
//      correcto con `include_failed=true`.
//   3. Estado blockedReasonsCache + helper _ensureBlockedReasons.
//   4. Lazy fetch dispara solo cuando hay drift (al abrir card).
//   5. Render de la lista en banner: badges con week_number + title.
//   6. Sentinels 'loading' y 'error' degradan silente.
//   7. CSS classes definidas.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');
const _API_PATH = join(__dirname, '..', 'config', 'api.ts');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const cssSrc = readFileSync(_CSS_PATH, 'utf8');
const apiSrc = readFileSync(_API_PATH, 'utf8');


describe('[P2-HIST-AUDIT-9] anchor + wrapper api', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P2-HIST-AUDIT-9\s*·\s*2026-05-09\]/);
    });

    it('marker presente en config/api.js', () => {
        expect(apiSrc).toMatch(/\[P2-HIST-AUDIT-9\s*·\s*2026-05-09\]/);
    });

    it('getPlanBlockedReasons llama al endpoint con include_failed=true', () => {
        expect(apiSrc).toMatch(
            /export\s+const\s+getPlanBlockedReasons\s*=\s*\(\s*planId\s*\)\s*=>\s*fetchWithAuth\(/
        );
        expect(apiSrc).toMatch(
            /\/api\/plans\/\$\{planId\}\/blocked_reasons\?include_failed=true/
        );
    });

    it('import de getPlanBlockedReasons en History.jsx', () => {
        const importLine = src.match(
            /import\s*\{[^}]*\}\s*from\s*['"]\.\.\/config\/api['"]/
        );
        expect(importLine[0]).toMatch(/getPlanBlockedReasons/);
    });
});


describe('[P2-HIST-AUDIT-9] cache state + helper', () => {
    it('useState blockedReasonsCache definido', () => {
        // [P2-HIST-AUDIT-11 · 2026-05-09] Cambió de `useState({})`
        // literal a `useState(() => hydrateCacheDict(historyCaches.blockedReasons))`
        // para persistir cross-mount. La aserción ahora es prefix-only
        // sobre el destructuring + useState — la inicialización se
        // cubre en el suite de HIST-11.
        expect(src).toMatch(
            /const\s*\[\s*blockedReasonsCache\s*,\s*setBlockedReasonsCache\s*\]\s*=\s*useState/
        );
    });

    it('helper _ensureBlockedReasons usa sentinels loading/error', () => {
        const helperIdx = src.indexOf('_ensureBlockedReasons');
        expect(helperIdx).toBeGreaterThan(-1);
        const block = src.slice(helperIdx, helperIdx + 1500);
        // Regex relajado [\s\S]*? para tolerar paréntesis interiores
        // del callback (prev) => ({...}).
        expect(block).toMatch(/setBlockedReasonsCache\([\s\S]*?['"]loading['"]/);
        expect(block).toMatch(/setBlockedReasonsCache\([\s\S]*?['"]error['"]/);
    });

    it('helper omite re-fetch si Array.isArray(current) o ya loading', () => {
        const helperIdx = src.indexOf('_ensureBlockedReasons');
        const block = src.slice(helperIdx, helperIdx + 1500);
        expect(block).toMatch(/Array\.isArray\(current\)/);
        expect(block).toMatch(/current\s*===\s*['"]loading['"]/);
    });
});


describe('[P2-HIST-AUDIT-9] lazy fetch al abrir card', () => {
    it('dispara _ensureBlockedReasons solo si hay drift (puac/fc/exh > 0)', () => {
        // Buscar el bloque del onClick de la card que llama
        // _ensureBlockedReasons.
        const fetchIdx = src.indexOf('_ensureBlockedReasons(plan.id)');
        expect(fetchIdx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, fetchIdx - 1000), fetchIdx + 200);
        // Guard: _puac > 0 || _fc > 0 || _exh > 0
        expect(block).toMatch(/_puac\s*>\s*0\s*\|\|\s*_fc\s*>\s*0\s*\|\|\s*_exh\s*>\s*0/);
    });

    it('lectura embedded counters con typeof number defensivo', () => {
        const fetchIdx = src.indexOf('_ensureBlockedReasons(plan.id)');
        const block = src.slice(Math.max(0, fetchIdx - 1000), fetchIdx + 200);
        expect(block).toMatch(
            /typeof\s+plan\.chunk_pending_user_action_count\s*===\s*['"]number['"]/
        );
        expect(block).toMatch(
            /typeof\s+plan\.recovery_exhausted_count\s*===\s*['"]number['"]/
        );
    });
});


describe('[P2-HIST-AUDIT-9] render dentro del banner', () => {
    it('muestra mensaje "Cargando" durante sentinel loading', () => {
        const renderIdx = src.indexOf('blockedReasonsCache[selectedPlan.id]');
        expect(renderIdx).toBeGreaterThan(-1);
        const block = src.slice(renderIdx, renderIdx + 2500);
        expect(block).toMatch(/_br\s*===\s*['"]loading['"]/);
        expect(block).toMatch(/Cargando detalle por chunk/);
    });

    it('omite render en sentinel error o array vacío', () => {
        const renderIdx = src.indexOf('blockedReasonsCache[selectedPlan.id]');
        const block = src.slice(renderIdx, renderIdx + 2500);
        // Triple check: error OR no-array OR length 0 → return null.
        expect(block).toMatch(
            /_br\s*===\s*['"]error['"]\s*\|\|\s*!Array\.isArray\(_br\)\s*\|\|\s*_br\.length\s*===\s*0/
        );
    });

    it('lista cada reason con week_number y title', () => {
        const renderIdx = src.indexOf('blockedReasonsCache[selectedPlan.id]');
        const block = src.slice(renderIdx, renderIdx + 3500);
        // Render JSX itera con .map y muestra week_number + title.
        expect(block).toMatch(/_br\.map/);
        expect(block).toMatch(/r\.week_number/);
        expect(block).toMatch(/r\.title/);
    });

    it('fallback al reason_code cuando title falta', () => {
        const renderIdx = src.indexOf('blockedReasonsCache[selectedPlan.id]');
        const block = src.slice(renderIdx, renderIdx + 3500);
        // r.title || r.reason_code || 'Bloqueado' fallback chain.
        expect(block).toMatch(/r\.reason_code/);
    });
});


describe('[P2-HIST-AUDIT-9] CSS classes', () => {
    it('actionBannerReasons + actionBannerReasonItem definidas', () => {
        expect(cssSrc).toMatch(/\.actionBannerReasons\s*\{/);
        expect(cssSrc).toMatch(/\.actionBannerReasonItem\s*\{/);
    });

    it('actionBannerReasons hereda colores del banner padre (no override)', () => {
        // El bloque NO redefine `color` global ni `background:` de
        // los tones padres — usa rgba(255,255,255,0.X) translúcido
        // para no chocar con missingDaysBad/Warn/Info colors.
        const idx = cssSrc.indexOf('.actionBannerReasons');
        const block = cssSrc.slice(idx, idx + 400);
        expect(block).toMatch(/rgba\(255,\s*255,\s*255/);
    });
});
