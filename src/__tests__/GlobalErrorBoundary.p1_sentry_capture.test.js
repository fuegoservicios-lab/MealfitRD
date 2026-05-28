// [P1-ERROR-BOUNDARY-SENTRY-CAPTURE · 2026-05-24] Tests parser-based.
//
// Bug original (audit production-readiness 2026-05-24):
//   `GlobalErrorBoundary.componentDidCatch` solo loguea en DEV. NO llama
//   `Sentry.captureException(error, { contexts: { react: { componentStack }}})`.
//   @sentry/react NO auto-captura errores swalloweados por error boundaries
//   — solo ve window.onerror / unhandled promise rejections. Resultado:
//     1. Cualquier crash de render que cae al boundary es INVISIBLE para SRE
//        post-incidente (no aparece en Sentry, no hay stack).
//     2. UI muestra "Actualizando App..." (copy diseñado SOLO para chunk-load)
//        engañando al user en crashes genuinos. Confusión + soporte tickets.
//
// Fix:
//   - Named import `captureException` (preserva tree-shake P2-SENTRY-TREESHAKE).
//   - componentDidCatch pre-clasifica isChunkLoadError en getDerivedStateFromError
//     para que render decida copy sin re-evaluar message.
//   - Si NO es chunk-load → `captureException(error, { contexts.react.componentStack,
//     tags.error_boundary='global' })` best-effort try/catch.
//   - Si es chunk-load → reload sin reportar a Sentry (consecuencia esperada
//     de deploy, satura cuota con falsos positivos).
//   - Copy diferenciado: "Actualizando App..." chunk-load vs "Algo salió mal"
//     crash genuino con CTA explícito (no auto-reload — evita loop si crash
//     es repetible).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _PATH = join(__dirname, '..', 'components', 'GlobalErrorBoundary.jsx');
const src = readFileSync(_PATH, 'utf8');


describe('[P1-ERROR-BOUNDARY-SENTRY-CAPTURE] anchor + import', () => {
    it('marker presente en GlobalErrorBoundary.jsx', () => {
        expect(src).toMatch(/\[P1-ERROR-BOUNDARY-SENTRY-CAPTURE\s*·\s*2026-05-24\]/);
    });

    it('importa captureException via named import (tree-shake-friendly)', () => {
        expect(src).toMatch(
            /import\s*\{\s*captureException\s*\}\s*from\s*['"]@sentry\/react['"]/
        );
    });

    it('cero star-import de @sentry/react (regression guard P2-SENTRY-TREESHAKE)', () => {
        expect(src).not.toMatch(/import\s*\*\s*as\s+\w+\s+from\s*['"]@sentry\/react['"]/);
    });
});


describe('[P1-ERROR-BOUNDARY-SENTRY-CAPTURE] componentDidCatch reporta a Sentry', () => {
    it('llama captureException con error + componentStack', () => {
        // El call debe incluir error como primer arg + contexts.react.componentStack.
        expect(src).toMatch(/captureException\s*\(\s*error\s*,/);
        expect(src).toMatch(/componentStack:\s*errorInfo\??\.componentStack/);
    });

    it('etiqueta error_boundary="global" para filtrado en Sentry', () => {
        expect(src).toMatch(/error_boundary:\s*['"]global['"]/);
    });

    it('captureException envuelto en try/catch best-effort (no tumba fallback UI)', () => {
        // Buscamos el bloque que contiene captureException y verificamos try/catch.
        const captureIdx = src.indexOf('captureException(');
        expect(captureIdx).toBeGreaterThan(-1);
        const before = src.slice(Math.max(0, captureIdx - 400), captureIdx);
        expect(before).toMatch(/try\s*\{/);
    });

    it('NO reporta a Sentry cuando isChunkLoadError (evita falsos positivos)', () => {
        // El branch chunk-load debe llamar setTimeout + reload + return SIN
        // pasar por captureException. Verificamos que captureException aparece
        // DESPUÉS del bloque chunk-load (return early).
        const chunkIdx = src.indexOf('window.location.reload(true)');
        const captureIdx = src.indexOf('captureException(');
        expect(chunkIdx).toBeGreaterThan(-1);
        expect(captureIdx).toBeGreaterThan(-1);
        // captureException debe aparecer DESPUÉS del primer reload chunk-load.
        // Esto enforza que el branch chunk-load no llega al captureException.
        expect(captureIdx).toBeGreaterThan(chunkIdx);
    });
});


describe('[P1-ERROR-BOUNDARY-SENTRY-CAPTURE] copy diferenciado en render', () => {
    it('getDerivedStateFromError clasifica isChunkLoadError en state', () => {
        // El state debe incluir isChunkLoadError, populado por getDerivedStateFromError.
        expect(src).toMatch(
            /static\s+getDerivedStateFromError\s*\([^)]*\)\s*\{[\s\S]*?return\s*\{\s*hasError:\s*true\s*,\s*isChunkLoadError\b/
        );
    });

    it('render branch chunk-load mantiene copy "Actualizando App..."', () => {
        // Buscamos el render del fallback. Debe haber un if(isChunkLoadError) que
        // renderiza "Actualizando App..." y un fallback distinto para crash genuino.
        expect(src).toMatch(/Actualizando\s+App/);
        expect(src).toMatch(/this\.state\.isChunkLoadError/);
    });

    it('render branch crash genuino tiene CTA explícito de recargar (no auto)', () => {
        expect(src).toMatch(/Algo\s+sali[oó]\s+mal/);
        // CTA button con onClick reload.
        expect(src).toMatch(
            /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*window\.location\.reload\s*\(\s*true\s*\)\s*\}/
        );
    });
});
