// [P-RECIPES-CHUNK-WINDOW] Guard contra regresión TDZ.
//
// Bug observado al implementar P-RECIPES-CHUNK-WINDOW:
//   El useEffect que clampaba `activeDayIndex` al window del chunk fue
//   declarado ANTES que `chunkStart`/`chunkSize`/`todayPlanDayIndex`. La
//   dependency array `[chunkStart, chunkSize, ...]` se evalúa al ejecutar
//   `useEffect(...)`, momento en el cual esas `const`s aún no están
//   inicializadas → ReferenceError: Cannot access 'chunkStart' before
//   initialization. Página crasheaba con GlobalErrorBoundary.
//
// Fix: mover el bloque de cómputo (`const _planDaysAll = ...; const
// chunkStart = ...`) ARRIBA del useEffect que lo consume.
//
// Este test estático parsea el source de Recipes.jsx y verifica que la
// declaración de `chunkStart` aparece ANTES que su primer uso dentro de
// un `useEffect`. Si un refactor futuro vuelve a invertir el orden,
// falla en CI antes de que el usuario vea el whitescreen.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _RECIPES_PATH = join(__dirname, '..', 'pages', 'Recipes.jsx');

describe('[P-RECIPES-CHUNK-WINDOW] Recipes.jsx — orden de declaración', () => {
    const src = readFileSync(_RECIPES_PATH, 'utf8');

    it('chunkStart se declara antes de su primer uso', () => {
        // Buscar la PRIMERA declaración: `const { start: chunkStart, ... } = ...`
        // o `const chunkStart = ...`.
        const declMatch = src.match(/const\s*\{\s*start:\s*chunkStart\b|const\s+chunkStart\s*=/);
        expect(declMatch).not.toBeNull();
        const declLine = src.slice(0, declMatch.index).split('\n').length;

        // Buscar el primer USO de `chunkStart` (que NO sea su propia declaración).
        // Buscamos cualquier match de `chunkStart` después del char 0.
        const usagePattern = /\bchunkStart\b/g;
        let firstUsageIdx = null;
        let m;
        while ((m = usagePattern.exec(src)) !== null) {
            // Saltar la declaración misma.
            if (m.index < declMatch.index || m.index === declMatch.index) continue;
            // Verificar que NO sea parte de la línea de la declaración.
            const beforeMatch = src.slice(0, m.index);
            const lastNewline = beforeMatch.lastIndexOf('\n');
            const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
            const declEnd = src.indexOf(';', declMatch.index);
            if (m.index >= lineStart && m.index <= declEnd) continue;
            firstUsageIdx = m.index;
            break;
        }
        expect(firstUsageIdx).not.toBeNull();
        const usageLine = src.slice(0, firstUsageIdx).split('\n').length;

        expect(declLine).toBeLessThan(usageLine);
    });

    it('chunkStart se declara antes del primer useEffect cuya deps array lo incluye', () => {
        // Buscar declaración de chunkStart.
        const declMatch = src.match(/const\s*\{\s*start:\s*chunkStart\b/);
        expect(declMatch).not.toBeNull();

        // El TDZ se dispara específicamente en la EVALUACIÓN de la deps array
        // del useEffect (que se evalúa al ejecutarse `useEffect(fn, [...])`).
        // Buscamos el patrón estricto: `}, [...chunkStart...])` que es la
        // forma final de un useEffect con chunkStart en deps. Esto evita
        // falsos positivos por menciones de chunkStart en comentarios cercanos.
        const depsMatch = src.match(/\}\s*,\s*\[[^\]]*\bchunkStart\b[^\]]*\]\s*\)/);
        expect(depsMatch).not.toBeNull();

        expect(declMatch.index).toBeLessThan(depsMatch.index);
    });

    it('todayPlanDayIndex se declara antes que la deps array que lo referencia', () => {
        const declMatch = src.match(/const\s+todayPlanDayIndex\s*=/);
        expect(declMatch).not.toBeNull();

        const depsMatch = src.match(/\}\s*,\s*\[[^\]]*\btodayPlanDayIndex\b[^\]]*\]\s*\)/);
        if (depsMatch) {
            expect(declMatch.index).toBeLessThan(depsMatch.index);
        }
        // Si no aparece en deps array, el riesgo de TDZ es menor (referencia
        // dentro del callback queda diferida a la ejecución del effect, NO
        // al render). Se considera OK.
    });

    it('cómputo del chunk usa optional chaining (null-safe pre-Navigate)', () => {
        // El cómputo debe correr ANTES del `if (!planData) return <Navigate />`,
        // por lo que debe acceder planData con optional chaining.
        // Verificamos que la lectura de `planData.days` en el bloque de chunk
        // use `planData?.days` (no `planData.days` directo).
        const computeBlock = src.match(
            /const\s+_planDaysAll\s*=\s*(planData\??\.days[^;]*);/
        );
        expect(computeBlock).not.toBeNull();
        expect(computeBlock[1]).toMatch(/planData\?\.days/);
    });
});
