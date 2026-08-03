/* [P1-SECCIONES-03-04-PROFUNDIDAD · 2026-08-02] Guard parser-based.
   Estas invariantes rompen EN SILENCIO: un transform que framer-motion pisa,
   unas guias que apuntan al vacio, o un reduced-motion que borra la geometria
   no lanzan ningun error -- simplemente el efecto no esta. Por eso se parsea
   el source de produccion en vez de renderizar. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');

/* ⚠ SIN ESTO EL GUARD ES INSERVIBLE, Y YA NOS HA PASADO CUATRO VECES.
   Estos ficheros documentan por extenso lo que se BORRÓ al migrar a papel, con
   los literales dentro: `DashboardShowcase.module.css:24` menciona
   «@media (min-width: 1024px)» en prosa, y :32/:34/:40 citan
   `backdrop-filter: blur(8px)`, `filter: brightness(...)` y `drop-shadow(...)`
   como ejemplos de lo ELIMINADO. Un escáner que mire el texto crudo confunde
   el obituario con el cadáver: daría por violada una regla que se cumple, y
   solo se «arreglaría» borrando documentación que vale oro.

   Un comentario que documenta algo borrado NO es una violación. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/* RAW conserva los comentarios: el marcador del P-fix vive en uno. */
const CSS_03_RAW = read('components/home/DashboardShowcase.module.css');
const JSX_03_RAW = read('components/home/DashboardShowcase.jsx');
const CSS_04_RAW = read('components/home/BenchmarkShowcase.module.css');

/* Y estas son las que se interrogan por REGLAS: solo código vivo. */
const CSS_03 = stripComments(CSS_03_RAW);
const CSS_04 = stripComments(CSS_04_RAW);
const JSX_03 = stripComments(JSX_03_RAW);

/* Extrae el cuerpo de un @media por su condición, sobre CSS ya sin
   comentarios. Se ancla a un `@media` que empiece línea para no morder una
   condición citada dentro de una regla. */
