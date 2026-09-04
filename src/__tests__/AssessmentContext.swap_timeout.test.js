// [P1-SWAP-CLIENT-TIMEOUT · 2026-09-04] «Cambiar plato» tardó 71 s en prod (LLM ~20 s + motor de
// macros sobre todo el plan ~33 s + listas ~15 s); el cliente cortaba a los 60 s por defecto
// (nginx 499), pintaba una alternativa LOCAL genérica y el servidor guardaba el plato real
// 11 s después. Mismo defecto que P1-DAY-REGEN-CLIENT-TIMEOUT cerró ayer para «actualizar día».
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRequestTimeout, DEFAULT_REQUEST_TIMEOUT_MS } from '../config/api';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('src/context/AssessmentContext.jsx');

describe('cambiar plato: tope del cliente', () => {
    it('el fetch del swap pide 3 minutos, no los 60 s por defecto', () => {
        expect(SRC).toContain('const SWAP_TIMEOUT_MS = 3 * 60 * 1000;');
        const i = SRC.indexOf('fetchWithAuth(API_SWAP_URL, {');
        expect(i).toBeGreaterThan(0);
        expect(SRC.slice(i, i + 160)).toContain('timeout: SWAP_TIMEOUT_MS,');
        expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(60000);
        expect(resolveRequestTimeout('/api/plans/swap-meal', { timeout: 3 * 60 * 1000 })).toBe(180000);
    });

    it('si vence el tope: sin alternativa local, sin rojo, y el marker sobrevive para el resume', () => {
        const i = SRC.indexOf("if (error?.code === 'request_timeout') {");
        expect(i).toBeGreaterThan(0);
        const win = SRC.slice(i, i + 400);
        expect(win).toContain('_swapTimedOut = true;');
        expect(win).toContain("t('El plato sigue cocinándose en el servidor. Aparecerá solo en un momento.')");
        expect(win).toContain('return null;');
        // el timeout se decide ANTES del fallback local genérico
        expect(i).toBeLessThan(SRC.indexOf('const localFallback = getAlternativeMeal(mealType, currentName, targetCalories, userDietType);'));
        expect(SRC).toContain("if (!_swapTimedOut) safeLocalStorageRemove('mealfit_meal_regen_inflight');");
    });

    it('el aviso existe en los 4 catálogos', () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            expect(cat['El plato sigue cocinándose en el servidor. Aparecerá solo en un momento.'], loc).toBeTruthy();
        }
    });
});
