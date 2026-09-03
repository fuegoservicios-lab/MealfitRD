// [P1-DAY-REGEN-CLIENT-TIMEOUT · 2026-09-03] «Actualizar día» son 4-5 swaps en serie (2-3 min);
// el fetch llevaba el timeout por defecto de 60 s: el cliente abortaba (nginx 499), el servidor
// terminaba y persistía, y el usuario leía «Revisa tu conexión». Tope de 6 min y, si vence,
// aviso honesto (sigue cocinándose) conservando el marker para que el día se adopte solo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRequestTimeout, DEFAULT_REQUEST_TIMEOUT_MS } from '../config/api';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('src/context/AssessmentContext.jsx');

describe('actualizar día: tope del cliente', () => {
    it('el fetch de regenerate-day pide 6 minutos, no los 60 s por defecto', () => {
        expect(SRC).toContain('const DAY_REGEN_TIMEOUT_MS = 6 * 60 * 1000;');
        const i = SRC.indexOf('/regenerate-day`, {');
        expect(i).toBeGreaterThan(0);
        expect(SRC.slice(i, i + 200)).toContain('timeout: DAY_REGEN_TIMEOUT_MS,');
        expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(60000);
        expect(resolveRequestTimeout('/api/plans/x/regenerate-day', { timeout: 6 * 60 * 1000 })).toBe(360000);
    });
    it('si vence el tope, no se culpa a la red y el marker sobrevive para el resume', () => {
        expect(SRC).toContain("if (_e?.code === 'request_timeout') {");
        expect(SRC).toContain("t('El día sigue cocinándose en el servidor. Aparecerá solo en unos minutos.')");
        expect(SRC).toContain("if (!_timedOut) safeLocalStorageRemove('mealfit_day_regen_inflight');");
        expect(SRC).toContain('return { ok: false, pending: true };');
    });
    it('catálogos: la clave nueva en los 4 idiomas', () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            expect(cat['El día sigue cocinándose en el servidor. Aparecerá solo en unos minutos.'], loc).toBeTruthy();
        }
    });
});
