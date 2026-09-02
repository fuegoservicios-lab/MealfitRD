/**
 * [P1-ARQ25-F1-CLOSE · 2026-09-02] El placeholder de la cola se VE como «generando».
 *
 * Vivo (kill test 1): tras el reinicio del backend el cliente aterrizó en el asistente y,
 * al entrar al panel, vio un plan vacío («Estos días aún no toca prepararlos… el próximo
 * llega el miércoles») sin ninguna señal de carga. Un cliente lo confunde con un error y
 * vuelve a enviar el formulario — que cancela su propia generación.
 *
 * Tres superficies, de fuente (la lógica vive en JSX gigante):
 *  1. banner «Tu plan se está generando en segundo plano» arriba del panel;
 *  2. el vacío de «Tu Menú» dice «Diseñando tu plan» ANTES de las ramas de bloques;
 *  3. el asistente avisa «Ya tienes un plan generándose» con botón al panel.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const dash = fs.readFileSync(path.resolve(_dir, '../pages/Dashboard.jsx'), 'utf8');
const layout = fs.readFileSync(path.resolve(_dir, '../components/assessment/InteractiveAssessmentLayout.jsx'), 'utf8');

const GATE = "planData?.generation_status === 'generating'";

describe('P1-ARQ25-F1-CLOSE · placeholder visible como generando', () => {
    it('el flag se declara DENTRO de DashboardInner (donde se usa) y antes de su primer uso', () => {
        const ctx = fs.readFileSync(path.resolve(_dir, '../context/AssessmentContext.jsx'), 'utf8');
        expect(ctx).toContain("(incomingStatus === 'generating' && !_incomingHasDays && plan?.id) ? plan.id : null");
        expect(ctx).toContain('serverGeneratingPlanId,');
        // Regresión real: declararlo en el wrapper `Dashboard` tiró el panel al error boundary.
        const inner = dash.indexOf('const DashboardInner = () => {');
        const wrapper = dash.indexOf('const Dashboard = () => {');
        const decl = dash.indexOf('const _localPlaceholder = ' + GATE);
        const firstUse = dash.indexOf('{_isPlaceholderGenerating && (');
        expect(inner).toBeGreaterThan(-1);
        expect(decl).toBeGreaterThan(inner);
        expect(decl).toBeLessThan(wrapper);
        expect(decl).toBeLessThan(firstUse);
        expect(dash.slice(decl, decl + 220)).toContain('planData.days.length > 0');
        expect(dash.match(/const _isPlaceholderGenerating = /g)).toHaveLength(1);
        // regenerar y volver al panel: el servidor tiene OTRO plan generándose
        expect(dash).toContain('serverGeneratingPlanId !== planData?.id');
        expect(dash).toContain("t('Mientras tanto ves tu plan anterior.')");
    });

    it('banner con spinner y aria-live antes de RestockNudge', () => {
        const banner = dash.indexOf('data-testid="generating-plan-banner"');
        const nudge = dash.indexOf('<RestockNudge');
        expect(banner).toBeGreaterThan(-1);
        expect(banner).toBeLessThan(nudge);
        const win = dash.slice(banner - 300, banner + 1200);
        expect(win).toContain('{_isPlaceholderGenerating && (');
        expect(win).toContain('aria-live="polite"');
        expect(win).toContain('className="spin-animation"');
        expect(win).toContain("t('Tu plan se está generando en segundo plano')");
    });

    it('el vacío de «Tu Menú» prioriza «Diseñando tu plan» sobre «cocinando» y «programados»', () => {
        const placeholder = dash.indexOf('if (_isPlaceholderGenerating) {');
        const cooking = dash.indexOf("title={t('Estamos cocinando estos días')}");
        const scheduled = dash.indexOf("title={t('Estos días aún no toca prepararlos')}");
        expect(placeholder).toBeGreaterThan(-1);
        expect(placeholder).toBeLessThan(cooking);
        expect(cooking).toBeLessThan(scheduled);
        const win = dash.slice(placeholder, placeholder + 700);
        expect(win).toContain("title={t('Diseñando tu plan')}");
        expect(win).toContain('live');
    });

    it('el asistente avisa y manda al panel cuando hay un plan generándose', () => {
        expect(layout).toContain('planData } = useAssessment();');
        const gate = layout.indexOf('const _planGenerandose = ' + GATE);
        const notice = layout.indexOf('data-testid="wizard-generating-notice"');
        const children = layout.indexOf('{children}');
        expect(gate).toBeGreaterThan(-1);
        expect(notice).toBeGreaterThan(gate);
        expect(notice).toBeLessThan(children);
        const win = layout.slice(notice, notice + 1500);
        expect(win).toContain("t('Ya tienes un plan generándose')");
        expect(win).toContain("navigate('/dashboard')");
    });
});
