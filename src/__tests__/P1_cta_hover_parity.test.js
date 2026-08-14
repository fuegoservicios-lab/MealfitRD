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
    ])('%s: el botón de borrar NO lleva sombra en reposo', (archivo) => {
        // Petición del dueño: «agregaste el sombreado incluso cuando yo no le
        // pasé el mouse por encima». Su vecino «+ Añadir» sí la lleva —es un
        // CTA primario y su elevación es parte de su identidad—; este solo
        // debe pesar cuando el cursor lo toca.
        expect(bloque(leer(archivo), '.clear'), 'el botón de borrar no debe verse elevado en reposo')
            .not.toMatch(/box-shadow/);
    });

    it.each([
        ['pages/Pantry.fridge.module.css'],
        ['pages/Pantry.mobileFridge.module.css'],
    ])('%s: y bajo el cursor su halo es de PELIGRO, no índigo', (archivo) => {
        const css = leer(archivo);
        expect(bloque(css, '.clear', ':hover'), 'un halo índigo emparentaría el botón de '
            + 'VACIAR la Nevera con el de añadir, que es su opuesto')
            .toMatch(/box-shadow:\s*var\(--cta-shadow-danger-hover\)/);
        expect(bloque(css, '.clear', ':active'))
            .toMatch(/box-shadow:\s*var\(--cta-shadow-danger-active\)/);
    });

    it('NINGÚN token de :root lee una variable que el elemento declara (patrón inerte)', () => {
        // LA LECCIÓN, anclada: una custom property se resuelve en el elemento
        // donde se DECLARA. Un token de :root que lea `var(--algo-que-pone-el-
        // botón)` se computa arriba, toma el fallback y hereda ESE valor — el
        // override del descendiente no hace nada. Verificado en Chrome: el
        // mixin devolvía srgb(0.31 0.27 0.90) (índigo) donde el token explícito
        // devuelve srgb(0.94 0.27 0.27) (rojo).
        // Ningún test de texto puede ver eso; lo único que se puede vigilar es
        // que el patrón no vuelva.
        // Sin comentarios: la nota que explica POR QUÉ el mixin no sirve
        // nombra `--cta-tint`, así que un guard sobre el fuente crudo se acusa
        // a sí mismo. (Tercera vez hoy que un guard lee su documentación.)
        const ds = leer('index.css').replace(/\/\*[\s\S]*?\*\//g, '');
        const raiz = ds.slice(ds.indexOf(':root'), ds.indexOf('--radius-sm'));
        expect(raiz, 'volvió el mixin inerte: usa un token por familia')
            .not.toMatch(/--cta-tint/);
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
