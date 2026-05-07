/**
 * Tests P0-13: el side-effect "campo faltante → toast + navigate a /assessment"
 * NO debe vivir en render fase.
 *
 * Bug original (audit P0-13):
 *   El bloque `if (!loadingSensitive) { ... if (missing) { setTimeout(...);
 *   return <Navigate to="/assessment" />; } }` vivía DENTRO de la función de
 *   render del componente Plan. React StrictMode invoca el render dos veces
 *   en desarrollo, y cualquier re-render por cambio de estado
 *   (`loadingSensitive` flickeando true→false→true durante token refresh,
 *   `setStatus` o spurious re-render) programaba múltiples timeouts → toasts
 *   duplicados. Más grave: si `formData` se hidrataba post-primer-render con
 *   `loadingSensitive=false` y `missing=null`, el componente ya había emitido
 *   un toast engañoso ("Falta completar X") y disparado un `<Navigate>` en
 *   render → rebote `/plan ↔ /assessment` con toasts duplicados.
 *
 * Fix:
 *   1. Toast + navigate se ejecutan en `useEffect` con `[loadingSensitive,
 *      formData, navigate]` como deps.
 *   2. Toast dedupado vía `useRef` (1 toast por mount).
 *   3. `navigate('/assessment', { replace: true })` desde efecto, NO
 *      `<Navigate>` en render.
 *   4. Mientras el effect navega, render retorna `<LoadingScreen>` (sin
 *      side-effects).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PLAN_PATH = path.resolve(__dirname, '..', 'pages', 'Plan.jsx');
const src = fs.readFileSync(PLAN_PATH, 'utf-8');


// Filtra líneas que son solo comentarios (// ...) — los comentarios pueden
// referirse al patrón roto a propósito (documentando el bug). El test mira
// código activo.
const codeOnly = src
    .split('\n')
    .filter((ln) => !ln.trim().startsWith('//'))
    .join('\n');


describe('P0-13 — Plan.jsx no debe tener side-effects en render', () => {
    it('NO contiene `<Navigate>` activo en JSX (debe usar `navigate(...)` desde useEffect)', () => {
        // El JSX `<Navigate to="/assessment" />` era el síntoma visible del
        // side-effect en render. Tras P0-13 debe haberse eliminado.
        expect(codeOnly).not.toMatch(/<\s*Navigate\b/);
    });

    it('NO importa `Navigate` desde react-router-dom (cleanup post-fix)', () => {
        // El import de Navigate quedaba sin uso tras el fix. Lo eliminamos
        // para que un futuro maintainer no lo rein-troduzca por accidente.
        expect(codeOnly).not.toMatch(/from\s+['"]react-router-dom['"][^;]*\bNavigate\b/);
    });

    it('NO contiene `setTimeout` programando toast en render fase', () => {
        // El patrón roto: `setTimeout(() => { import('sonner')... toast.info... })`.
        // Tras el fix, `import('sonner')` solo aparece dentro de useEffect /
        // catch handlers, NO bajo un setTimeout(0) que era el wrapper del
        // side-effect en render.
        const badPattern = /setTimeout\(\s*\(\)\s*=>\s*\{[^}]*?import\(\s*['"]sonner['"]/s;
        expect(codeOnly).not.toMatch(badPattern);
    });

    it('Documenta el contrato P0-13 con un comentario explicativo', () => {
        // Defensa contra reintroducción: si alguien borra el useEffect, el
        // grep falla y obliga a entender el rationale.
        expect(src).toMatch(/\[P0-13\]/);
    });
});


describe('P0-13 — toast dedupe via useRef', () => {
    it('Plan.jsx declara `incompleteToastShownRef` para dedupar toasts', () => {
        // El ref garantiza UN solo toast por mount aunque el effect re-ejecute
        // por cambios en deps (`formData`, `loadingSensitive`).
        expect(codeOnly).toMatch(/incompleteToastShownRef\s*=\s*useRef\(/);
    });

    it('El useEffect verifica el ref antes de mostrar toast', () => {
        // Patrón canónico: `if (!incompleteToastShownRef.current) { ... = true; toast(...) }`.
        const dedupePattern = /if\s*\(\s*!\s*incompleteToastShownRef\.current\s*\)\s*\{/;
        expect(codeOnly).toMatch(dedupePattern);
    });
});


describe('P0-13 — navegación por useEffect, no por render', () => {
    it('El useEffect llama `navigate(\'/assessment\', { replace: true })`', () => {
        // El effect debe usar el hook navigate (capturado en línea 349) con
        // replace:true para no contaminar el history stack del browser.
        const navigatePattern = /navigate\(\s*['"]\/assessment['"]\s*,\s*\{\s*replace:\s*true\s*\}\s*\)/;
        expect(codeOnly).toMatch(navigatePattern);
    });

    it('El useEffect tiene dependencias `[loadingSensitive, formData, navigate]`', () => {
        // Sin formData en deps, el effect no re-evaluaría tras hidratación
        // post-login. Sin loadingSensitive, no aprovecharía el guard.
        const depsPattern = /\}\s*,\s*\[\s*loadingSensitive\s*,\s*formData\s*,\s*navigate\s*\]\s*\)\s*;/;
        expect(codeOnly).toMatch(depsPattern);
    });
});


describe('P0-13 — render retorna LoadingScreen mientras el effect redirige', () => {
    it('El render condicional usa LoadingScreen, no Navigate, cuando hay missing', () => {
        // Patrón post-fix: `if (!loadingSensitive && findFirstIncompleteField(formData))
        // { return <LoadingScreen ... /> }`. El effect dispara la navegación
        // en background; el LoadingScreen evita el flicker del Plan completo.
        const guardPattern = /if\s*\(\s*!\s*loadingSensitive\s*&&\s*findFirstIncompleteField\(\s*formData\s*\)\s*\)\s*\{\s*return\s*<\s*LoadingScreen/;
        expect(codeOnly).toMatch(guardPattern);
    });
});