const mediaBlock = (css, condition) => {
    const re = new RegExp(`^@media\\s+${condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
    const m = re.exec(css);
    if (!m) return '';
    const start = m.index;
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
    }
    return '';
};

describe('P1-SECCIONES-03-04-PROFUNDIDAD — marcador', () => {
    it('el marcador vive en los tres ficheros que el guard parsea', () => {
        /* RAW a propósito: el marcador vive en un comentario. */
        expect(CSS_03_RAW).toContain('P1-SECCIONES-03-04-PROFUNDIDAD');
        expect(JSX_03_RAW).toContain('P1-SECCIONES-03-04-PROFUNDIDAD');
        expect(CSS_04_RAW).toContain('P1-SECCIONES-03-04-PROFUNDIDAD');
    });

    it('stripComments no se lleva por delante el codigo vivo', () => {
        /* Sonda del propio helper: si algún día se rompe, el guard entero
           empezaría a dar por buenas las violaciones en silencio. */
        expect(stripComments('a{color:red} /* x */ b{color:blue}')).toBe('a{color:red}  b{color:blue}');
        expect(CSS_03).toContain('.viewLink');
        expect(CSS_03).not.toContain('QUÉ SE BORRÓ');
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
        /* Y cada vista tiene que aportar su angulo, su Z, y su tono de línea. */
        for (const n of ['01', '02', '03', '04', '05']) {
            expect(desktop).toMatch(new RegExp(`\\.view${n}\\s+\\.viewLink[^{]*\\{[^}]*--ry:`));
            expect(desktop).toMatch(new RegExp(`\\.view${n}\\s+\\.viewLink[^{]*\\{[^}]*--z:`));
            expect(desktop).toMatch(new RegExp(`\\.view${n}\\s+\\.viewLink[^{]*\\{[^}]*border-color:`));
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

    it('03: ningun border-width fraccionario (Chrome los redondea, haciéndolo inerte)', () => {
        /* Chrome redondea fraccionarios: 1.5px → 1px, 0.75px → 1px (DPR 1 y 2).
           La profundidad vive en border-color, no en border-width. */
        const widths = CSS_03.match(/border-width:[^;]+;/g) || [];
        for (const w of widths) {
            expect(w).toMatch(/border-width:\s*(?:\d+px|inherit|initial|unset)\s*;/);
            expect(w).not.toMatch(/\d+\.\d+px/);
        }
    });
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
        const reduceRaw = mediaBlock(CSS_03_RAW, '(prefers-reduced-motion: reduce)');

        /* ⚠ NO BASTA con buscar «NO es animación»: esa frase YA existe en el
           bloque desde antes, justificando la exclusión de `.scaleBox`. Un test
           que se conforme con ella pasa desde el primer día y no comprueba
           nada — verde por la razón equivocada, igual que el `perspective:
           1700px` que vivía en un comentario.

           Se exige el marcador de ESTE P-fix dentro del bloque: solo puede
           ponerlo la Task 3 al escribir su propia justificación. */
        expect(reduceRaw).toMatch(/P1-SECCIONES-03-04-PROFUNDIDAD/);
        expect(reduceRaw).toMatch(/NO es animaci[oó]n/i);
    });

    it('.guideBand CONSERVA su red de opacidad aunque pierda la del transform', () => {
        /* `.guideBand` es un `motion.div` con `variants={M.rise}`, y
           `rise.hidden` es `opacity: 0`. Sin la protección `opacity: 1 !important`,
           si el `whileInView` de `.sheet` no llega a disparar, la banda se queda
           invisible para siempre bajo `reduce`. `.viewLink`, en cambio, es un
           `<Link>` normal cuya visibilidad ya cubre el `opacity: 1 !important`
           de `.view`, que es su padre. Así que no son simétricos: `.guideBand`
           necesita su propia protección, `.viewLink` no. */
        expect(reduce).toMatch(/\.guideBand[^{]*\{[^}]*opacity:\s*1\s*!important[^}]*\}/);
    });
});

describe('las guias anotadas no pueden quedar fuera de la escena', () => {
    it('los porcentajes ancla siguen intactos', () => {
        for (const pct of ['20%', '78%', '10%', '88%']) {
            expect(JSX_03_RAW).toContain(pct);
        }
    });

    it('la banda de guias viaja con la escena — en el bloque de desktop', () => {
        /* Acotado al bloque >=1024px A PROPÓSITO: `.guideBand` es un
           `motion.div` con `variants={M.rise}` que framer-motion escribe inline,
           así que su transform de CSS se pisaría. El transform de la escena vive
           en `.guideSvg`, que es un `<svg>` normal sin props de framer-motion. */
        const desktop = mediaBlock(CSS_03, '(min-width: 1024px)');
        expect(desktop).toMatch(/\.guideSvg[^{]*\{[^}]*transform:\s*rotateX/);
    });

    it('el transform NO va en .guideBand: framer-motion lo pisaria inline', () => {
        /* `.guideBand` conserva `transform-style: preserve-3d` para que el
           espacio 3D que anida `.guideSvg` no quede aplanado por el transform
           inline de framer-motion — pero NO lleva el transform de rotación.
           Eso está en `.guideSvg`. */
        const desktop = mediaBlock(CSS_03, '(min-width: 1024px)');
        expect(desktop).toMatch(/\.guideBand[^{]*\{[^}]*transform-style:\s*preserve-3d/);
        expect(desktop).not.toMatch(/\.guideBand[^{]*\{[^}]*transform:\s*rotateX/);
    });
});

describe('la apertura por scroll', () => {
    const desktop = mediaBlock(CSS_03, '(min-width: 1024px)');

    it('existe un estado cerrado mas escorzado que el reposo', () => {
        expect(desktop).toMatch(/\[data-open='0'\][^{]*\.viewLink[^{]*\{[^}]*--ry:\s*-28deg/);
    });

    it('la transicion es solo de transform: nada de layout', () => {
        const t = desktop.match(/\.viewLink\s*\{[^}]*transition:\s*([^;]+);/);
        expect(t).not.toBeNull();
        expect(t[1]).toMatch(/^transform\s/);
    });

    it('usa LANDING_EASE, no un easing nuevo', () => {
        expect(desktop).toContain('cubic-bezier(0.22, 1, 0.36, 1)');
    });

    it('con reduce la lamina arranca ABIERTA', () => {
        expect(JSX_03).toMatch(/useState\(reduce\)/);
    });

    it('el observer se desconecta (once + cleanup)', () => {
        expect(JSX_03).toMatch(/io\.disconnect\(\)/);
    });
});
