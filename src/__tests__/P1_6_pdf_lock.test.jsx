/**
 * Tests P1-6: candado síncrono `pdfLock` para `handleDownloadShoppingList`
 * en Dashboard.jsx.
 *
 * Bug original (audit P1-6):
 *   El botón "Descargar PDF" sólo tenía `disabled={isRecalculating}`. Pero
 *   `isRecalculating` NO se setea cuando el usuario hace click en el botón
 *   PDF — solo cuando se recalcula el plan completo. Si el usuario hacía
 *   doble-click rápido durante el `await fetchFreshInventoryWithTimeout()`
 *   (~2s), el handler se invocaba dos veces:
 *     - Dos `setLiveInventory(...)` competían por la misma key del state.
 *     - Dos `setInventoryStale(...)` con valores potencialmente distintos
 *       según qué fetch ganó.
 *     - Dos descargas idénticas del PDF.
 *     - Dos eventos de telemetría `pdf_stale_inventory_fallback`.
 *   No catastrófico (solo desperdicia ancho de banda + ruido en analytics)
 *   pero P1 menor en idempotencia.
 *
 * Fix:
 *   1. Nuevo ref `pdfLock = useRef(false)` (mismo patrón que `restockLock`
 *      que ya existía en línea 197).
 *   2. Early return al inicio del handler si el lock está activo.
 *   3. Lock = true al iniciar el handler.
 *   4. `finally` libera lock = false aunque el render falle.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DASH_PATH = path.resolve(__dirname, '..', 'pages', 'Dashboard.jsx');
const src = fs.readFileSync(DASH_PATH, 'utf-8');

// Filtrar líneas-comentario para que las explicaciones del bug no
// produzcan falsos positivos.
const codeOnly = src
    .split('\n')
    .filter((ln) => !ln.trim().startsWith('//'))
    .join('\n');


describe('P1-6 — Dashboard declara `pdfLock = useRef(false)`', () => {
    it('Dashboard.jsx contiene `pdfLock = useRef(false)`', () => {
        expect(codeOnly).toMatch(/pdfLock\s*=\s*useRef\(\s*false\s*\)/);
    });

    it('Documenta el rationale con [P1-6]', () => {
        expect(src).toMatch(/\[P1-6\]/);
    });
});


describe('P1-6 — handleDownloadShoppingList aplica el lock', () => {
    // Extraemos el cuerpo de la función para validaciones específicas.
    const handlerMatch = codeOnly.match(
        /const\s+handleDownloadShoppingList\s*=\s*async\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s{4}\};/
    );
    const handlerBody = handlerMatch ? handlerMatch[1] : '';

    it('Bloque del handler fue extraído correctamente', () => {
        expect(handlerBody).toBeTruthy();
        expect(handlerBody.length).toBeGreaterThan(100);
    });

    it('Hace early-return si pdfLock.current ya está activo', () => {
        // Patrón canónico: `if (pdfLock.current) return;` antes del try.
        expect(handlerBody).toMatch(/if\s*\(\s*pdfLock\.current\s*\)\s*return\s*;?/);
    });

    it('Setea `pdfLock.current = true` antes del try block', () => {
        // El lock debe activarse ANTES de entrar al try (canonical pattern).
        expect(handlerBody).toMatch(/pdfLock\.current\s*=\s*true/);
    });

    it('Libera `pdfLock.current = false` en `finally` para garantizar liberación ante errores', () => {
        // Patrón: `finally { pdfLock.current = false; }`.
        const finallyPattern = /finally\s*\{\s*[^}]*pdfLock\.current\s*=\s*false[^}]*\}/;
        expect(handlerBody).toMatch(finallyPattern);
    });

    it('El lock se setea ANTES del try (no dentro), para que un throw temprano del setLoadingToast no rompa simetría', () => {
        // Buscamos el orden textual: pdfLock = true ... antes de try {
        const lockTrueIdx = handlerBody.indexOf('pdfLock.current = true');
        const tryIdx = handlerBody.indexOf('try {');
        expect(lockTrueIdx).toBeGreaterThan(-1);
        expect(tryIdx).toBeGreaterThan(-1);
        expect(lockTrueIdx).toBeLessThan(tryIdx);
    });
});


describe('P1-6 — Simetría con restockLock (patrón establecido)', () => {
    it('restockLock declarado antes de pdfLock (orden semántico)', () => {
        // Mantener restockLock primero ayuda al lector a entender el patrón
        // como una "familia de candados" en el mismo bloque del componente.
        const restockIdx = codeOnly.indexOf('restockLock');
        const pdfIdx = codeOnly.indexOf('pdfLock');
        expect(restockIdx).toBeGreaterThan(-1);
        expect(pdfIdx).toBeGreaterThan(restockIdx);
    });

    it('pdfLock usa el mismo type de useRef(false) que restockLock', () => {
        expect(codeOnly).toMatch(/restockLock\s*=\s*useRef\(\s*false\s*\)/);
        expect(codeOnly).toMatch(/pdfLock\s*=\s*useRef\(\s*false\s*\)/);
    });
});


describe('P1-6 — Defensa contra reintroducción del bug', () => {
    it('El handler NO depende ÚNICAMENTE de `disabled={isRecalculating}` para gating', () => {
        // El gating del botón (`disabled={isRecalculating}`) sigue siendo
        // visual, pero NO es la SSOT contra doble-click. El lock síncrono
        // dentro del handler sí lo es.
        // Verificamos textualmente que pdfLock.current se chequea/setea
        // dentro de handleDownloadShoppingList — defensa contra refactor
        // futuro que borre el lock pensando que isRecalculating bastaba.
        const handlerMatch = codeOnly.match(
            /const\s+handleDownloadShoppingList\s*=\s*async\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s{4}\};/
        );
        expect(handlerMatch).toBeTruthy();
        const body = handlerMatch[1];
        expect(body).toMatch(/pdfLock/);
    });
});
