/**
 * [P1-3 · TanStack Query foundation] El queryClient singleton + clearUserQueryCache
 * son la base del fix estructural de la clase de fuga PII cross-user (6 fixes se
 * enviaron por la misma raíz: caches keyed sin user_id, purgadas por una lista a
 * mano). La convención: query keys [recurso, userId] + UN clear() en logout/
 * user-switch evicta TODO el estado de servidor atómicamente.
 *
 * Este test ancla el mecanismo de clear. El wiring (que _clearUserScopedCaches lo
 * invoca) se ancla con el parser test de AssessmentContext abajo.
 */
import { describe, it, expect, vi } from 'vitest';
import { queryClient, clearUserQueryCache } from '../queryClient';

describe('queryClient · clearUserQueryCache (P1-3)', () => {
    it('clear() vacía las queries cacheadas (aísla PII entre usuarios en dispositivo compartido)', () => {
        queryClient.setQueryData(['history-list', 'userA'], { plans: [1, 2, 3] });
        queryClient.setQueryData(['profile', 'userA'], { name: 'A' });
        expect(queryClient.getQueryData(['history-list', 'userA'])).toBeDefined();

        clearUserQueryCache();

        expect(queryClient.getQueryData(['history-list', 'userA'])).toBeUndefined();
        expect(queryClient.getQueryData(['profile', 'userA'])).toBeUndefined();
    });

    it('invoca queryClient.clear()', () => {
        const spy = vi.spyOn(queryClient, 'clear');
        clearUserQueryCache();
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// [P1-3] Parser-based: el teardown SSOT (_clearUserScopedCaches) DEBE invocar
// clearUserQueryCache — si un refactor lo quita, la fuga PII cross-user vuelve.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const _readSrc = (rel) => fs.readFileSync(path.resolve(_dir, '..', rel), 'utf-8');

describe('P1-3 · wiring en AssessmentContext._clearUserScopedCaches', () => {
    it('AssessmentContext importa y llama clearUserQueryCache', () => {
        const src = _readSrc('context/AssessmentContext.jsx');
        expect(/import\s*\{[^}]*\bclearUserQueryCache\b[^}]*\}\s*from\s*['"][^'"]*queryClient['"]/.test(src)).toBe(true);
        // dentro del cuerpo de _clearUserScopedCaches (ancla en la DEFINICIÓN, no en
        // la primera mención en comentario).
        const defIdx = src.indexOf('const _clearUserScopedCaches');
        expect(defIdx).toBeGreaterThan(-1);
        const fnBody = src.slice(defIdx, defIdx + 2500);
        expect(fnBody.includes('clearUserQueryCache(')).toBe(true);
    });
});
