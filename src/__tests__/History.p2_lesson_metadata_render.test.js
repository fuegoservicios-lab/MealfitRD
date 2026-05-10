// [P2-HIST-NEW-2 · 2026-05-09] Tests del render de `metadata` en
// el tab Lecciones del modal del Historial.
//
// Bug original (audit profundo Historial 2026-05-09):
//   `chunk_lesson_telemetry.metadata` (jsonb) recibía contexto
//   arbitrario de los crons (`{score: 85, threshold: 50}`,
//   `{retries: 3, error: "..."}`) pero el frontend descartaba el
//   campo. Diagnóstico potencial perdido.
//
// Fix:
//   Render condicional de hasta 3 chips inline `key: value` con
//   sanitización por tipo:
//     - number/boolean → render directo.
//     - string → trim + truncate ≤24 chars.
//     - object/array → JSON.stringify + truncate ≤24.
//   Si hay >3 keys, chip "+N más" con JSON completo en title= tooltip.
//
// Cobertura:
//   1. Anchor del marker.
//   2. Render condicional: skip cuando metadata null/no-dict/array.
//   3. Skip cuando dict vacío (Object.entries.length === 0).
//   4. Render top-3 keys con sanitización por tipo.
//   5. Chip "+N más" cuando hay >3 keys.
//   6. JSON completo en title= del chip "+N más".
//   7. Truncate en values >24 chars.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P2-HIST-NEW-2] anchor + render condicional', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P2-HIST-NEW-2\s*·\s*2026-05-09\]/);
    });

    it('lee lesson.metadata con guards typeof object + !Array', () => {
        // Defensivo: rejecta null, string, list. Object.entries en
        // un null/string/array rompería el render.
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/lesson\.metadata/);
        expect(block).toMatch(
            /typeof\s+lesson\.metadata\s*===\s*['"]object['"]/
        );
        expect(block).toMatch(/!Array\.isArray\(lesson\.metadata\)/);
    });

    it('skip cuando Object.entries length === 0 (dict vacío)', () => {
        // Empty dict {} es válido pero sin contenido — no renderizar
        // chips vacíos.
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/_entries\.length\s*===\s*0/);
    });
});


describe('[P2-HIST-NEW-2] sanitización por tipo del value', () => {
    it('number/boolean: render directo via String(v)', () => {
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(
            /typeof\s+v\s*===\s*['"]number['"]\s*\|\|\s*typeof\s+v\s*===\s*['"]boolean['"]/
        );
        expect(block).toMatch(/return\s+String\(v\)/);
    });

    it('string: trim + truncate ≤24 chars', () => {
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/typeof\s+v\s*===\s*['"]string['"]/);
        expect(block).toMatch(/_t\.length\s*>\s*24/);
        expect(block).toMatch(/_t\.slice\(\s*0\s*,\s*23\s*\)\s*\+\s*['"]…['"]/);
    });

    it('object/array: JSON.stringify defensivo + truncate', () => {
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/JSON\.stringify\(v\)/);
        expect(block).toMatch(/_json\.length\s*>\s*24/);
    });

    it('JSON.stringify wrapped en try/catch (defensivo contra circulares)', () => {
        // Aunque el backend ya sanitiza no-dict a None, un dict con
        // referencias circulares (post-mutación frontend?) rompería
        // JSON.stringify. Try/catch evita el crash.
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/try\s*\{[\s\S]*?_json\s*=\s*JSON\.stringify\(v\)/);
        expect(block).toMatch(/return\s+['"]\[obj\]['"]/);
    });
});


describe('[P2-HIST-NEW-2] cap visual de chips', () => {
    it('top-3 entries con slice(0, 3)', () => {
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/_entries\.slice\(\s*0\s*,\s*3\s*\)/);
    });

    it('chip "+N más" cuando hay >3 keys', () => {
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        // _extra = entries.length - 3
        expect(block).toMatch(/_entries\.length\s*-\s*3/);
        // Render del +N más con copy es-DO.
        expect(block).toMatch(/\+\{_extra\}\s+m[aá]s/);
    });

    it('JSON.stringify completo en title= del chip "+N más"', () => {
        // El chip "+N más" debe exponer JSON pretty-printed (indent 2)
        // en su tooltip para inspección rápida hover.
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/JSON\.stringify\(\s*lesson\.metadata\s*,\s*null\s*,\s*2\s*\)/);
        expect(block).toMatch(/title=\{_fullJson\}/);
    });
});


describe('[P2-HIST-NEW-2] formato del chip key:value', () => {
    it('cada chip muestra "key: value"', () => {
        // Template: `${k}: ${_fmtVal(v)}`.
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/\{k\}:\s*\{_fmtVal\(v\)\}/);
    });

    it('title= individual también incluye key + value', () => {
        // Tooltip de chips top-3: `${k}: ${_fmtVal(v)}` para inspeccionar
        // value cuando truncated.
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/title=\{`\$\{k\}:\s*\$\{_fmtVal\(v\)\}/);
    });

    it('key del React .map es estable (key={`meta-${k}`})', () => {
        // Sin key estable, React puede re-mountar chips innecesariamente.
        const idx = src.indexOf('[P2-HIST-NEW-2');
        const block = src.slice(idx, idx + 8000);
        expect(block).toMatch(/key=\{`meta-\$\{k\}`\}/);
    });
});
