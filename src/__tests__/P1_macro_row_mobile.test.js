/**
 * [P1-MACRO-BARS-UNIFORM · 2026-08-11] Las cuatro barras del contador son IGUALES en el
 * teléfono: cada macro ocupa el ancho y se lee exactamente como la de calorías.
 *
 * ESTE FICHERO CAMBIÓ DE BANDO, y conviene saber por qué antes de volver a darle la
 * vuelta. Afirmaba lo contrario —tres macros compartiendo una fila, con nombre corto y
 * barras finas— y esas dos formas fueron dos intentos MÍOS que el dueño corrigió:
 *
 *   1º Puse los tres a compartir fila, razonando que en escritorio esa disposición crea
 *      jerarquía. Es cierto en escritorio. En el teléfono cada macro se quedaba en
 *      ~104px y dejaba de leerse como una barra.
 *   2º Al reportarlo, deduje que el problema era la PROPORCIÓN y las adelgacé a 8px.
 *      Su respuesta: «no quería que las volvieras más pequeñas, me gusta como se ve en
 *      calorías, más minimalista y entendible».
 *
 * Lo que la de calorías tenía y las otras no NO era la altura: era el ANCHO. A lo ancho
 * la barra se lee de un vistazo y el porcentaje cabe dentro del relleno; a un tercio, ni
 * una cosa ni la otra. La jerarquía que yo defendía se la estaba cobrando al elemento que
 * más se mira.
 *
 * Lo que este guard protege es la UNIFORMIDAD: cuatro barras iguales, sin reglas que
 * vuelvan a distinguir `.barSmall` de `.barLarge` en el teléfono. Si alguien las
 * distingue otra vez, que sea sabiendo que ya se probó dos veces y se descartó.
 *
 * Lo que SÍ sobrevive de aquellos intentos —y sigue afirmado abajo— es la nota de la
 * meta al pie: el dueño no la cuestionó, y sacarla de la cabecera devolvía el primer
 * número a la primera pantalla.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE = join(AQUI, '..', 'components', 'dashboard');
/** CSS SIN comentarios. Sin esto, cualquier comprobación por selector se encuentra a sí
 *  misma: los comentarios de este fichero explican por qué NO debe haber reglas para
 *  `.barSmall` o `.fillPerc` en el teléfono, y nombrarlas basta para que la comprobación
 *  se dispare contra su propia justificación. Van ya varias veces con esta forma. */
const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

const CSS = sinComentarios(readFileSync(join(BASE, 'TrackingProgress.module.css'), 'utf8'));
const JSX = readFileSync(join(BASE, 'TrackingProgress.jsx'), 'utf8');

/** Cuerpo de un bloque contando llaves. Nunca una ventana de N caracteres: se queda
 *  corta en cuanto alguien escribe un comentario largo dentro. */
function cuerpo(fuente, consulta) {
    const i = fuente.indexOf(consulta);
    if (i < 0) return null;
    const abre = fuente.indexOf('{', i);
    let nivel = 0;
    for (let j = abre; j < fuente.length; j++) {
        if (fuente[j] === '{') nivel++;
        else if (fuente[j] === '}') {
            nivel--;
            if (nivel === 0) return fuente.slice(abre + 1, j);
        }
    }
    return null;
}

function reglas(fuente, selector) {
    // Escapa TODOS los metacaracteres, no solo el punto: el selector del tema oscuro
    // lleva `[data-theme="dark"]` y `:global(...)`, y unos corchetes o paréntesis sin
    // escapar se leen como clase de caracteres o grupo — la regla existe y el test jura
    // que desapareció.
    const re = new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'gm');
    const out = [];
    let m;
    while ((m = re.exec(fuente)) !== null) out.push(m[1]);
    return out.join('\n');
}

/** ¿Alguna regla del bloque declara `prop` para un selector que incluya `parte`?
 *
 *  Recorre la LISTA de selectores, no la cadena cruda: en cuanto alguien mete el
 *  selector en un grupo separado por comas, desaparece el `{` que seguía y una
 *  comprobación por texto deja de ver nada. Lo descubrió una mutación que no falló. */
function declaraPara(bloque, parte, prop) {
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(bloque)) !== null) {
        const selectores = m[1].split(',').map((s) => s.trim());
        if (!selectores.some((s) => s.includes(parte))) continue;
        if (new RegExp(`${prop}\\s*:`).test(m[2])) return true;
    }
    return false;
}

const movil = () => cuerpo(CSS, '@media (max-width: 768px)');

