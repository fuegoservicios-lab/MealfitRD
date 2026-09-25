/**
 * [P1-PLAN-LOTE-292 · 2026-09-25] El formulario separa «¿Tomas algún suplemento?» (también en modo contador; lo que
 * toma va a la Alacena) de «¿Quieres que te recomendemos alguno?», y la tarjeta del Dashboard desaparece.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizarSuplementos } from '../utils/normalizarSuplementos';

const SRC = (r) => readFileSync(resolve(__dirname, '..', r), 'utf8');

describe('[292] paridad con backend/suplementos.normalizar_suplementos', () => {
    it.each([
        [{ currentSupplements: ['creatine'], recommendSupplements: true }, { toma: ['creatine'], recomendar: true }],
        [{ includeSupplements: true, selectedSupplements: ['whey_protein'] }, { toma: ['whey_protein'], recomendar: false }],
        [{ includeSupplements: true, selectedSupplements: [] }, { toma: [], recomendar: true }],
        [{ includeSupplements: false }, { toma: [], recomendar: false }],
        [{}, { toma: [], recomendar: false }],
    ])('%j', (fd, esperado) => expect(normalizarSuplementos(fd)).toEqual(esperado));
});

describe('[292] el paso del formulario', () => {
    it('existe también en modo contador y guarda lo que toma en la Alacena', () => {
        const flow = SRC('components/assessment/InteractiveAssessmentFlow.jsx');
        const tracking = flow.slice(flow.indexOf('const _trackingSteps'), flow.indexOf("id: 'trackingFinish'"));
        expect(tracking).toContain("id: 'supplements'");
        const q = SRC('components/assessment/questions/QSupplements.jsx');
        expect(q).toContain("t('¿Tomas algún suplemento?')");
        expect(q).toContain("t('¿Quieres que te recomendemos alguno para tu meta?')");
        expect(q).toContain('currentSupplements');
        expect(q).toContain('recommendSupplements');
        expect(SRC('utils/normalizarSuplementos.js')).toContain("'/api/inventory/supplements'");
        expect(SRC('pages/Plan.jsx')).toContain('guardarSuplementosEnAlacena(dataToSend, fetchWithAuth)');
        expect(SRC('components/assessment/questions/QTrackingFinish.jsx')).toContain('guardarSuplementosEnAlacena(hp, fetchWithAuth)');
    });

    it('el dashboard ya no pinta «Suplementos del Día» (viven en la Alacena)', () => {
        expect(SRC('pages/Dashboard.jsx')).not.toContain("t('Suplementos del Día')");
    });
});
