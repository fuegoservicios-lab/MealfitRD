// [P2-MOBILE-MENU-FLAT · 2026-10-01] Con el generador encendido, el panel en el teléfono se veía
// estrecho: «Tu Menú» era una tarjeta dentro de la página (13,6px de margen + borde + 20px de
// relleno dejaban 320 de 390px al texto) y los siete días del plan medían ~40px de lado. El hero
// ya era sección a sangre (P2-MOBILE-HERO-FLAT) y el modo seguimiento nació sin tarjetas; faltaba
// el menú. A ≤480px el menú y el razonamiento son secciones, no tarjetas. El escritorio no cambia.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const DASH = read('src/pages/Dashboard.jsx');
const LAYOUT = read('src/components/dashboard/DashboardLayout.module.css');

const inicio = DASH.indexOf('[P2-MOBILE-MENU-FLAT');
const fin = DASH.indexOf('`}</style>', inicio);
const BLOQUE = DASH.slice(inicio, fin);

describe('el menú a sangre en el teléfono', () => {
    it('va al final del <style>, después de las reglas a las que tiene que ganar', () => {
        expect(inicio).toBeGreaterThan(0);
        // misma especificidad + !important en ambos lados: gana la última
        expect(inicio).toBeGreaterThan(DASH.indexOf('[DASH-MOBILE-CLEAN-CARD'));
        expect(inicio).toBeGreaterThan(DASH.indexOf('[DASH-NARROW-TABS-FIT'));
        expect(inicio).toBeGreaterThan(DASH.indexOf('html[data-theme="dark"] .meals-container {'));
        expect(BLOQUE).toContain('@media (max-width: 480px) {');
    });

    it('el menú pierde el marco en los DOS temas y deja salir la fila de semanas', () => {
        expect(BLOQUE).toContain('.meals-container,\n                    html[data-theme="dark"] .meals-container {');
        const regla = BLOQUE.slice(BLOQUE.indexOf('.meals-container,'), BLOQUE.indexOf('.menu-section-header {'));
        expect(regla).toContain('background: transparent !important;');
        expect(regla).toContain('border: none !important;');
        expect(regla).toContain('border-radius: 0 !important;');
        expect(regla).toContain('box-shadow: none !important;');
        expect(regla).toContain('overflow: visible;');
    });

    it('platos, días y anotaciones comparten el borde de la página (sin relleno lateral)', () => {
        expect(BLOQUE).toContain('.meal-card,\n                    .skipped-lunch {\n                        padding: 1.35rem 0 !important;');
        const nav = BLOQUE.slice(BLOQUE.indexOf('.plan-week-nav {'), BLOQUE.indexOf('.plan-week-nav .plan-week-pills {'));
        expect(nav).toContain('padding-left: 0;');
        expect(nav).toContain('padding-right: 0;');
        const nota = BLOQUE.slice(BLOQUE.indexOf('.today-remaining-note {'));
        expect(nota.slice(0, 200)).toContain('padding-left: 0 !important;');
    });

    it('la sangría de las semanas cancela EXACTAMENTE el relleno lateral de .mainContent', () => {
        // Si alguien cambia el relleno del shell, la fila deja de llegar al borde (o se sale).
        const movil = LAYOUT.slice(LAYOUT.lastIndexOf('@media (max-width: 768px) {\n    .mainContent {'));
        expect(movil.slice(0, 200)).toContain('padding: 0.65rem 0.85rem;');
        expect(BLOQUE).toContain('margin-right: -0.85rem;\n                        padding-right: 0.85rem;');
    });

    it('una sola línea fina por plato, no dos rayas', () => {
        const sep = BLOQUE.slice(BLOQUE.indexOf('.meal-card:not(:last-of-type)::after'), BLOQUE.indexOf('.meal-actions {'));
        expect(sep).toContain('height: 1px;');
        expect(sep).toContain('background: var(--border);');
        const acciones = BLOQUE.slice(BLOQUE.indexOf('.meal-actions {'), BLOQUE.indexOf('.meal-actions-row {'));
        expect(acciones).toContain('border-top: none;');
    });

    it('«Cambiar Plato» crece con base 0 y bloqueado (candado) no se estira', () => {
        expect(BLOQUE).toContain('.meal-actions-row .meal-act-btn:nth-child(2):not([aria-disabled="true"]) {');
        expect(BLOQUE).toContain('flex: 1 1 0 !important;');
        // el inline que obligaba al !important sigue ahí; si se quita, la regla puede simplificarse
        expect(DASH).toContain("flex: 'none',");
    });

    it('el razonamiento es sección: la clase existe en el JSX y el bloque le quita el marco', () => {
        expect(DASH).toContain('<div className="reasoning-card" style={{');
        const regla = BLOQUE.slice(BLOQUE.indexOf('.reasoning-card {'), BLOQUE.indexOf('.credits-meter-slot {'));
        expect(regla).toContain('background: transparent !important;');
        expect(regla).toContain('border-top: 1px solid var(--border) !important;');
        expect(regla).toContain('padding: 1.25rem 0 0 !important;');
    });

    it('los controles del hero comparten radio y el disparador de duración llega al alto táctil', () => {
        expect(DASH).toContain('className="hero-duration-trigger"');
        expect(DASH).toContain('className="hero-budget-banner"');
        const regla = BLOQUE.slice(BLOQUE.indexOf('.hero-duration-trigger {'));
        expect(regla.slice(0, 220)).toContain('border-radius: 14px !important;');
        expect(regla.slice(0, 220)).toContain('min-height: 46px !important;');
    });

    it('en claro el menú se apoya en el color liso de página, solo en claro', () => {
        expect(BLOQUE).toContain('html:not([data-theme="dark"]) .main-grid {\n                        background: var(--bg-page, #F8FAFC);');
        expect(BLOQUE).not.toContain('html[data-theme="dark"] .main-grid');
    });

    it('la nota médica fija entra en la misma banda lisa (solo en claro)', () => {
        // Su clase es de módulo (hash): el gancho estable es el data-testid del componente.
        expect(read('src/components/common/NotaAvisoMedico.jsx')).toContain('data-testid="nota-aviso-medico"');
        expect(BLOQUE).toContain('html:not([data-theme="dark"]) .main-grid + [data-testid="nota-aviso-medico"] {');
        expect(DASH.indexOf('<NotaAvisoMedico />')).toBeGreaterThan(DASH.indexOf('<div className="main-grid">'));
    });

    it('el escritorio conserva el cuaderno', () => {
        const base = DASH.slice(DASH.indexOf('.meals-container {'), DASH.indexOf('.meals-container::before {'));
        expect(base).toContain('border-left: 14px solid #1E293B;');
        expect(base).toContain('overflow: hidden;');
        expect(DASH).toContain('.meal-card {\n                    padding: 2.5rem 2.5rem 2.5rem 4.5rem;');
    });
});
