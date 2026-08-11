/**
 * [P1-SETTINGS-HEADER-STICKY · 2026-08-10] «Cuando le doy scroll desaparece la X y el
 * texto que dice Configuración».
 *
 * EL DEFECTO. Hermano de P1-SETTINGS-NAV-STICKY: allí era la barra de secciones, aquí la
 * cabecera. Misma causa de fondo — dentro del diálogo el que scrollea es el wrapper de
 * Settings (`.panel > *` lleva `overflow-y: auto`), no el documento, y todo lo que viva
 * dentro se va con el contenido salvo que se pegue.
 *
 * EL MATIZ QUE ENGAÑA. La X estaba en `position: absolute`, que suena a «fijo» y no lo
 * es: un elemento absoluto dentro de un contenedor con scroll SE VA CON EL CONTENIDO,
 * porque su bloque contenedor scrollea con él. Solo `sticky` o `fixed` se quedan.
 *
 * LO CARO NO ERA ESTÉTICO: al bajar, el usuario se quedaba sin botón de cerrar. Quedan
 * `Esc` y el clic fuera, pero ninguna salida visible.
 *
 * MEDIDO ANTES DE TOCAR, en Chrome a 1112px inyectando el CSS real de los dos módulos:
 *
 *     tras 999px de scroll   X.top = −987px   ·   cabecera.top = −979px
 *     con sticky             X.top =   32px   ·   cabecera.top =   20px  (invariantes)
 *
 * No estaban recortadas: estaban fuera. Esa medición descartó las hipótesis caras
 * (un ancestro con `overflow:hidden`, la rejilla, un `transform`) y dejó dos
 * declaraciones que cambiar.
 *
 * Se afirma la PROPIEDAD —la cabecera queda pegada mientras el contenido corre— y no
 * valores de `top`, que pueden ajustarse sin romper nada. Y se ancla además QUIÉN hace
 * scroll: si alguien mueve ese `overflow-y` a otro sitio, el pegado se ancla a otro
 * contenedor y el arreglo deja de significar lo que dice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { zDeTexto } from './utils/zLayers';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(AQUI, '..', 'pages', 'Settings.module.css'), 'utf8');
const CSS_DIALOGO = readFileSync(
    join(AQUI, '..', 'components', 'dashboard', 'SettingsDialog.module.css'),
    'utf8',
);

/** Declaraciones de una regla, anclando a inicio de línea. Contar llaves y no una
 *  ventana de N caracteres: un comentario largo dentro del bloque desborda la ventana
 *  y el guard se queda mirando el aire. */
function reglas(fuente, selector) {
    const re = new RegExp(`^[ \\t]*${selector.replace(/\./g, '\\.')}\\s*\\{`, 'gm');
    const out = [];
    let m;
    while ((m = re.exec(fuente)) !== null) {
        const abre = fuente.indexOf('{', m.index);
        let nivel = 0;
        for (let j = abre; j < fuente.length; j += 1) {
            if (fuente[j] === '{') nivel += 1;
            else if (fuente[j] === '}') {
                nivel -= 1;
                if (nivel === 0) { out.push(fuente.slice(abre + 1, j)); break; }
            }
        }
    }
    return out.join('\n');
}

/* [P1-Z-SCALE · 2026-08-10] Resuelve tokens `var(--z-*)` además de literales:
   si no, este guard se cae solo con que alguien adopte la escala. */
const z = (cuerpo) => zDeTexto(cuerpo);

describe('[P1-SETTINGS-HEADER-STICKY] la cabecera del diálogo no se va con el scroll', () => {
    it('el título queda pegado arriba', () => {
        const cabecera = reglas(CSS, '.inDialog .pageHeader');
        expect(cabecera, 'no se encontró la regla .inDialog .pageHeader').not.toBe('');
        expect(cabecera).toMatch(/position:\s*sticky/);
        expect(cabecera, 'sticky sin `top` no se pega a nada').toMatch(/top:\s*[^;]+;/);
    });

    it('la barra pegajosa es opaca', () => {
        // Un sticky transparente deja que el contenido se le monte debajo mientras
        // pasa: se pega, y aun así no se lee.
        const cabecera = reglas(CSS, '.inDialog .pageHeader');
        expect(cabecera, 'sin fondo, el contenido se ve pasar por debajo del título')
            .toMatch(/background:\s*[^;]+;/);
    });

    it('el botón de cerrar queda pegado, y NO en absolute', () => {
        const boton = reglas(CSS, '.inDialog .exitSettingsBtn');
        expect(boton, 'no se encontró la regla .inDialog .exitSettingsBtn').not.toBe('');
        const posicion = /position:\s*([a-z-]+)/.exec(boton);
        expect(posicion, '.inDialog .exitSettingsBtn no declara position').toBeTruthy();
        expect(
            posicion[1],
            '`absolute` dentro de un contenedor con scroll se va con el contenido: '
            + 'el usuario se queda sin botón de cerrar al bajar',
        ).toBe('sticky');
    });

    it('la X se pinta por encima de la barra, no debajo', () => {
        // Si la cabecera (opaca) gana en z, su fondo tapa la X y volvemos al mismo
        // síntoma —no hay botón de cerrar— por una causa distinta.
        const zBoton = z(reglas(CSS, '.inDialog .exitSettingsBtn'));
        const zCabecera = z(reglas(CSS, '.inDialog .pageHeader'));
        expect(zBoton, 'la X no declara z-index').toBeGreaterThan(0);
        expect(zCabecera, 'la cabecera no declara z-index').toBeGreaterThan(0);
        expect(zBoton).toBeGreaterThan(zCabecera);
    });

    it('quién hace scroll sigue siendo el hijo del panel', () => {
        // El pegado se ancla al ancestro que scrollea. Si este overflow se mueve, lo
        // de arriba deja de significar lo que dice aunque siga en verde.
        const hijo = reglas(CSS_DIALOGO, '.panel > \\*');
        expect(hijo, 'desapareció la regla `.panel > *` del diálogo').not.toBe('');
        expect(hijo).toMatch(/overflow-y:\s*auto/);
    });
});
