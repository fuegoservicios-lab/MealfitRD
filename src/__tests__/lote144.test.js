// [P1-PLAN-LOTE-144 · 2026-09-20] Los avisos del Dashboard con el generador encendido hablan un solo lenguaje.
//
// El dueño, sobre su pantalla: «quiero que mejoremos visualmente… en especial lo de micronutrientes, plan congelado y
// lo de comprobar ahora». Eran tres lenguajes apilados: una nota subrayada con el enlace en el rosa de error, un
// recuadro con emoji y colores clavados para el tema oscuro, y un PANEL entero (insignia llena, halo, sombra) para
// decir «aún no hay nada». Y dos se contradecían: «Todo va bien» justo encima de «Plan congelado».
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const DASH = leer('src/pages/Dashboard.jsx');

describe('lote 144 · avisos de estado del plan', () => {
    it('congelado y sondeo salen de UNA pieza, con dos pesos: acción (botón lleno) y calma (botón fantasma)', () => {
        expect(DASH).toContain("import StatusNotice from '../components/dashboard/StatusNotice';");
        const css = leer('src/components/dashboard/StatusNotice.module.css');
        expect(css).toContain('.accion .boton {');
        expect(css).toContain('.calma .boton {');
        // colores de superficie por token: el recuadro anterior clavaba #7dd3fc/#9fb3c8 y en claro no se leía
        expect(css).not.toMatch(/background:\s*#(?!082F49)[0-9a-fA-F]{3,6}\s*;/);
        expect(css).toContain('var(--bg-card)');
    });

    it('el plan congelado es lo único que pide algo: va ANTES del aviso del sondeo y de los micronutrientes', () => {
        const iCongelado = DASH.indexOf('{planData?._frozen_at && (');
        const iSondeo = DASH.indexOf('{planPollGaveUp && !isPlanCorrupted');
        const iMicros = DASH.indexOf('<MicronutrientMeter');
        expect(iCongelado).toBeGreaterThan(-1);
        expect(iCongelado).toBeLessThan(iSondeo);
        expect(iSondeo).toBeLessThan(iMicros);
        const bloque = DASH.slice(iCongelado, iCongelado + 700);
        expect(bloque).toContain('peso="accion"');
        expect(bloque).toContain("onAccion={() => navigate('/dashboard/pantry')}");
        expect(bloque).not.toContain('🧊');
    });

    it('«todo va bien» calla mientras el plan está congelado, y «Comprobar ahora» deja de ser un enlace rojo', () => {
        const i = DASH.indexOf('{planPollGaveUp && !isPlanCorrupted');
        const bloque = DASH.slice(i, i + 2200);
        expect(bloque.slice(0, 140)).toContain("=== 'partial' && !(planData?._frozen_at) && (");
        expect(bloque).toContain('peso="calma"');
        expect(bloque).toContain("accion={t('Comprobar ahora')}");
        expect(bloque.slice(0, bloque.indexOf('</StatusNotice>'))).not.toContain("color: 'var(--accent)'");
    });

    it('micronutrientes en espera es una fila, no un panel', () => {
        const jsx = leer('src/components/dashboard/MicronutrientMeter.jsx');
        expect(jsx).toContain('className={`${styles.panel} ${styles.panelQuiet}`}');
        expect(jsx).toContain("<span className={styles.quietPill}>{t('En espera de tus platos')}</span>");
        const css = leer('src/components/dashboard/MicronutrientMeter.module.css');
        const k = css.indexOf('.panelQuiet {');
        const regla = css.slice(k, css.indexOf('}', k));
        expect(regla).toContain('border-style: dashed;');
        expect(regla).toContain('box-shadow: none;');
    });
});