describe('[P1-MACRO-BARS-UNIFORM] las cuatro barras se leen igual en el teléfono', () => {
    it('cada macro ocupa el ancho: una sola columna', () => {
        const grid = reglas(movil(), '.macroGrid');
        expect(grid, 'no hay regla .macroGrid en el bloque del teléfono').not.toBe('');
        const cols = /grid-template-columns:\s*([^;]+);/.exec(grid);
        expect(cols, '.macroGrid no declara columnas en móvil').toBeTruthy();
        expect(
            cols[1].trim(),
            'los macros volvieron a compartir fila: a ~104px cada uno deja de leerse como '
            + 'una barra, que es lo que el dueño corrigió dos veces',
        ).toBe('1fr');
    });

    it('ninguna regla del teléfono distingue la barra de un macro de la de calorías', () => {
        const m = movil();
        for (const prop of ['height', 'display']) {
            expect(
                declaraPara(m, '.barSmall', prop),
                `el bloque del teléfono vuelve a declarar \`${prop}\` solo para .barSmall: `
                + 'la uniformidad ES la decisión, y adelgazarlas ya se probó y se descartó',
            ).toBe(false);
        }
    });

    it('el porcentaje sigue dentro del relleno en las cuatro', () => {
        // Es la mitad de lo que hacía «entendible» a la de calorías; con el ancho
        // recuperado vuelve a caber en todas.
        expect(reglas(CSS, '.fillPerc')).toMatch(/display:\s*flex/);
        expect(
            declaraPara(movil(), '.fillPerc', 'display'),
            'el teléfono vuelve a esconder el porcentaje de alguna barra',
        ).toBe(false);
    });

    it('el nombre del macro va completo — sin par largo/corto', () => {
        // El par existía solo para que «Carbohidratos» cupiera en 100px de columna.
        // Retirado con la disposición que lo pedía, en vez de quedarse por si acaso.
        expect(JSX, 'volvió el rótulo corto: solo tenía sentido con la fila de tres')
            .not.toMatch(/shortLabel/);
        expect(CSS).not.toMatch(/\.labelShort\s*\{/);
        // [P1-I18N-DASHBOARD · 2026-08-15] Acepta el literal Y la forma envuelta
        // en `t()`. Lo que este guard vigila es la PROPIEDAD —que el rótulo sea
        // la palabra completa y no una abreviatura— no la GRAFÍA con la que se
        // escribe el atributo. Anclado solo al literal, se ponía rojo el día que
        // la app se volvió multiidioma, sin que nada del comportamiento vigilado
        // hubiera cambiado: `label={t('Carbohidratos')}` sigue pintando
        // «Carbohidratos» en español y su equivalente completo en los otros 4.
        expect(JSX).toMatch(/label=(?:"Carbohidratos"|\{t\('Carbohidratos'\)\})/);
    });

    it('la nota de la meta sigue al pie, no encabezando la tarjeta', () => {
        // Anclado al USO (`className={styles.X}`), no a la mención: los comentarios de
        // este componente nombran `styles.etaChip` al explicar la mudanza, y buscar el
        // identificador suelto encontraba ESE texto.
        const uso = (clase) => JSX.indexOf(`className={styles.${clase}}`);
        const iCabecera = uso('subtitle');
        const iEta = uso('etaChip');
        const iComidas = uso('mealsSection');
        expect(iCabecera, 'no se encontró el uso de .subtitle').toBeGreaterThan(0);
        expect(iComidas, 'no se encontró el uso de .mealsSection').toBeGreaterThan(0);
        expect(iEta, 'desapareció la nota de la meta').toBeGreaterThan(0);
        expect(
            iEta,
            'la nota volvió a la cabecera: dos líneas de ancho completo antes del primer número',
        ).toBeGreaterThan(iComidas);
    });
});

describe('[P1-SCAN-BTN-ACCENT] el botón de escanear se anuncia sin hover', () => {
    it('el acento es el estado en REPOSO, no solo el del hover', () => {
        // En un teléfono no hay hover: dejar el acento ahí lo vuelve inalcanzable, y el
        // único control de la tarjeta se queda siempre en gris de apagado.
        const reposo = reglas(CSS, '.scanBtn');
        expect(reposo, 'no se encontró la regla del botón de escanear').not.toBe('');
        expect(
            /background:\s*transparent/.test(reposo),
            'el botón volvió a reposar en transparente: sin hover no se distingue de un texto',
        ).toBe(false);
        expect(reposo).toMatch(/color:\s*#4F46E5/i);

        // Una sola regla `.scanBtn` EN LA BASE: dos con el mismo selector y el mismo
        // alcance se resuelven por orden, y quien lea la primera creerá que el botón es
        // gris. Se cuentan solo las de columna 0 — las anidadas en un `@media` van
        // indentadas y son overrides legítimos (el móvil le da ancho completo).
        const enBase = (CSS.match(/^\.scanBtn\s*\{/gm) || []).length;
        expect(enBase, 'hay más de una regla `.scanBtn` en la base: el estado real depende del orden')
            .toBe(1);
    });

    it('el tema oscuro también reposa con acento', () => {
        const oscuro = reglas(CSS, ':global(html[data-theme="dark"]) .scanBtn');
        expect(oscuro, 'no hay variante oscura del botón').not.toBe('');
        expect(
            /color:\s*var\(--text-muted\)/.test(oscuro),
            'en oscuro el botón vuelve al gris apagado en reposo',
        ).toBe(false);
    });

    it('sigue siendo un tinte, no un relleno sólido', () => {
        // El relleno sólido es lo más ruidoso de una pantalla y competiría con las cifras,
        // que son el motivo de la tarjeta.
        const reposo = reglas(CSS, '.scanBtn');
        expect(
            /background:\s*(#[0-9A-F]{6}|linear-gradient)/i.test(reposo),
            'el botón pasó a relleno sólido: le roba la mirada a los números',
        ).toBe(false);
    });
});
