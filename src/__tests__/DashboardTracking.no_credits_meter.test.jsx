// [P1-PLAN-LOTE-86 · 2026-09-17] El medidor de créditos no se monta en modo seguimiento: los créditos
// solo los consumen acciones del generador y con el plan en pausa ninguna es alcanzable (el coach tiene su
// cuota aparte; escanear y anotar no cuentan). El dashboard de plan lo conserva: vuelve al reanudar.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

describe('créditos en modo seguimiento', () => {
    it('el contador de seguimiento no monta el medidor; el dashboard de plan sí', () => {
        const tracking = src('src/components/dashboard/DashboardTracking.jsx');
        expect(tracking).not.toContain("import CreditsMeter from './CreditsMeter';");
        expect(tracking).not.toContain('<CreditsMeter');
        expect(tracking).toContain('[P1-PLAN-LOTE-86');
        const plan = src('src/pages/Dashboard.jsx');
        expect(plan).toContain('<CreditsMeter');
    });
});
