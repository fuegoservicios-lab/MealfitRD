// [P2-HIST-NEW-4 · 2026-05-09] Tests del helper `getChunkKindLabel`
// y su uso en el badge del tab Métricas.
//
// Bug original (audit profundo Historial 2026-05-09):
//   El badge mostraba "Semana 1 · rolling_refill" — el chunk_kind
//   en snake_case crudo del backend. Asimetría con _TIER_LABELS
//   (tier_breakdown del modal) que sí humaniza. Confuso para
//   usuario final.
//
// Fix:
//   Helper SSOT `frontend/src/utils/chunkKinds.js` con map es-DO
//   breve. Badge usa `getChunkKindLabel(c.chunk_kind) || c.chunk_kind`
//   (fallback al code crudo si no está en catálogo — vs silenciar).
//
// Cobertura:
//   1. Anchor del marker.
//   2. Helper handles null/undefined/non-string.
//   3. Helper handles empty/whitespace.
//   4. Helper devuelve label para codes canónicos.
//   5. Helper devuelve null para codes desconocidos.
//   6. Catálogo cubre los kinds del backend (initial_plan, rolling_refill, catchup).
//   7. History.jsx importa y usa el helper en el render del badge.
//   8. Fallback al code crudo cuando getChunkKindLabel retorna null.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getChunkKindLabel, _CHUNK_KIND_LABELS_MAP } from '../utils/chunkKinds';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P2-HIST-NEW-4] anchor + import', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P2-HIST-NEW-4\s*·\s*2026-05-09\]/);
    });

    it('importa getChunkKindLabel del helper SSOT', () => {
        expect(src).toMatch(
            /import\s+\{\s*getChunkKindLabel\s*\}\s+from\s+['"]\.\.\/utils\/chunkKinds['"]/
        );
    });
});


describe('[P2-HIST-NEW-4] helper getChunkKindLabel — guards', () => {
    it('devuelve null para input no-string', () => {
        expect(getChunkKindLabel(null)).toBeNull();
        expect(getChunkKindLabel(undefined)).toBeNull();
        expect(getChunkKindLabel(123)).toBeNull();
        expect(getChunkKindLabel({})).toBeNull();
        expect(getChunkKindLabel([])).toBeNull();
    });

    it('devuelve null para string vacío o whitespace', () => {
        expect(getChunkKindLabel('')).toBeNull();
        expect(getChunkKindLabel('   ')).toBeNull();
    });

    it('devuelve null para code desconocido (no en catálogo)', () => {
        // Code no en map → null. Frontend cae al code crudo, no al
        // string vacío — el operator power-user con un kind nuevo
        // en producción lo ve aunque no esté humanizado.
        expect(getChunkKindLabel('totally_unknown_kind')).toBeNull();
    });
});


describe('[P2-HIST-NEW-4] catálogo cubre kinds canónicos del backend', () => {
    it('initial_plan tiene label', () => {
        const label = getChunkKindLabel('initial_plan');
        expect(label).toBeTruthy();
        expect(typeof label).toBe('string');
    });

    it('rolling_refill tiene label', () => {
        const label = getChunkKindLabel('rolling_refill');
        expect(label).toBeTruthy();
    });

    it('catchup tiene label', () => {
        const label = getChunkKindLabel('catchup');
        expect(label).toBeTruthy();
    });
});


describe('[P2-HIST-NEW-4] calidad de los labels', () => {
    it('labels son cortos (≤20 chars) para chip layout', () => {
        for (const [code, label] of Object.entries(_CHUNK_KIND_LABELS_MAP)) {
            expect(label.length).toBeLessThanOrEqual(20);
        }
    });

    it('labels son strings no-vacíos post-trim', () => {
        for (const [code, label] of Object.entries(_CHUNK_KIND_LABELS_MAP)) {
            expect(typeof label).toBe('string');
            expect(label.trim().length).toBeGreaterThan(0);
        }
    });

    it('codes son snake_case (espejo del backend)', () => {
        // Defensive: el map debe tener las keys en snake_case (no
        // camelCase ni hyphenated). Si alguien refactorizó a otra
        // convención, los lookups del frontend romperían silently.
        for (const code of Object.keys(_CHUNK_KIND_LABELS_MAP)) {
            expect(code).toMatch(/^[a-z][a-z0-9_]*$/);
        }
    });
});


describe('[P2-HIST-NEW-4] uso en el badge del tab Métricas', () => {
    it('compute usa getChunkKindLabel con fallback al code crudo', () => {
        const idx = src.indexOf('[P2-HIST-NEW-4 · 2026-05-09]');
        // Hay un import + un compute — buscar el SEGUNDO match (compute).
        const computeIdx = src.indexOf('[P2-HIST-NEW-4', idx + 1);
        expect(computeIdx).toBeGreaterThan(-1);
        const block = src.slice(computeIdx, computeIdx + 2500);
        // El compute llama a getChunkKindLabel(_kindRaw) || _kindRaw.
        expect(block).toMatch(
            /getChunkKindLabel\(_kindRaw\)\s*\|\|\s*_kindRaw/
        );
    });

    it('badge separator " · " se preserva (consistente con previous render)', () => {
        const idx = src.indexOf('[P2-HIST-NEW-4 · 2026-05-09]');
        const computeIdx = src.indexOf('[P2-HIST-NEW-4', idx + 1);
        const block = src.slice(computeIdx, computeIdx + 2500);
        // Template literal `· ${_kindLabelText}` o ` · ${_kindLabelText}`.
        expect(block).toMatch(/['"`]\s*·\s*\$\{_kindLabelText\}/);
    });

    it('NO render de "· undefined" cuando chunk_kind es null', () => {
        // Guard: si _kindRaw es '' o null, _kindLabel queda como ''
        // (sin separador). Sin esto, el badge mostraría "Semana 1 · ".
        const idx = src.indexOf('[P2-HIST-NEW-4 · 2026-05-09]');
        const computeIdx = src.indexOf('[P2-HIST-NEW-4', idx + 1);
        const block = src.slice(computeIdx, computeIdx + 2500);
        expect(block).toMatch(/_kindRaw\s*=\s*c\.chunk_kind\s*\|\|\s*['"]['"]/);
    });
});
