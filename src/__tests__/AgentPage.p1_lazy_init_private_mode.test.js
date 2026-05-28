// [P1-AGENT-LAZY-INIT-PRIVATE-MODE · 2026-05-24] Tests parser-based.
//
// Bug original (audit production-readiness 2026-05-24):
//   AgentPage.jsx:469 useState lazy initializer de `localSessionId` usaba
//   `localStorage.getItem('mealfit_guest_session')` RAW sin try/catch.
//   En iOS Private Mode el getter lanza `SecurityError` durante mount →
//   throw en lazy init → AgentPage entero no rendea → cae al
//   GlobalErrorBoundary loop. Mismo modo de fallo que P1-PROD-FINAL-1
//   cerró en Settings/Dashboard lazy initializers; AgentPage quedó fuera
//   del scope original.
//
//   El siguiente lazy initializer (línea 476-480, `guestSessionIds`) YA
//   tenía try/catch (P2-B), por lo que NO requiere acción.
//
// Fix:
//   - Línea 469 migrada a `safeLocalStorageGet('mealfit_guest_session', null)`.
//   - safeLocalStorageGet ya estaba importado (P2-AUDIT-3-SAFE-LOCALSTORAGE).
//   - safeLocalStorageSet ya usado para el set (`mealfit_guest_session`).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _PATH = join(__dirname, '..', 'pages', 'AgentPage.jsx');
const src = readFileSync(_PATH, 'utf8');


describe('[P1-AGENT-LAZY-INIT-PRIVATE-MODE] anchor + safe getter', () => {
    it('marker presente en AgentPage.jsx', () => {
        expect(src).toMatch(/\[P1-AGENT-LAZY-INIT-PRIVATE-MODE\s*·\s*2026-05-24\]/);
    });

    it('localSessionId lazy initializer usa safeLocalStorageGet (no raw getItem)', () => {
        // El bloque del setLocalSessionId debe usar safeLocalStorageGet, no localStorage.getItem.
        const localSessIdx = src.indexOf('setLocalSessionId');
        expect(localSessIdx).toBeGreaterThan(-1);
        // Buscamos el lazy initializer asociado: el primer useState((...) que aparece
        // antes o cerca de localSessionId.
        const setterIdx = src.indexOf('const [localSessionId, setLocalSessionId]');
        expect(setterIdx).toBeGreaterThan(-1);
        const block = src.slice(setterIdx, setterIdx + 800);
        expect(block).toMatch(/safeLocalStorageGet\s*\(\s*['"]mealfit_guest_session['"]/);
        // Cero raw getItem en este bloque específico.
        expect(block).not.toMatch(/localStorage\.getItem\s*\(\s*['"]mealfit_guest_session['"]/);
    });

    it('safeLocalStorageGet importado desde utils/safeLocalStorage', () => {
        expect(src).toMatch(
            /import\s*\{[^}]*safeLocalStorageGet[^}]*\}\s*from\s*['"]\.\.\/utils\/safeLocalStorage['"]/
        );
    });
});
