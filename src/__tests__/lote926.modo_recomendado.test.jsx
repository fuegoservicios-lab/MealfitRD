// [P1-PLAN-LOTE-926 · 2026-09-30] El contador es la forma principal y recomendada; el plan con IA, «Beta».
// Y los textos del formulario, sin jerga («macros», «calibrar», «créditos», «scoops»).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { RadioCard } from '../components/common/FormUI';

const leer = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

describe('lote 926 · el contador va primero y el plan con IA dice Beta', () => {
    it('RadioCard pinta la etiqueta junto al título', () => {
        render(<RadioCard name="m" value="a" label="Contar lo que como" badge="Recomendado" checked={false} onChange={() => {}} />);
        expect(screen.getByText('Recomendado')).toBeInTheDocument();
        expect(screen.getByText('Contar lo que como')).toBeInTheDocument();
    });

    it('en el paso 0 la tarjeta del contador va antes que la del plan, con sus etiquetas', () => {
        const s = leer('src/components/assessment/questions/QAppMode.jsx');
        const contador = s.indexOf('value="tracking"');
        const plan = s.indexOf('value="plan"');
        expect(contador).toBeGreaterThan(0);
        expect(plan).toBeGreaterThan(contador);
        expect(s).toContain("badge={t('Recomendado')}");
        expect(s).toContain("badge={t('Beta')}");
        expect(s).toContain("t('Plan de comidas con IA')");
    });

    it('los pasos del formulario ya no hablan en jerga', () => {
        const flujo = leer('src/components/assessment/InteractiveAssessmentFlow.jsx')
            + leer('src/components/assessment/questions/QTrackingFinish.jsx');
        for (const jerga of ['calcular tus macros', 'calibrar', 'scoops', 'gastar créditos', 'reloj biológico',
            'tus calorías y macros diarios', 'objetivo PRINCIPAL']) {
            expect(flujo, jerga).not.toContain(jerga);
        }
    });
});
