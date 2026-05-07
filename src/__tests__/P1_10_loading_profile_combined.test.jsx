/**
 * Tests P1-10: el flag `loadingSensitive` cubre AMBAS fuentes de hidratación
 * post-login (sensitive cifrado + profile DB), no solo el secure cifrado.
 *
 * Bug original (audit P1-10):
 *   `loadingSensitive` arrancaba `true` SOLO si `localStorage.mealfit_form_secure`
 *   existía. Para usuarios en su PRIMER login en otro dispositivo (sin esa
 *   key pero con session activa), `loadingSensitive=false` desde el primer
 *   render aunque `fetchProfile` estuviera en vuelo desde Supabase
 *   (~100-500ms). Plan.jsx/useRegeneratePlan/InteractiveAssessmentFlow
 *   evaluaban `findFirstIncompleteField` antes de que `fetchProfile`
 *   completara → toast engañoso "Falta completar X" + redirect a /assessment
 *   con datos que SÍ existían en DB pero aún no llegaban al state.
 *
 * Fix:
 *   1. Nuevo state `loadingProfile` (init heuristic: `true` si hay user_id en
 *      localStorage no-guest).
 *   2. `handleAuthChange` setea `loadingProfile=true` antes del Promise.all
 *      con `fetchProfile`/`checkPlanLimit`/`restoreSessionData` y `false` en
 *      el `finally` del race + timeout.
 *   3. El context exporta `loadingSensitive` como `loadingSensitive || loadingProfile`
 *      → los 4 consumers existentes NO necesitan cambiar.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CTX_PATH = path.resolve(__dirname, '..', 'context', 'AssessmentContext.jsx');
const src = fs.readFileSync(CTX_PATH, 'utf-8');
const codeOnly = src
    .split('\n')
    .filter((ln) => !ln.trim().startsWith('//'))
    .join('\n');


describe('P1-10 — AssessmentContext declara loadingProfile state', () => {
    it('declara `loadingProfile` con su setter', () => {
        // Patrón canónico: const [loadingProfile, setLoadingProfile] = useState(...);
        expect(codeOnly).toMatch(/\[\s*loadingProfile\s*,\s*setLoadingProfile\s*\]\s*=\s*useState/);
    });

    it('init heuristic chequea mealfit_user_id (no solo mealfit_form_secure)', () => {
        // El init de loadingProfile debe arrancar `true` cuando hay user_id en
        // localStorage — la heurística distinta a la de loadingSensitive.
        // Buscamos la string en el bloque de inicialización (que es el primer
        // useState con esa shape).
        expect(codeOnly).toMatch(/mealfit_user_id/);
    });

    it('Comentario [P1-10] documenta el rationale', () => {
        expect(src).toMatch(/\[P1-10\]/);
    });
});


describe('P1-10 — handleAuthChange setea loadingProfile alrededor de los fetches', () => {
    it('Setea loadingProfile=true antes del Promise.all', () => {
        // Patrón: setLoadingProfile(true) antes de `Promise.all([fetchProfile, ...])`.
        // Buscamos al menos una llamada `setLoadingProfile(true)` en código activo.
        expect(codeOnly).toMatch(/setLoadingProfile\(\s*true\s*\)/);
    });

    it('Setea loadingProfile=false en finally del race con timeout', () => {
        // Patrón: try { await Promise.race(...) } finally { ... setLoadingProfile(false) }.
        // Verificamos que el `finally` y `setLoadingProfile(false)` aparecen
        // ambos en el código activo cerca del Promise.race.
        expect(codeOnly).toMatch(/setLoadingProfile\(\s*false\s*\)/);
        expect(codeOnly).toMatch(/finally\s*\{[^}]*setLoadingProfile\(\s*false\s*\)/s);
    });

    it('Setea loadingProfile=false en logout path (no session)', () => {
        // Buscamos `setLoadingProfile(false)` después del removeItem de
        // mealfit_user_id (señal estructural del bloque de logout).
        const logoutMatch = codeOnly.match(
            /removeItem\(\s*['"]mealfit_user_id['"]\s*\)[\s\S]{0,2000}setLoadingProfile\(\s*false\s*\)/
        );
        expect(logoutMatch).toBeTruthy();
    });

    it('Setea loadingProfile=false en catch de getSessionWithTimeout (red caída)', () => {
        // Buscamos `setLoadingProfile(false)` dentro del .catch del Promise.race.
        const catchMatch = codeOnly.match(/catch\(\(err\)[\s\S]*?setLoadingProfile\(\s*false\s*\)/);
        // Aceptar variantes con `(err)` o `((err))`
        expect(catchMatch || codeOnly.match(/\.catch\([^)]*\)\s*=>\s*\{[^}]*setLoadingProfile\(\s*false\s*\)/s)).toBeTruthy();
    });
});


describe('P1-10 — context exporta loadingSensitive combinado', () => {
    it('El value del Provider exporta loadingSensitive como `loadingSensitive || loadingProfile`', () => {
        // Patrón canónico al combinar: `loadingSensitive: loadingSensitive || loadingProfile`.
        expect(codeOnly).toMatch(
            /loadingSensitive\s*:\s*loadingSensitive\s*\|\|\s*loadingProfile/
        );
    });
});


describe('P1-10 — Defensa contra reintroducción del bug', () => {
    it('El export de loadingSensitive NO es solo el state crudo (sin combinar)', () => {
        // El patrón roto sería: `loadingSensitive,` (shorthand sin combinar).
        // Tras el fix, el shorthand ya NO debe aparecer en el value del provider.
        // Buscamos el bloque del Provider value y verificamos que NO contiene
        // shorthand `loadingSensitive,` aislado.
        const providerMatch = codeOnly.match(/<AssessmentContext\.Provider\s+value=\{\{([\s\S]*?)\}\}>/);
        expect(providerMatch).toBeTruthy();
        const providerBlock = providerMatch[1];
        // Buscamos el patrón roto: `loadingSensitive,` (con coma, no como key:value).
        // El patrón canónico nuevo es `loadingSensitive: loadingSensitive || loadingProfile,`
        // así que `loadingSensitive,` solo (shorthand) NO debe aparecer.
        expect(providerBlock).not.toMatch(/^\s*loadingSensitive,\s*$/m);
    });
});
