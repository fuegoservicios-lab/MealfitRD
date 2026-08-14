/* [P1-ZONE-TOGGLE-HOVER · 2026-08-14] El interruptor Nevera/Alacena no acusaba
 * el mouse. Tercer aviso del dueño sobre lo mismo, y cada vez el elemento era
 * de una familia que mi barrido anterior no incluía: primero los CTA del
 * gradiente, luego el botón de papelera, ahora estos tabs.
 *
 * Aquí el tratamiento NO puede ser el del CTA, y el motivo es de jerarquía:
 * este control tiene un ESTADO (la pastilla seleccionada) y el hover es
 * pasajero. Si el hover pesara más que el estado, el usuario dudaría de cuál
 * mueble está viendo. Medido en tema claro, el estado activo solo dista 3,7
 * dL* del riel —su distintivo real es la sombra, no el color—, así que el
 * hover se queda por debajo de esa cifra.
 *
 * Dos conductas, una por estado:
 *   · INACTIVO (el accionable): se sombrea con un velo de la tinta apagada
 *     —oscurece en claro, aclara en oscuro— y sube su texto a la tinta
 *     principal. Sin elevación: elevarse es lo que distingue al activo.
 *     No sirve `var(--bg-muted)` como hace `.navitem`: el riel del toggle YA
 *     es ese color y el hover sería invisible.
 *   · ACTIVO: ya está elevado; bajo el cursor pesa un punto más (sm → md).
 *
 * De paso, su sombra era `rgba(0,0,0,.3)` fija: en tema claro eso es SEIS
 * veces más dura que la del sistema (0.05). Pasa a los tokens, que ya vienen
 * calibrados por tema.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MODULOS = [
    'pages/Pantry.fridge.module.css',
    'pages/Pantry.mobileFridge.module.css',
];

const leer = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

// Escape COMPLETO de metacaracteres: la lista a mano se dejaba fuera los
// paréntesis de `:not(...)`, que regex lee como grupo de captura — el selector
// no casaba nunca y el guard medía cadena vacía.
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const regla = (css, selector) => {
    const m = css.match(new RegExp(`(^|\\n)\\s*${escapar(selector)}\\s*\\{([^}]*)\\}`));
    return m ? m[2] : '';
};

describe.each(MODULOS)('[P1-ZONE-TOGGLE-HOVER] %s', (archivo) => {
    const css = leer(archivo);

    it('el tab inactivo enciende su TEXTO, y nada más', () => {
        const hov = regla(css, '.zone:not([aria-selected="true"]):hover');
        expect(hov, 'el tab inactivo no declara :hover — el toggle no acusa el mouse').not.toBe('');
        expect(hov, 'a plena intensidad: por debajo del 70% no se percibe (comprobado en capturas)')
            .toMatch(/color:\s*var\(--text-main\)/);
    });

    it('el hover NO toca el fondo ni la elevación (petición de discreción)', () => {
        // «quiero un sombreado más discreto. Por ejemplo nada más sombrear el
        // texto». Lo anterior teñía además el fondo con un velo; se retiró.
        const hov = regla(css, '.zone:not([aria-selected="true"]):hover');
        expect(hov, 'volvió el velo de fondo: el dueño lo pidió solo en el texto')
            .not.toMatch(/background/);
        expect(hov, 'si el inactivo se eleva, deja de leerse cuál está seleccionado')
            .not.toMatch(/box-shadow/);
    });

    it('lo que el hover NO puede tomar prestado es la PASTILLA del activo', () => {
        // Corrección de una regla mía anterior: llegué a exigir que la tinta
        // del hover no alcanzara la del seleccionado. Con la evidencia
        // delante —capturas de 25/50/70/100%— la regla estaba mal planteada:
        // al tab activo lo identifica su pastilla (fondo + sombra), no su
        // color de texto, y limitar la tinta solo conseguía que el hover
        // fuese invisible («no se nota», reportado). Lo que de verdad hay que
        // impedir es que el hover copie fondo o elevación.
        const hov = regla(css, '.zone:not([aria-selected="true"]):hover');
        const act = regla(css, '.zone[aria-selected="true"]');
        expect(act, 'el activo debe seguir teniendo su pastilla').toMatch(/background:\s*var\(--bg-card\)/);
        expect(hov, 'el hover no debe adoptar el fondo del seleccionado').not.toMatch(/background/);
        expect(hov, 'ni su elevación').not.toMatch(/box-shadow/);
    });

    it('el tab activo NO gana sombra bajo el cursor (ya estás ahí)', () => {
        // Tenía sm→md. Es «sombreado de caja», justo lo que el dueño pidió
        // quitar; y sobre el tab ya seleccionado el hover no lleva a ninguna
        // parte, así que no tiene nada que anunciar.
        expect(regla(css, '.zone[aria-selected="true"]:hover'),
            'el tab seleccionado no debe cambiar al pasar el mouse').toBe('');
    });

    it('la elevación del activo sale de los tokens, no de un rgba fijo', () => {
        const act = regla(css, '.zone[aria-selected="true"]');
        expect(act, 'rgba(0,0,0,.3) es 6× más duro que la sombra del sistema en tema claro')
            .not.toMatch(/rgba?\(/);
        expect(act).toMatch(/box-shadow:\s*var\(--shadow-sm\)/);
    });

    it('nada de desplazamiento (las cinco decisiones del dueño siguen en pie)', () => {
        for (const sel of ['.zone:not([aria-selected="true"]):hover', '.zone[aria-selected="true"]:hover']) {
            expect(regla(css, sel)).not.toMatch(/transform:\s*(?!none)/);
        }
    });
});
