/* [P1-CTA-HOVER-PARITY · 2026-08-13] Los CTA sólidos del dashboard no
 * respondían al mouse.
 *
 * El dueño señaló tres: «+ Añadir» (Nevera), «Ver plan» (Historial) y
 * «Descargar PDF» (Recetas). Son EL MISMO botón —mismo gradiente
 * primary-light→primary— implementado en cinco sitios, con tres conductas
 * distintas al pasar por encima:
 *   · Recetas (escritorio y móvil): nada.
 *   · Historial: nada, y encima IMPOSIBLE — su estilo es inline y los estilos
 *     inline no admiten `:hover`. Por eso necesita una clase.
 *   · Nevera: `filter: brightness(1.06)`, casi imperceptible, y además
 *     brightness es justo lo que la nota de `.mf-cta-btn` descartó.
 *
 * LA RECETA NO ES NUEVA: es la que el dueño ya aprobó para el CTA del
 * formulario (`.mf-cta-btn`, marker CTA-HOVER-GLOW · calmado FORM-CTA-STATIC)
 * — «SIN desplazamiento en hover/active y glow discreto: la sombra base es
 * tenue y el hover solo la intensifica levemente». Aquí se extiende a los CTA
 * del dashboard vía tokens, para que los cinco sitios dejen de divergir.
 *
 * EL «NO» ES PARTE DEL CONTRATO, y por eso este guard lo vigila explícitamente:
 * hay cinco decisiones documentadas pidiendo quitar el MOVIMIENTO en hover
 * (P3-AVATAR-NO-MOTION, preferenceCard 2026-05-29, P3-PRICING-CARDS-STATIC,
 * FORM-STATIC-HOVER, P3-VERBTN-NO-MOTION). Sombra sí; desplazamiento no.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const leer = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

const CTA_MODULOS = [
    ['pages/Pantry.fridge.module.css', '.add'],
    ['pages/Pantry.mobileFridge.module.css', '.add'],
    ['components/recipes/RecipesView.module.css', '.primary'],
    ['components/recipes/MobileRecipes.module.css', '.primary'],
    // [P1-CTA-TINT-DANGER · 2026-08-14] El botón de papelera de la Nevera.
    // Se quedó fuera de la primera pasada porque aquélla barrió la familia
    // del GRADIENTE índigo y éste es de la familia de peligro (fondo tenue).
    // El dueño lo notó de inmediato: para quien mira la barra, «los botones»
    // son los dos, no una familia CSS. La lista se define por lo que el
    // usuario ve junto, no por cómo está implementado.
    ['pages/Pantry.fridge.module.css', '.clear'],
    ['pages/Pantry.mobileFridge.module.css', '.clear'],
];

/** Cuerpo de la regla cuyo selector es exactamente `clase` (opcionalmente con
 *  pseudo-clases encadenadas como `:not(.locked)`) y termina en `estado`.
 *  Sin esto, `.primary:not(.locked):hover` —la forma real en Recetas, que
 *  excluye el botón bloqueado— no se encontraría y el guard mediría vacío. */
const bloque = (css, clase, estado = '') => {
    const sc = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const nombre = clase.replace('.', '\\.');
    const pseudos = estado ? `(?::not\\([^)]*\\))*${estado}` : '';
    const re = new RegExp(`(^|\\n)\\s*${nombre}${pseudos}\\s*\\{([^}]*)\\}`);
    const m = sc.match(re);
    return m ? m[2] : '';
};

