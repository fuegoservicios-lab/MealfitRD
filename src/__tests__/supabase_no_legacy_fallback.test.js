// [P1-FRONTEND-1 · 2026-05-12] `frontend/src/supabase.js` NO debe declarar
// `_LEGACY_URL` ni `_LEGACY_ANON_KEY` como fallback. Pre-fix:
//
//   const _LEGACY_URL = 'https://mpoodlmnzaeuuazsazbj.supabase.co';
//   const _LEGACY_ANON_KEY = 'eyJh...';
//   const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || _LEGACY_URL;
//
// Eso significaba: un build de QA con .env vacío apuntaba silenciosamente
// a producción. El anon-key es público por diseño (RLS filtra) pero el URL
// hardcoded clavaba el proyecto → impossible separación de entornos.
//
// Fix:
//   - Eliminar ambos literales.
//   - Si las env vars faltan → throw Error en el módulo (Vite expone el
//     error en build prod; en dev npm run dev también falla).
//
// Cobertura (regex sobre el source):
//   A) `_LEGACY_URL` y `_LEGACY_ANON_KEY` NO aparecen como variables.
//   B) No hay literales `https://*.supabase.co` hardcoded.
//   C) No hay JWT hardcoded (literal que empieza con `eyJ` y >100 chars).
//   D) Existe un `throw new Error` o `throw` cuando las env vars faltan.
//   E) Anchor `P1-FRONTEND-1` presente.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _SUPABASE_JS = join(__dirname, '..', 'supabase.js');
const src = readFileSync(_SUPABASE_JS, 'utf8');

describe('P1-FRONTEND-1: supabase.js sin fallback hardcoded', () => {
    it('A) `_LEGACY_URL` no declarado', () => {
        // Solo prohibimos la DECLARACIÓN como `const _LEGACY_URL =` —
        // referencias en comentarios siguen aceptables (documentar el
        // patrón antiguo es útil).
        const pattern = /\bconst\s+_LEGACY_URL\s*=/;
        expect(pattern.test(src)).toBe(false);
    });

    it('A2) `_LEGACY_ANON_KEY` no declarado', () => {
        const pattern = /\bconst\s+_LEGACY_ANON_KEY\s*=/;
        expect(pattern.test(src)).toBe(false);
    });

    it('B) sin URL Supabase hardcoded en literal', () => {
        // Cualquier literal `'https://<algo>.supabase.co'` o `"..."` es
        // sospechoso. Aceptamos el placeholder `<project-ref>` (no es URL real).
        const pattern = /['"`]https?:\/\/[a-z0-9-]+\.supabase\.co['"`]/;
        expect(pattern.test(src)).toBe(false);
    });

    it('C) sin JWT hardcoded (eyJ... > 100 chars)', () => {
        // Anon-keys son JWTs HS256 que siempre empiezan con `eyJh`. Si
        // aparece uno con 100+ chars dentro de comillas → es un literal
        // hardcoded.
        const pattern = /['"`]eyJ[A-Za-z0-9_-]{100,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+['"`]/;
        expect(pattern.test(src)).toBe(false);
    });

    it('D) throw si env vars faltan', () => {
        // El módulo debe abortar al primer import si las env vars no están.
        // Esto fuerza disciplina y bloquea cross-environment leak.
        const pattern = /throw\s+new\s+Error\(/;
        expect(pattern.test(src)).toBe(true);
    });

    it('E) anchor de no-hardcoded-fallback presente (P1-FRONTEND-1 o P1-NEON-AUTH)', () => {
        // [P1-NEON-AUTH-MIGRATION · 2026-06-13] El principio "sin fallback
        // hardcoded + throw si falta env var" se preserva para el cliente de
        // Neon Auth. El anchor migró de P1-FRONTEND-1 (Supabase) a P1-NEON-AUTH.
        expect(src.includes('P1-FRONTEND-1') || src.includes('P1-NEON-AUTH')).toBe(true);
    });
});
