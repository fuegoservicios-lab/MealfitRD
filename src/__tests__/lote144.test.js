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

// El dueño, después: «hay muchos botones que deben tener su sombreado o algo cuando le pasan el mouse por encima».
// Un `style={{}}` no puede llevar :hover; el control declara `data-hover` y la respuesta vive en index.css.
describe('lote 144 · respuesta al ratón de los controles con estilo en línea', () => {
    const css = leer('src/index.css');

    it('la utilidad existe, solo con puntero fino, y el velo es una sombra INTERIOR (no necesita conocer el fondo)', () => {
        const k = css.indexOf('[P1-PLAN-LOTE-144 · 2026-09-20] Respuesta al ratón');
        expect(k).toBeGreaterThan(-1);
        const regla = css.slice(k);
        expect(regla).toContain('@media (hover: hover) and (pointer: fine) {');
        expect(regla).toContain('[data-hover="boton"]:not(:disabled):hover {');
        expect(regla).toContain('[data-hover="fila"]:not(:disabled):hover {');
        expect(regla).toContain('[data-hover="icono"]:not(:disabled):hover {');
        expect(regla).toContain('box-shadow: inset 0 0 0 999px');
    });

    it('los que señaló el dueño la declaran', () => {
        expect(DASH).toMatch(/data-hover="fila"\s+onClick=\{\(\) => setShowDespensaDropdown\(!showDespensaDropdown\)\}/);
        expect(DASH).toMatch(/data-hover="fila"\s+onClick=\{\(\) => _setBudget\('budget', o\.val\)\}/);
        expect(leer('src/components/dashboard/SupermarketBrands.jsx')).toMatch(/data-hover="fila"\s+onClick=\{toggle\}/);
        expect(leer('src/components/history/HistoryDesktopPanel.jsx')).toContain('data-hover="fila" onClick={() => setSort(k)}');
        expect(leer('src/pages/Settings.jsx')).toMatch(/disabled=\{isExportingData\}\s+data-hover="boton"/);
        expect(leer('src/components/dashboard/StatusNotice.jsx')).toContain("data-hover={peso === 'accion' ? 'boton' : 'fila'}");
        // el icono del historial del chat tenía un hover a mano con negro al 5 %: invisible en oscuro
        const ap = leer('src/pages/AgentPage.jsx');
        expect(ap).toMatch(/data-hover="icono"\s+aria-label=\{t\('Ver historial de chats'\)\}/);
        expect(ap).not.toContain("e.currentTarget.style.background = 'rgba(0,0,0,0.05)'");
    });
});

// El dueño, sobre la demo del login: «mejora el diseño de esto radicalmente, y anima el de móviles».
describe('lote 144 · la demo del login (escritorio) y su ilustración (móvil)', () => {
    const demo = leer('src/components/auth/PlanShowcase.jsx');
    const css = leer('src/pages/Login.css');

    it('tres anillos concéntricos —uno por macro—, no un anillo y tres barras', () => {
        for (const id of ['mfRingP', 'mfRingC', 'mfRingG']) expect(demo).toContain(`id="${id}"`);
        expect(demo).toContain('animate={{ strokeDashoffset: c * (1 - m.pct / 100) }}');
        expect(demo).not.toContain('mf-macro__track');
    });

    it('las DOS rayas bajo el título se fueron: la cabecera no lleva borde y el bloque del anillo es un panel', () => {
        const k = css.indexOf('.mf-democard__head {');
        expect(css.slice(k, css.indexOf('}', k))).not.toContain('border-bottom');
        const h = css.indexOf('\n.mf-hero {');
        const regla = css.slice(h, css.indexOf('}', h));
        expect(regla).not.toContain('border-top');
        expect(regla).toContain('border-radius: 1.1rem;');
    });

    it('cada plato es una tarjeta con icono y reparto P/C/G; el cursor cuelga de su objetivo', () => {
        expect(demo).toContain('<span className="mf-meal__split" aria-hidden="true">');
        expect(demo).toContain("style={{ '--mf-tint': meal.tint }}");
        expect(demo).not.toContain('top: 250');
        expect(demo).toContain('<Cursor pressed={press} style={{ right: 6, bottom: -16 }} />');
    });

    it('reduce-motion se respeta de verdad: ya no se lee `reduced.current` (el ref que dejó de existir)', () => {
        expect(demo).not.toContain('reduced.current');
        expect(demo).toContain('animate={reduced ? {} : { y: [0, -10, 0] }}');
    });

    it('la ilustración del móvil está viva, y sin animación se ve ENTERA (lo oculto vive solo en el keyframe)', () => {
        const illu = leer('src/components/auth/HeroIllustration.jsx');
        expect(leer('src/pages/Login.jsx')).toContain("import HeroIllustration from '../components/auth/HeroIllustration';");
        expect(illu).toContain('{!reduced && GOTAS.map((g) => (');
        expect(illu).toContain('<animateMotion path={g.d}');
        expect(css).toContain('.mf-illu-linea, .mf-illu-bol, .mf-illu-tallo { stroke-dasharray: 1; stroke-dashoffset: 0; }');
        expect(css).toContain('@keyframes mfIlluDibuja { from { stroke-dashoffset: 1; opacity: 0; }');
        expect(css).toContain('.mf-illu, .mf-illu * { animation: none !important; }');
    });
});

