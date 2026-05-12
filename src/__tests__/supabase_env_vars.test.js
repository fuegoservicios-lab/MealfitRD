// [P1-AUDIT-2 · 2026-05-12] `frontend/src/supabase.js` debe leer URL y
// anon-key de variables de entorno Vite (`import.meta.env.VITE_SUPABASE_URL`
// y `import.meta.env.VITE_SUPABASE_ANON_KEY`), no hardcoded.
//
// Pre-fix: ambos literales estaban inline en el archivo → imposible tener
// staging/prod separados sin builds distintos. El anon-key es público por
// diseño (viaja al browser), no es secreto, pero la separación de entornos
// SÍ requiere flexibilidad.
//
// El fallback a los literales legacy se preserva por 1 release para
// back-compat — este test NO exige que el fallback haya sido eliminado, solo
// que las dos env vars estén leyéndose explícitamente.
//
// Cobertura (regex sobre el source):
//   A) `import.meta.env.VITE_SUPABASE_URL` aparece como lectura.
//   B) `import.meta.env.VITE_SUPABASE_ANON_KEY` aparece como lectura.
//   C) `createClient(supabaseUrl, supabaseAnonKey)` mantiene el patrón de
//      paso por variables (no parámetros literales).
//   D) `frontend/.env.example` documenta las dos vars.
//   E) Anchor `P1-AUDIT-2` presente en el código.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _SUPABASE_JS = join(__dirname, '..', 'supabase.js');
const _ENV_EXAMPLE = join(__dirname, '..', '..', '.env.example');

const src = readFileSync(_SUPABASE_JS, 'utf8');
const envExample = readFileSync(_ENV_EXAMPLE, 'utf8');

describe('P1-AUDIT-2: frontend supabase.js lee env vars', () => {
    it('A) lee VITE_SUPABASE_URL de import.meta.env', () => {
        const pattern = /import\.meta\.env\.VITE_SUPABASE_URL/;
        expect(pattern.test(src)).toBe(true);
    });

    it('B) lee VITE_SUPABASE_ANON_KEY de import.meta.env', () => {
        const pattern = /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/;
        expect(pattern.test(src)).toBe(true);
    });

    it('C) createClient se invoca con variables (no string literales)', () => {
        // Acepta `createClient(supabaseUrl, supabaseAnonKey)` u otros
        // identifiers — solo verificamos que NO sea literal string directo.
        const literalPattern = /createClient\s*\(\s*['"`]https?:\/\//;
        expect(literalPattern.test(src)).toBe(false);
    });

    it('D) .env.example documenta VITE_SUPABASE_URL', () => {
        expect(envExample.includes('VITE_SUPABASE_URL=')).toBe(true);
    });

    it('D2) .env.example documenta VITE_SUPABASE_ANON_KEY', () => {
        expect(envExample.includes('VITE_SUPABASE_ANON_KEY=')).toBe(true);
    });

    it('E) anchor P1-AUDIT-2 presente en supabase.js', () => {
        expect(src.includes('P1-AUDIT-2')).toBe(true);
    });
});
