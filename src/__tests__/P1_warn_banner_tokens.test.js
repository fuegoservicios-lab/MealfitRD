/**
 * [P1-WARN-BANNER-TOKENS · 2026-08-11] «La advertencia no debería ser de un color más
 * adaptado al modo oscuro?»
 *
 * EL DEFECTO. Dos avisos ámbar —el de permisos de notificación en Ajustes y el de
 * «bloque pausado» del Dashboard— llevaban la paleta CLARA clavada a mano en estilos
 * inline (`#FFF7ED`/`#FFFBEB` de fondo, `#FED7AA`/`#FCD34D` de borde, `#92400E` de
 * texto). Sin ninguna noción de tema, así que en oscuro aterrizaba un bloque crema sobre
 * una pantalla casi negra.
 *
 * LO QUE LA MEDICIÓN ACLARÓ: el texto NO era el problema. `#92400E` sobre `#FFF7ED` da
 * 6,68:1 — perfectamente legible. Lo que chirriaba era la SUPERFICIE: el banner se
 * despegaba **ΔL* 92,4** de la página. Con los tokens baja a 7,7 y el texto además
 * mejora a 11,13:1. Es la misma distinción que P1-LIGHT-INK-CONTRACT dejó escrita: para
 * superficies, el ratio WCAG contesta a otra pregunta.
 *
 * NO HIZO FALTA INVENTAR PALETA: `--warning-bg/-border/-text` ya existían con valores
 * por tema, y el comentario del token oscuro dice literalmente «era #78350F invisible».
 * Alguien ya había resuelto esto; estos dos call sites no se enteraron.
 *
 * Este guard afirma que los avisos usan TOKENS y no hex crudo, que es lo que hace que la
 * pregunta del dueño no se repita con el siguiente tema que se añada — hay un tercero
 * (`paper`) en las rutas de marketing, y un ternario sobre `isDark` no lo conoce.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const CSS = leer('index.css');

/** El `style={{ ... }}` del recuadro que contiene un TEXTO dado.
 *
 *  Anclar cuesta más de lo que parece, y aquí fallé dos veces antes de acertar:
 *    · hacia atrás desde el texto → encuentra el `style` del ICONO que va justo antes,
 *      no el del recuadro;
 *    · hacia delante desde el nombre del manejador → ese identificador aparece también
 *      en el import y en otro sitio del fichero, e `indexOf` devuelve la PRIMERA.
 *
 *  La forma que sí resiste no depende de cuántas veces aparezca nada: desde el texto
 *  visible se retrocede al `role` del elemento que lo contiene —la aparición
 *  inmediatamente anterior, sea la primera del fichero o la séptima— y desde ahí se
 *  avanza a su `style`, que en JSX se declara antes del contenido. */
function estiloDelRecuadroCon(fuente, texto, rol) {
    const iTexto = fuente.indexOf(texto);
    if (iTexto < 0) return null;
    const iRol = fuente.lastIndexOf(rol, iTexto);
    if (iRol < 0) return null;
    const abre = fuente.indexOf('style={{', iRol);
    if (abre < 0 || abre > iTexto) return null;
    const cierra = fuente.indexOf('}}', abre);
    return cierra > abre ? fuente.slice(abre, cierra) : null;
}

/** Los tres tokens de banner de aviso deben existir en AMBOS temas — si no, cambiar los
 *  call sites a tokens los dejaría sin color en uno de los dos. */
function tokenPorTema(nombre) {
    const re = new RegExp(`${nombre}:\\s*([^;]+);`, 'g');
    return [...CSS.matchAll(re)].map((m) => m[1].trim());
}

describe('[P1-WARN-BANNER-TOKENS] los avisos ámbar se adaptan al tema', () => {
    it('el sistema define los tokens de aviso para más de un tema', () => {
        for (const t of ['--warning-bg', '--warning-text', '--warning-border']) {
            const valores = tokenPorTema(t);
            expect(valores.length, `${t} está definido una sola vez: no puede adaptarse`)
                .toBeGreaterThan(1);
            // Y con valores DISTINTOS: definirlo dos veces igual sería adaptación de mentira.
            expect(new Set(valores).size, `${t} vale lo mismo en todos los temas`).toBeGreaterThan(1);
        }
    });

    it('el aviso de permisos de Ajustes no lleva ámbar claro clavado', () => {
        const bloque = estiloDelRecuadroCon(
            leer('pages', 'Settings.jsx'),
            'Permiso bloqueado en el navegador',
            'role="alert"',
        );
        expect(bloque, 'no se encontró el aviso de permisos').toBeTruthy();
        expect(bloque).toMatch(/var\(--warning-bg\)/);
        expect(bloque).toMatch(/var\(--warning-text\)/);
        expect(
            /#(FFF7ED|FFFBEB|FED7AA|92400E|B45309)/i.test(bloque),
            'volvió un hex de la paleta clara: en oscuro es un bloque crema sobre casi negro',
        ).toBe(false);
    });

    it('el aviso de bloque pausado del Dashboard tampoco', () => {
        const bloque = estiloDelRecuadroCon(
            leer('pages', 'Dashboard.jsx'),
            '{_copy.title}',
            'role="status"',
        );
        expect(bloque, 'no se encontró el aviso de bloque pausado').toBeTruthy();
        expect(bloque).toMatch(/var\(--warning-bg\)/);
        expect(bloque).toMatch(/var\(--warning-text\)/);
        expect(
            /#(FFF7ED|FFFBEB|FCD34D|92400E)/i.test(bloque),
            'volvió un hex de la paleta clara al banner de pausa',
        ).toBe(false);
    });

    it('sobre el relleno ámbar el texto va oscuro, no blanco', () => {
        // Medido: blanco sobre #F59E0B da 2,15:1 y sobre #FBBF24 1,67:1 — por debajo del
        // mínimo legible en los DOS temas. No era un problema de modo oscuro: el botón se
        // leía mal también en claro.
        const dash = leer('pages', 'Dashboard.jsx');
        const i = dash.indexOf("background: 'var(--warning)'");
        expect(i, 'el botón del aviso dejó de usar el ámbar del tema').toBeGreaterThan(0);
        const bloque = dash.slice(i, i + 120);
        expect(
            /color:\s*'white'|color:\s*'#FFF/i.test(bloque),
            'el texto del botón volvió a blanco sobre amarillo: 2,15:1, ilegible',
        ).toBe(false);
    });
});
