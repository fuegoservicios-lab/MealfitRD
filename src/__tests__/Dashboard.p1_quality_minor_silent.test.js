/**
 * [P1-QUALITY-MINOR-SILENT · 2026-09-02] Un residuo `minor` sobre un plan APROBADO salía en
 * amarillo como si fuera un error («Plan listo, con un aviso · Motivo (Menor): Algunos días
 * pueden tener comidas repetidas…»). Vivo: plan 197970fa, calidad 98,9/100, motivo
 * `slot_coherence_unresolved`. Decisión del dueño: los residuos menores no se enseñan (el
 * flag sigue en plan_data para la telemetría) y el copy de los casos altos habla claro.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const dash = fs.readFileSync(path.resolve(_dir, '../pages/Dashboard.jsx'), 'utf8');
const bell = fs.readFileSync(path.resolve(_dir, '../components/dashboard/NotificationCenter.jsx'), 'utf8');

describe('P1-QUALITY-MINOR-SILENT', () => {
    it('la campana (buildQualityNotification) ignora todo lo que no sea severidad alta', () => {
        expect(dash).toContain("if (!planData?._quality_degraded || planData?._quality_degraded_severity !== 'high') return null;");
    });
    it('el banner del panel exige severidad alta', () => {
        expect(dash).toContain("{planData?._quality_degraded && planData?._quality_degraded_severity === 'high' && !qDegradedHidden && (");
    });
    it('el copy ya no habla de «Motivo (Menor)» ni de ajustes automáticos que no terminaron', () => {
        expect(dash).not.toContain('Motivo ({severidad})');
        expect(bell).not.toContain('Motivo ({severidad})');
        expect(dash).not.toContain('el ajuste automático no terminó');
        expect(dash).not.toContain("t('Menor')");
        expect(dash).toContain("t('Tu plan está listo, con un detalle por revisar')");
        expect(dash).toContain("t('Abajo te contamos qué pasó. Si un día no te convence, cámbialo con Cambiar Plato.')");
        expect(dash).toContain("t('Qué pasó: {motivo}', { motivo: _reasonLabel })");
        expect(bell).toContain("t('Qué pasó:')");
    });
    it('el cuerpo del titular sigue conteniendo «Cambiar Plato» (el render lo pone en negrita partiendo por ese texto)', () => {
        const i = dash.indexOf("t('Abajo te contamos qué pasó. Si un día no te convence, cámbialo con Cambiar Plato.')");
        expect(i).toBeGreaterThan(-1);
        expect(dash.slice(i, i + 200)).toContain('Cambiar Plato');
    });
    it('el flag de severidad sigue leyéndose (telemetría intacta, G10)', () => {
        expect(dash).toContain('_quality_degraded_severity');
    });
});
