import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// [P2-NEON-LAZY · 2026-07-12] El SDK @neondatabase/neon-js (~89KB gzip, chunk
// vendor-neon-auth) viajaba EAGER en el entry con modulepreload porque authClient.js
// lo importaba estático y AssessmentContext (eager) importa authClient. Este test
// ancla el fix estructural: el SDK se carga vía dynamic import() (chunk async
// on-demand) Y el chunk deja de estar NOMBRADO en manualChunks (si no, Vite emite
// modulepreload eager igual — lección P1-PERF-FRAMER-SPLIT).

const _dir = dirname(fileURLToPath(import.meta.url));
const _authClient = readFileSync(resolve(_dir, '../authClient.js'), 'utf8');
const _viteConfig = readFileSync(resolve(_dir, '../../vite.config.js'), 'utf8');

describe('[P2-NEON-LAZY] SDK de Neon Auth fuera del critical path', () => {
    it('authClient.js carga el SDK vía dynamic import(), NO import estático top-level', () => {
        // Dynamic import presente.
        expect(_authClient).toMatch(/import\(\s*['"]@neondatabase\/neon-js['"]\s*\)/);
        // Import estático top-level AUSENTE (regresaría el SDK al entry eager).
        expect(_authClient).not.toMatch(
            /^\s*import\s+\{[^}]*\}\s+from\s+['"]@neondatabase\/neon-js['"]/m
        );
    });

    it('preserva la validación top-level de VITE_NEON_AUTH_URL (fail-loud sin env)', () => {
        // Los tests authclient_env_vars C/D exigen el throw a nivel módulo.
        expect(_authClient).toMatch(/VITE_NEON_AUTH_URL/);
        expect(_authClient).toMatch(/throw new Error/);
    });

    it('vite.config manualChunks ya NO nombra vendor-neon-auth como KEY', () => {
        // Un vendor chunk NOMBRADO recibe modulepreload eager aunque solo se
        // alcance por dynamic import → hay que quitarlo del manualChunks. Chequeamos
        // la KEY `'vendor-neon-auth':` (no el string suelto, que sigue en un comment
        // explicando la remoción).
        expect(_viteConfig).not.toMatch(/['"]vendor-neon-auth['"]\s*:/);
        // Defensa extra: el paquete no debe aparecer en ninguna asignación de chunk.
        expect(_viteConfig).not.toMatch(/['"]vendor-neon-auth['"]\s*:\s*\[/);
    });
});
