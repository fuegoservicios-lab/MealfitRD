/**
 * [P1-PLAN-LOTE-844 · 2026-09-29] Paridad con el backend (Task 843): la versión del permiso y el nombre de la cabecera
 * son el MISMO dato a los dos lados. Si divergen, el backend rechaza el permiso (409) o la cabecera del invitado (428)
 * y nadie puede usar la IA. El backend tiene su espejo de esta prueba
 * (`test_p1_plan_lote_843_consentimiento.py::test_la_version_del_frontend_es_la_misma`), que busca el literal.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AI_CONSENT_HEADER, AI_CONSENT_VERSION } from '../consent/version';

const BACKEND = resolve(__dirname, '..', '..', '..', 'backend', 'consentimientos.py');
const hayBackend = existsSync(BACKEND);

describe('[P1-PLAN-LOTE-844] versión del permiso', () => {
    it('version.js lleva el literal que lee el test del backend', () => {
        const src = readFileSync(resolve(__dirname, '../consent/version.js'), 'utf8');
        expect(src).toContain(`export const AI_CONSENT_VERSION = '${AI_CONSENT_VERSION}';`);
        expect(AI_CONSENT_VERSION).toMatch(/^ia-\d{4}-\d{2}$/);
    });

    it.skipIf(!hayBackend)('la versión y la cabecera son las de backend/consentimientos.py', () => {
        const py = readFileSync(BACKEND, 'utf8');
        expect(AI_CONSENT_VERSION).toBe(/^AI_CONSENT_VERSION\s*=\s*"([^"]+)"/m.exec(py)[1]);
        expect(AI_CONSENT_HEADER).toBe(/^CABECERA_INVITADO\s*=\s*"([^"]+)"/m.exec(py)[1]);
    });
});
