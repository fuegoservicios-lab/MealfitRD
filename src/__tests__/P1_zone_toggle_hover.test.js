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

    it('el tab inactivo se sombrea al pasar el mouse', () => {
        const hov = regla(css, '.zone:not([aria-selected="true"]):hover');
        expect(hov, 'el tab inactivo no declara :hover — el toggle no acusa el mouse').not.toBe('');
        expect(hov, 'el velo debe nacer de la tinta del tema (oscurece en claro, aclara en oscuro)')
            .toMatch(/background:\s*color-mix\(in srgb,\s*var\(--text-muted\)/);
        expect(hov, 'y el texto sube a la tinta principal').toMatch(/color:\s*var\(--text-main\)/);
    });

    it('el tab inactivo NO se eleva: elevarse distingue al activo', () => {
        const hov = regla(css, '.zone:not([aria-selected="true"]):hover');
        expect(hov, 'si el inactivo también se eleva, deja de leerse cuál está seleccionado')
            .not.toMatch(/box-shadow/);
    });

    it('el tab activo pesa un punto más bajo el cursor', () => {
        expect(regla(css, '.zone[aria-selected="true"]:hover'))
            .toMatch(/box-shadow:\s*var\(--shadow-md\)/);
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
