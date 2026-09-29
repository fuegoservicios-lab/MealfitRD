/**
 * [P1-PLAN-LOTE-841 · 2026-09-29] El motivo de un ajuste del panel se guarda en el rastro del equipo hasta su purga
 * (24 meses) y la Política de Privacidad §9 dice que no debe llevar datos personales: la ayuda del campo lo avisa.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.resolve(__dirname, '../pages/AdminCuentas.jsx'), 'utf8');

describe('P1-PLAN-LOTE-841 · el motivo avisa de no escribir datos personales', () => {
    it('la ayuda del campo Motivo lo dice', () => {
        expect(SRC).toMatch(/motivoAyuda: '[^']*No escribas datos personales ni de salud\.'/);
    });
});
