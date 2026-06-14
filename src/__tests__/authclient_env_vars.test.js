// [P1-NEON-AUTH-MIGRATION · 2026-06-13] `frontend/src/authClient.js` crea
// el cliente de auth Neon Auth (Better Auth) via @neondatabase/neon-js, leyendo
// el Auth Base URL de `import.meta.env.VITE_NEON_AUTH_URL` (no hardcoded). Antes
// (P1-AUDIT-2) leía VITE_SUPABASE_URL/ANON_KEY del SDK legacy.
//
// Cobertura (regex sobre el source):
//   A) `import.meta.env.VITE_NEON_AUTH_URL` aparece como lectura.
//   B) El cliente se crea con la variable (no URL literal) via @neondatabase/neon-js.
//   C) Throw si la env var falta (sin fallback hardcoded de neonauth).
//   D) `frontend/.env.example` documenta VITE_NEON_AUTH_URL.
//   E) NO quedan lecturas de VITE_SUPABASE_* (eliminado).
//   F) Anchor `P1-NEON-AUTH` presente.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _SUPABASE_JS = join(__dirname, '..', 'authClient.js');
const _ENV_EXAMPLE = join(__dirname, '..', '..', '.env.example');

const src = readFileSync(_SUPABASE_JS, 'utf8');
const envExample = readFileSync(_ENV_EXAMPLE, 'utf8');

describe('P1-NEON-AUTH: frontend authClient.js lee Neon Auth URL de env', () => {
    it('A) lee VITE_NEON_AUTH_URL de import.meta.env', () => {
        expect(/import\.meta\.env\.VITE_NEON_AUTH_URL/.test(src)).toBe(true);
    });

    it('B) usa @neondatabase/neon-js, no createClient con URL literal', () => {
        expect(/@neondatabase\/neon-js/.test(src)).toBe(true);
        expect(/createClient\s*\(\s*\{?\s*['"`]https?:\/\//.test(src)).toBe(false);
    });

    it('C) throw si VITE_NEON_AUTH_URL falta (sin fallback neonauth hardcoded)', () => {
        expect(/throw new Error/.test(src)).toBe(true);
        expect(/=\s*['"`]https?:\/\/[^'"`]*neonauth/.test(src)).toBe(false);
    });

    it('D) .env.example documenta VITE_NEON_AUTH_URL', () => {
        expect(envExample.includes('VITE_NEON_AUTH_URL')).toBe(true);
    });

    it('E) NO quedan lecturas de VITE_SUPABASE_* (Supabase eliminado)', () => {
        expect(/VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY/.test(src)).toBe(false);
    });

    it('F) anchor P1-NEON-AUTH presente en authClient.js', () => {
        expect(src.includes('P1-NEON-AUTH')).toBe(true);
    });
});
