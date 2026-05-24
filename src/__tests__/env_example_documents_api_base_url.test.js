// [F-P1-4 · 2026-05-23] `.env.example` debe documentar `VITE_API_BASE_URL`
// porque `src/config/api.js:6` lo lee con fallback silencioso a `''`.
//
// Gap original (audit production-readiness 2026-05-23, F-P1-4):
//   `src/config/api.js:6`:
//     export const API_BASE = import.meta.env.DEV
//         ? 'http://127.0.0.1:3001'
//         : (import.meta.env.VITE_API_BASE_URL || '');
//
//   En producción, si el operador NO setea `VITE_API_BASE_URL`, el fallback
//   a `''` produce URLs relativas (`/api/...`). Eso funciona si frontend y
//   backend están bajo el mismo dominio (mismo Vercel project con rewrites
//   al backend). PERO si están en dominios separados (e.g. frontend en
//   `app.mealfitrd.com`, backend en `api.mealfitrd.com`), las requests
//   caen a `app.mealfitrd.com/api/...` que no existe → 404 silencioso o
//   CORS error sin diagnóstico claro.
//
//   Pre-fix `.env.example` NO mencionaba la variable → operador no sabía
//   que debía setearla en deploy cross-domain.
//
// Fix:
//   Añadir entry comentada `# VITE_API_BASE_URL=https://api.mealfitrd.com`
//   en `.env.example` con explicación del modo de fallo y los 3 escenarios:
//     (a) Dev local: NO setear.
//     (b) Producción same-domain: NO setear.
//     (c) Producción cross-domain: SETEAR.
//
// Cobertura:
//   A) `.env.example` menciona `VITE_API_BASE_URL`.
//   B) La mención incluye explicación de los 3 escenarios.
//   C) El anchor `F-P1-4` está presente en el comentario.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _ENV_EXAMPLE = join(__dirname, '..', '..', '.env.example');
const _API_JS = join(__dirname, '..', 'config', 'api.js');

const envText = readFileSync(_ENV_EXAMPLE, 'utf8');
const apiText = readFileSync(_API_JS, 'utf8');

describe('F-P1-4: .env.example documenta VITE_API_BASE_URL', () => {
    it('A) src/config/api.js sigue leyendo `VITE_API_BASE_URL`', () => {
        // Sanity: si alguien refactorizó el config y ya no usa esta env var,
        // este gap deja de aplicar — actualizar el test.
        expect(
            apiText.includes('VITE_API_BASE_URL'),
            'src/config/api.js ya NO lee VITE_API_BASE_URL — gap F-P1-4 obsoleto. ' +
            'Eliminar este test si la var ya no se usa.',
        ).toBe(true);
    });

    it('B) `.env.example` menciona `VITE_API_BASE_URL`', () => {
        expect(
            envText.includes('VITE_API_BASE_URL'),
            '.env.example NO menciona `VITE_API_BASE_URL`. Sin documentación, ' +
            'deploy cross-domain falla con 404 silencioso. Restaurar entry.',
        ).toBe(true);
    });

    it('C) doc explica los 3 escenarios (dev / same-domain / cross-domain)', () => {
        // Heurística: aparición de las 3 keywords críticas. Normalizar
        // whitespace (incluido newline) para tolerar wrapping del comentario.
        const normalized = envText.toLowerCase().replace(/\s+/g, ' ');
        const hasScenarios =
            (normalized.includes('dev local') || normalized.includes('desarrollo')) &&
            (normalized.includes('mismo dominio') || normalized.includes('same-domain') || normalized.includes('same domain')) &&
            (normalized.includes('cross-domain') || normalized.includes('cross domain') || normalized.includes('dominios separados'));
        expect(
            hasScenarios,
            `Doc de VITE_API_BASE_URL no cubre los 3 escenarios canónicos ` +
            `(dev local, mismo dominio, cross-domain). Restaurar explicación.`,
        ).toBe(true);
    });

    it('D) anchor F-P1-4 presente en el comentario', () => {
        expect(
            envText.includes('F-P1-4'),
            '.env.example perdió el anchor `F-P1-4` que documenta el gap. ' +
            'Sin anchor, un refactor cosmético borra el contexto.',
        ).toBe(true);
    });
});
