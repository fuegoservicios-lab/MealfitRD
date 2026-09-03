// [P2-PLAN-LIMIT-BLOCK · 2026-09-03] Configuración → Plan & Objetivo sin créditos: un bloque que dice
// qué pasa, cuándo se renueva y ofrece «Mejorar plan» (oculto en nativo), en vez de un botón apagado
// «Límite de plan alcanzado» + un enlace subrayado.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('src/pages/Settings.jsx');
const PO = read('src/components/settings/PlanObjetivo.jsx');

describe('Plan & Objetivo: estado sin créditos', () => {
    it('un solo bloque en escritorio y móvil, con fecha de renovación y CTA primario', () => {
        expect(SRC).toContain('const renderPlanLimitBlock = () => {');
        expect(SRC).toContain("t('Sin créditos este mes')");
        expect(SRC).toContain("t('Se renuevan el {fecha}.', { fecha: _fecha })");
        expect(SRC).toContain("timeZone: 'UTC'");
        expect(SRC).toContain('{planData && isLimitReached ? renderPlanLimitBlock() : (');   // escritorio
        expect(SRC).toContain('ctaSlot={planData && isLimitReached ? renderPlanLimitBlock() : null}');   // móvil
        expect(SRC).not.toContain("t('Límite de plan alcanzado')");
        expect(SRC).not.toContain("t('Actualiza tu suscripción para continuar')");
    });
    it('el CTA lleva a la sección de suscripción y no existe en nativo (Apple 3.1.1)', () => {
        const i = SRC.indexOf('const renderPlanLimitBlock');
        const block = SRC.slice(i, i + 1800);
        expect(block).toContain('{!nativeHidesCommerce() && (');
        expect(block).toContain("onClick={() => navigateToSection('subscription')}");
        expect(block).toContain("t('Mejorar plan')");
    });
    it('estilos: acento solo en 0 créditos, hover del CTA como el resto y apilado en móvil', () => {
        expect(SRC).toContain('.plan-goal-limit {');
        expect(SRC).toContain('border: 1px solid color-mix(in srgb, var(--accent) 38%, transparent);');
        expect(SRC).toContain('.plan-goal-limit-cta:hover {');
        expect(SRC).toContain('@media (max-width: 480px) {');
    });
    it('PlanObjetivo acepta un slot que sustituye al botón', () => {
        expect(PO).toContain('ctaSlot = null,');
        expect(PO).toContain('{ctaSlot || (');
        expect(PO).toContain('ctaSlot: PropTypes.node,');
    });
    it('las claves viejas salieron de los 4 catálogos', () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            expect(cat['Límite de plan alcanzado'], loc).toBeUndefined();
            expect(cat['Actualiza tu suscripción para continuar'], loc).toBeUndefined();
            expect(cat['Sin créditos este mes'], loc).toBeTruthy();
        }
    });
});
