// [P1-PLAN-LOTE-126 · 2026-09-19] Una Nevera vacía no se desplaza: el alto de la cabecera del teléfono se IMPONE.
//
// Nevera, Recetas e Historial llenaban la pantalla restando «48 px de cabecera» a `100dvh`. La cabecera mide 66 px y
// nunca midió 48: la página salía 18 px más alta que la pantalla (medido en el arnés: scrollHeight 870 con 852 de
// pantalla; tras el cambio, 852). Ahora la cabecera TOMA su alto de `--dash-header-h` y las tres páginas restan la misma.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 126 - el icono del vacio no repite el de la pestana', () => {
    it('nevera = nevera, alacena = espiga: el copo y la caja ya estan en la pestana de al lado', () => {
        const p = leer('src/pages/Pantry.jsx');
        expect(p).toContain('<span className={mstyles.emptyIco} aria-hidden="true"><Refrigerator size={26} /></span>');
        expect(p).toContain('<span className={mstyles.emptyIco} aria-hidden="true"><Wheat size={26} /></span>');
        expect(p).not.toContain('emptyIco} aria-hidden="true"><Snowflake');
    });
});

describe('lote 126 · el alto de la cabecera del teléfono es UNA variable', () => {
    const layout = leer('src/components/dashboard/DashboardLayout.module.css');

    it('la cabecera toma su alto de la variable (no al revés)', () => {
        expect(layout).toContain('--dash-header-h: calc(max(env(safe-area-inset-top), 6px) + 1.2rem + 41px);');
        expect(layout).toMatch(/\.mobileHeader \{\n\s+box-sizing: border-box;\n\s+height: var\(--dash-header-h\);\n\s+\}/);
    });

    it('los términos de la variable son los del relleno REAL de la cabecera', () => {
        // si alguien cambia el relleno de `.mobileHeader` sin tocar la variable, la cabecera recortaría su contenido
        expect(layout).toContain('padding: 0.6rem 1.25rem;');
        expect(layout).toContain('padding-top: calc(max(env(safe-area-inset-top), 6px) + 0.6rem);');
    });

    it('las tres páginas de borde a borde restan la MISMA variable y nadie vuelve a escribir «48px»', () => {
        for (const rel of [
            'src/pages/Pantry.mobileFridge.module.css',
            'src/components/recipes/MobileRecipes.module.css',
            'src/pages/History.module.css',
        ]) {
            const css = leer(rel);
            expect(css, rel).toContain('min-height: calc(100dvh - var(--dash-header-h, 66.2px));');
            expect(css, rel).not.toContain('env(safe-area-inset-top, 0px) - 48px');
        }
    });
});
