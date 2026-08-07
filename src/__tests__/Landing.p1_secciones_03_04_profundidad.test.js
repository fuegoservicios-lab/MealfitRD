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
// ⚠ Y el JSX necesita ADEMÁS los comentarios de línea. `stripComments` solo
// entiende los de bloque, así que un `// io.disconnect();` —el caso realista:
// alguien comenta la línea depurando y la commitea— seguía contando como
// código vivo. Probado por mutación: comentando el callback, el guard del
// «once» pasaba.
//
// Los `//` se quitan SOLO del JSX: en CSS no son comentario y `url(//cdn/…)`
// es legítimo. El `[^:]` protege `https://`.
//
// [lint] Este bloque era `/* … */` y citaba el delimitador de cierre literal,
// que dentro de un bloque lo habría cerrado a mitad de frase; se colaba un
// U+200B invisible entre el `*` y el `/` para impedirlo. Funcionaba, pero
// `no-irregular-whitespace` lo marcaba y un `--fix` a ciegas habría borrado el
// U+200B —cerrando el comentario y rompiendo el archivo—. En comentarios de
// línea el delimitador no es especial y el truco deja de hacer falta.
const stripLineComments = (src) => src.replace(/(^|[^:])\/\/.*$/gm, '$1');
const JSX_03 = stripLineComments(stripComments(JSX_03_RAW));

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
        /* `.guideBand` es un `motion.div` (variants `rise`; en móvil `M.rise`,
           cuyo `hidden` es `opacity: 0`). Sin la protección `opacity: 1 !important`,
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
           `motion.div` cuyo transform framer-motion escribe inline,
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
        /* ⚠ SE COMPRUEBA LA RELACION, NO EL VALOR. La version anterior fijaba
           el literal `-28deg`, asi que prohibia afinar un parametro que el
           plan declara explicitamente afinable: subir el drama hacia rojo el
           guard sin que nada estuviera mal. Un test que impide el cambio que
           existe para permitir no vigila una invariante, fija una constante.

           La invariante real es la que dice su nombre: el estado cerrado tiene
           que estar MAS escorzado y MAS hundido que cualquier pose de reposo. */
        const cerrado = desktop.match(/\[data-open='0'\][^{]*\.viewLink[^{]*\{([^}]*)\}/);
        expect(cerrado).not.toBeNull();
        const ryCerrado = Math.abs(parseFloat(cerrado[1].match(/--ry:\s*(-?[\d.]+)deg/)[1]));
        const zCerrado = parseFloat(cerrado[1].match(/--z:\s*(-?[\d.]+)px/)[1]);

        /* Cada vista tiene DOS bloques `.viewNN .viewLink`: el de la pose y el
           del `--open-delay`. Solo el primero declara `--ry`, asi que hay que
           filtrar o el `.match` revienta contra el segundo. */
        const reposo = [...desktop.matchAll(/\.view0\d\s+\.viewLink[^{]*\{([^}]*)\}/g)]
            .filter((m) => /--ry:/.test(m[1]))
            .map((m) => ({
                ry: Math.abs(parseFloat(m[1].match(/--ry:\s*(-?[\d.]+)deg/)[1])),
                z: parseFloat(m[1].match(/--z:\s*(-?[\d.]+)px/)[1]),
            }));
        expect(reposo).toHaveLength(5);

        expect(ryCerrado).toBeGreaterThan(Math.max(...reposo.map((v) => v.ry)));
        expect(zCerrado).toBeLessThan(Math.min(...reposo.map((v) => v.z)));
    });

    it('la transicion es solo de transform: nada de layout', () => {
        const t = desktop.match(/\.viewLink\s*\{[^}]*transition:\s*([^;]+);/);
        expect(t).not.toBeNull();
        /* La coma que importa es la que SEPARA transiciones, no la que separa
           argumentos. `cubic-bezier(0.22, 1, 0.36, 1)` lleva tres comas y es
           el easing que este plan obliga a reusar: un test que prohíba comas a
           secas rechaza el código correcto. Por eso se vacían primero los
           paréntesis y se busca la coma en lo que queda.

           Con solo `/^transform\s/` (la versión anterior) una regresión como
           `transition: transform 900ms ease, top 200ms ease` pasaba — justo la
           propiedad de layout que este test dice impedir. */
        const sinArgumentos = t[1].replace(/\([^)]*\)/g, '');
        expect(sinArgumentos.trim()).toMatch(/^transform\s[^,]*$/);
    });

    it('usa LANDING_EASE, no un easing nuevo', () => {
        expect(desktop).toContain('cubic-bezier(0.22, 1, 0.36, 1)');
    });

    it('con reduce la lamina arranca ABIERTA', () => {
        expect(JSX_03).toMatch(/useState\(reduce\)/);
    });

    it('el observer se desconecta (once + cleanup)', () => {
        /* `io.disconnect()` aparece DOS veces y legítimamente: una en el
           callback (el «once») y otra en el cleanup del efecto.

           ⚠ NADA DE VENTANAS DE PROXIMIDAD. El intento anterior era
           `/isIntersecting[\s\S]{0,200}?io\.disconnect\(\)/`, y la revisión lo
           tumbó MUTANDO el código: borrada la llamada del callback, los dos
           sitios reales distan 118 caracteres, así que la ventana de 200
           saltaba por encima del callback vacío y enganchaba la del cleanup.
           Verde con el «once» roto — el observer seguiría disparando en cada
           intersección.

           Se ancla a la SECUENCIA exacta del callback y se cuentan los dos
           sitios. Verificado por mutación: con el código real da 2/true/true;
           borrando la del callback da 1/false/true y el test cae. */
        const desconexiones = (JSX_03.match(/io\.disconnect\(\)/g) || []).length;
        expect(desconexiones).toBeGreaterThanOrEqual(2);
        expect(JSX_03).toMatch(/setOpen\(true\);\s*io\.disconnect\(\)/);
        expect(JSX_03).toMatch(/return\s*\(\)\s*=>\s*io\.disconnect\(\)/);
    });
});

describe('04 — capas axonometricas', () => {
    const desktop04 = mediaBlock(CSS_04, '(min-width: 1024px)');

    it('el canto existe, es de 2px a tinta plena y vive en el bloque de desktop', () => {
        expect(desktop04).toMatch(/border-right:\s*2px solid var\(--pa-ink\)/);
        expect(desktop04).toMatch(/border-bottom:\s*2px solid var\(--pa-ink\)/);
    });

    it('el canto va en DOS lados, no en cuatro: una lamina no es un marco', () => {
        expect(desktop04).not.toMatch(/border-top:\s*2px/);
        expect(desktop04).not.toMatch(/border-left:\s*2px/);
    });

    it('las laminas llevan ancho explicito: sin el, margin-left ESTRECHA en vez de desplazar', () => {
        /* El defecto que este test existe para impedir es invisible en el
           código y en la captura: los tres cantos derechos caen en la misma
           vertical (medido: 1232px las tres) y el escalonado no existe. */
        expect(desktop04).toMatch(/width:\s*calc\(100% - 5rem\)/);
    });

    it('NADA en la 04 rota: los datos no se deforman', () => {
        /* Cubre las cuatro formas de rotar en CSS, no solo `rotate(`:
           `rotate3d()`, `rotateX/Y/Z()` y la propiedad suelta `rotate:`. */
        expect(desktop04).not.toMatch(/rotate(3d)?[XYZ]?\(/);
        expect(CSS_04).not.toMatch(/\brotate\s*:/);
        expect(CSS_04).not.toMatch(/perspective:/);
    });
});
