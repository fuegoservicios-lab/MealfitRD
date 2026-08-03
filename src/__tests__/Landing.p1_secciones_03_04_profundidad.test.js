/* [P1-SECCIONES-03-04-PROFUNDIDAD · 2026-08-02] Guard parser-based.
   Estas invariantes rompen EN SILENCIO: un transform que framer-motion pisa,
   unas guias que apuntan al vacio, o un reduced-motion que borra la geometria
   no lanzan ningun error -- simplemente el efecto no esta. Por eso se parsea
   el source de produccion en vez de renderizar. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const CSS_03 = read('components/home/DashboardShowcase.module.css');
const JSX_03 = read('components/home/DashboardShowcase.jsx');
const CSS_04 = read('components/home/BenchmarkShowcase.module.css');

/* Extrae el cuerpo de un @media por su condicion. */
const mediaBlock = (css, condition) => {
    const start = css.indexOf(`@media ${condition}`);
    if (start === -1) return '';
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
    }
    return '';
};

describe('P1-SECCIONES-03-04-PROFUNDIDAD — marcador', () => {
    it('el marcador vive en los tres ficheros que el guard parsea', () => {
        expect(CSS_03).toContain('P1-SECCIONES-03-04-PROFUNDIDAD');
        expect(JSX_03).toContain('P1-SECCIONES-03-04-PROFUNDIDAD');
        expect(CSS_04).toContain('P1-SECCIONES-03-04-PROFUNDIDAD');
    });
});

describe('03 — la escena 3D', () => {
    const desktop = mediaBlock(CSS_03, '(min-width: 1024px)');

    it('la perspectiva existe y vive SOLO en el bloque >=1024px', () => {
        expect(desktop).toMatch(/perspective:/);
        const fuera = CSS_03.replace(desktop, '');
        expect(fuera).not.toMatch(/perspective:/);
    });

    it('preserve-3d NO se declara en .viewLink ni mas abajo (.viewport lo aplanaria)', () => {
        expect(desktop).not.toMatch(/\.viewLink[^{]*\{[^}]*transform-style:\s*preserve-3d/);
        expect(desktop).not.toMatch(/\.viewport[^{]*\{[^}]*transform-style:\s*preserve-3d/);
    });

    it('el transform 3D va en .viewLink, NO en .view (framer-motion lo pisaria inline)', () => {
        /* La rotacion vive UNA vez en `.viewLink`, parametrizada por `--ry`;
           las reglas por vista solo aportan el valor. Por eso se busca rotateY
           en `.viewLink` y NO en `.viewNN .viewLink`. */
        expect(desktop).toMatch(/\.viewLink\s*\{[^}]*rotateY\(var\(--ry/);
        /* Y cada vista tiene que aportar su angulo y su Z. */
        for (const n of ['01', '02', '03', '04', '05']) {
            expect(desktop).toMatch(new RegExp(`\\.view${n}\\s+\\.viewLink[^{]*\\{[^}]*--ry:`));
            expect(desktop).toMatch(new RegExp(`\\.view${n}\\s+\\.viewLink[^{]*\\{[^}]*--z:`));
        }
        /* `.viewNN` a secas NO puede llevar transform: es el motion.article y
           framer-motion lo pisaria inline. */
        expect(desktop).not.toMatch(/\.view0\d\s*\{[^}]*transform:/);
    });

    it('el enderezado al leer existe en hover y en foco', () => {
        expect(desktop).toMatch(/\.viewLink:hover[^{]*\{[^}]*transform:/);
        expect(desktop).toMatch(/\.viewLink:focus-visible[^{]*\{[^}]*transform:/);
    });
});

describe('reglas absolutas del papel — no se relajan', () => {
    for (const [nombre, css] of [['03', CSS_03], ['04', CSS_04]]) {
        it(`${nombre}: cero blur, cero backdrop-filter, cero brightness, cero drop-shadow`, () => {
            expect(css).not.toMatch(/backdrop-filter/);
            expect(css).not.toMatch(/filter:\s*blur/);
            expect(css).not.toMatch(/filter:\s*brightness/);
            expect(css).not.toMatch(/drop-shadow/);
        });

        it(`${nombre}: ningun box-shadow con blur > 0`, () => {
            const sombras = css.match(/box-shadow:[^;]+;/g) || [];
            for (const s of sombras) {
                expect(s).toMatch(/box-shadow:\s*(none|0 0 0)/);
            }
        });

        it(`${nombre}: cero border-radius distinto de 0`, () => {
            const radios = css.match(/border-radius:[^;]+;/g) || [];
            for (const r of radios) expect(r).toMatch(/border-radius:\s*0\s*;/);
        });
    }
});

describe('reduced-motion — conserva la geometria, quita la animacion', () => {
    const reduce = mediaBlock(CSS_03, '(prefers-reduced-motion: reduce)');

    it('el bloque existe y sigue anulando la animacion', () => {
        expect(reduce).toMatch(/animation:\s*none\s*!important/);
    });

    it('.viewLink y .guideBand quedan FUERA del reset: su transform es geometria', () => {
        const resets = reduce.match(/[^}]*\{[^}]*transform:\s*none\s*!important[^}]*\}/g) || [];
        for (const bloque of resets) {
            expect(bloque).not.toMatch(/\.viewLink\b/);
            expect(bloque).not.toMatch(/\.guideBand\b/);
        }
    });

    it('la exclusion esta justificada por escrito, como la de .scaleBox', () => {
        expect(reduce).toMatch(/NO es animaci[oó]n/i);
    });
});

describe('las guias anotadas no pueden quedar fuera de la escena', () => {
    it('los porcentajes ancla siguen intactos', () => {
        for (const pct of ['20%', '78%', '10%', '88%']) {
            expect(JSX_03).toContain(pct);
        }
    });

    it('la banda de guias declara que viaja con la escena', () => {
        expect(CSS_03).toMatch(/\.guideBand[^{]*\{[^}]*transform:/);
    });
});
