// [P1-PLAN-LOTE-98 · 2026-09-18] Descartada, la invitación al plan no deja NADA en el contador.
//
// El lote 91 la colapsaba a un enlace tenue al final («¿Quieres el plan completo? Enciéndelo aquí»). El dueño, con
// captura: «quítalo, ya está el interruptor en configuración». La puerta de vuelta es Configuración → Capacidades; el
// descarte sigue persistiendo en localStorage (misma clave), así que no reaparece al recargar.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

const sinComentarios = (css) => {
    let out = '';
    let i = 0;
    for (;;) {
        const a = css.indexOf('/*', i);
        if (a < 0) return out + css.slice(i);
        out += css.slice(i, a);
        const b = css.indexOf('*/', a + 2);
        if (b < 0) return out;
        i = b + 2;
    }
};

const CSS = () => sinComentarios(src('src/components/dashboard/DashboardTracking.module.css'));
const bloque = (css, cabecera) => {
    const i = css.indexOf(cabecera);
    expect(i).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('\n}\n', css.indexOf('{', i))).split(/\s+/).join(' ');
};

describe('la invitación descartada no deja nada', () => {
    it('el componente devuelve null al descartar, en las dos ofertas, y el descarte persiste', () => {
        const jsx = src('src/components/dashboard/DashboardTracking.jsx');
        expect(jsx.match(/if \(dismissed\) return null;/g)).toHaveLength(2);
        expect(jsx).not.toContain('turnOnLink');
        expect(jsx).not.toContain('Enciéndelo aquí');
        expect(jsx).not.toContain('Reanúdalo aquí');
        expect(jsx).toContain("_DISMISS_KEY = 'mealfit_turnon_card_dismissed'");
    });

    it('el hueco vacío sale del reparto y en el teléfono las áreas son dos (sin fila fantasma arriba)', () => {
        const css = CSS();
        expect(css.split(/\s+/).join(' ')).toContain('.turnOnSlot:empty { display: none; }');
        const movil = bloque(css, '@media (max-width: 900px) {');
        // sin descartar, la tarjeta sigue primera — lote 87
        expect(movil).toContain('grid-template-areas: "plan" "main" "side";');
        expect(css).toContain('.page:has(.turnOnSlot:empty) {');
        expect(css.slice(css.indexOf('.page:has(.turnOnSlot:empty) {')).split(/\s+/).join(' ')).toContain('grid-template-areas: "main" "side"; }');
        expect(css).not.toContain('turnOnLink');
    });

    it('los catálogos no conservan las claves del enlace', () => {
        for (const loc of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(src(`src/i18n/locales/${loc}.json`));
            expect(cat).not.toHaveProperty('¿Quieres el plan completo? Enciéndelo aquí');
            expect(cat).not.toHaveProperty('Tu plan está en pausa. Reanúdalo aquí');
        }
    });
});