describe('[P1-CTA-HOVER-PARITY] los CTA sólidos responden al mouse', () => {
    it.each(CTA_MODULOS)('%s %s tiene hover con sombra del token', (archivo, clase) => {
        const css = leer(archivo);
        const hov = bloque(css, clase, ':hover');
        expect(hov, `${clase} no declara :hover — el botón no acusa el mouse`).not.toBe('');
        expect(hov, `${clase}:hover debe usar el token de sombra, no un valor suelto`)
            .toMatch(/box-shadow:\s*var\(--cta-shadow-hover\)/);
    });

    it.each(CTA_MODULOS)('%s %s parte del token de sombra base', (archivo, clase) => {
        expect(bloque(leer(archivo), clase)).toMatch(/box-shadow:\s*var\(--cta-shadow\)/);
    });

    it.each(CTA_MODULOS)('%s %s NO se mueve ni se aclara en hover', (archivo, clase) => {
        // Las cinco decisiones del dueño en contra del movimiento. Y brightness
        // queda fuera por la misma nota que definió la receta del formulario.
        const hov = bloque(leer(archivo), clase, ':hover');
        expect(hov, 'volvió el desplazamiento en hover').not.toMatch(/transform:\s*(?!none)/);
        expect(hov, 'volvió el brightness que la receta descartó').not.toMatch(/brightness/);
    });

    it.each([
        ['pages/Pantry.fridge.module.css'],
        ['pages/Pantry.mobileFridge.module.css'],
    ])('%s: el botón de borrar tiñe su halo de PELIGRO, no de índigo', (archivo) => {
        // [P1-CTA-TINT-DANGER · 2026-08-14] La geometría de la sombra es común,
        // pero el color no puede serlo: un halo índigo bajo el botón de vaciar
        // la Nevera lo emparenta con el CTA de añadir, que es su opuesto. El
        // token lee `--cta-tint` y cada botón declara el suyo; sin esa línea el
        // fallback lo pintaría índigo y NADIE lo notaría en un test de humo.
        const cuerpo = bloque(leer(archivo), '.clear');
        expect(cuerpo, '.clear no declara su tinte: el halo saldría índigo')
            .toMatch(/--cta-tint:\s*var\(--danger\)/);
    });

    it('el token acepta un tinte por botón (si no, toda sombra sería índigo)', () => {
        const ds = leer('index.css');
        const m = ds.match(/--cta-shadow:\s*([^;]+);/);
        expect(m).toBeTruthy();
        expect(m[1], 'la geometría debe ser común y el COLOR parametrizable')
            .toMatch(/var\(--cta-tint,\s*var\(--primary\)\)/);
    });

    it('los tres tokens existen y el de hover es más intenso que el base', () => {
        const ds = leer('index.css');
        const val = (nombre) => {
            const m = ds.match(new RegExp(`${nombre}:\\s*([^;]+);`));
            expect(m, `falta el token ${nombre}`).toBeTruthy();
            return m[1];
        };
        const base = val('--cta-shadow');
        const hover = val('--cta-shadow-hover');
        val('--cta-shadow-active');
        const pct = (s) => Number(s.match(/(\d+)%/)[1]);
        expect(pct(hover)).toBeGreaterThan(pct(base));
        // Relativos al tema: la sombra nace de tokens, no de un rgba fijo.
        // (El color pasó de --primary directo a --cta-tint con fallback en
        // P1-CTA-TINT-DANGER; lo que se protege es que siga siendo del tema.)
        expect(base).toMatch(/color-mix\(in srgb,\s*var\(--/);
        expect(base, 'un rgba fijo no seguiría al tema').not.toMatch(/rgba?\(/);
    });

    it('el botón inline del Historial recibe la clase global (inline no admite :hover)', () => {
        const jsx = leer('components/history/HistoryDesktopPanel.jsx');
        // `style={btn("primary")}` y no `btn("primary")` a secas: lo segundo
        // encuentra antes el comentario que documenta el contrato.
        const linea = jsx.split(/\r?\n/).find((l) => l.includes('style={btn("primary")}'));
        expect(linea, 'no se encontró el call site del CTA primario').toBeTruthy();
        expect(linea, 'el botón inline necesita la clase para poder tener :hover')
            .toContain('className="mf-cta-solid"');
    });

    it('la fábrica inline NO declara boxShadow (ganaría al :hover de la clase)', () => {
        // LA TRAMPA de este fix, y por eso el guard la vigila: un box-shadow
        // inline gana sobre CUALQUIER regla de clase, `:hover` incluido. Si
        // vuelve a btn("primary"), el botón conserva su sombra base y el hover
        // queda inerte — sin que nada se vea roto ni ningún otro test caiga.
        // Sin comentarios primero: la nota que documenta esta misma trampa
        // contiene la palabra `boxShadow`, así que un guard que lea el archivo
        // crudo se acusa a sí mismo y falla siempre.
        const jsx = leer('components/history/HistoryDesktopPanel.jsx')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
        const cuerpo = jsx.slice(jsx.indexOf('function btn('));
        const rama = cuerpo.slice(0, cuerpo.indexOf('return { ...base, color: "var(--text-main)"'));
        expect(rama).not.toMatch(/boxShadow/);
    });

    it('la utilidad global existe y respeta el contrato (sombra sí, movimiento no)', () => {
        const ds = leer('index.css');
        const i = ds.indexOf('.mf-cta-solid');
        expect(i, 'falta la utilidad .mf-cta-solid').toBeGreaterThan(-1);
        const zona = ds.slice(i, i + 900);
        expect(zona).toMatch(/\.mf-cta-solid:not\(:disabled\):hover\s*\{[^}]*--cta-shadow-hover/);
        expect(zona).not.toMatch(/transform:\s*translate/);
    });
});
