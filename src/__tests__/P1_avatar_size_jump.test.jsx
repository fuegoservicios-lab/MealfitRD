// [P1-AVATAR-SIZE-JUMP · 2026-08-10] El avatar del perfil CRECÍA al primer cambio,
// y solo en el teléfono.
//
// Las dos ramas del ternario son el mismo avatar en la misma posición, pero cada una
// traía su caja por su cuenta:
//   · iniciales → `styles.avatar`, que es responsive: 88px, 68 a ≤768 y 56 a ≤480.
//   · SVG       → `size={88}` clavado en el JSX.
// En un iPhone el primer clic saltaba de 56 a 88 — +32px de golpe. En escritorio los
// dos valían 88, y por eso allí no se veía nada: el dueño sospechó justo eso.
//
// LA LECCIÓN: cuando dos ramas de un condicional pintan LO MISMO en el mismo hueco,
// su caja tiene que salir de un solo sitio. Dos fuentes para una misma medida no
// «coinciden»: coinciden hasta que una de las dos cambia, y aquí la que cambiaba era
// la responsive.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { MinimalAvatar, MINIMAL_AVATARS } from '../components/avatars/minimalAvatars';

const SETTINGS = fs.readFileSync(
    path.resolve(__dirname, '..', 'pages', 'Settings.jsx'),
    'utf-8',
);
const CSS = fs.readFileSync(
    path.resolve(__dirname, '..', 'pages', 'Settings.module.css'),
    'utf-8',
);

// El bloque del ternario que elige entre SVG e iniciales. La ventana se corta en el
// cierre real (`</button>`) y no a N caracteres: los comentarios que explican un
// defecto crecen, y una ventana fija acaba quedándose corta justo por documentar
// bien — el guard entonces mide el comentario en vez del código.
const _bloqueAvatar = () => {
    const i = SETTINGS.indexOf('{avatarId ? (');
    expect(i, 'desapareció el ternario del avatar del perfil').toBeGreaterThan(0);
    const j = SETTINGS.indexOf('</button>', i);
    expect(j, 'no se encontró el cierre del botón del avatar').toBeGreaterThan(i);
    return SETTINGS.slice(i, j);
};

describe('[P1-AVATAR-SIZE-JUMP] las dos caras del avatar comparten caja', () => {
    it('el SVG toma su tamaño de la MISMA clase que las iniciales', () => {
        const bloque = _bloqueAvatar();
        expect(bloque).toMatch(/<MinimalAvatar[\s\S]{0,400}className=\{styles\.avatar\}/);
        // LAS DOS ramas la usan. Se cuenta en vez de medir distancias en el texto:
        // una aserción que depende de la sangría se rompe al reformatear, y entonces
        // el guard habla del formato en vez del defecto.
        const usos = (bloque.match(/className=\{styles\.avatar\}/g) || []).length;
        expect(usos, 'ambas ramas del ternario deben tomar la caja de la misma clase').toBe(2);
    });

    it('el tamaño no se vuelve a clavar en el JSX', () => {
        const bloque = _bloqueAvatar();
        expect(
            /<MinimalAvatar[\s\S]{0,400}size=\{\d+\}/.test(bloque),
            'un size fijo aquí ignora los puntos de quiebre de .avatar y reabre el salto',
        ).toBe(false);
    });

    it('la clase compartida sigue siendo responsive (si deja de serlo, este guard sobra)', () => {
        // Ancla el porqué: el defecto solo existía porque .avatar cambia de tamaño.
        // Si alguien la vuelve fija, que sea una decisión consciente y no un silencio.
        const tamanos = [...CSS.matchAll(/\.avatar\s*\{[^}]*?width:\s*(\d+)px/g)].map((m) => m[1]);
        expect(tamanos.length, 'no se encontraron reglas de tamaño de .avatar').toBeGreaterThanOrEqual(2);
        expect(new Set(tamanos).size, 'todas las reglas dan el mismo tamaño').toBeGreaterThan(1);
    });

    it('MinimalAvatar deja que una clase gobierne su caja', () => {
        // Contrato del componente: el `className` llega al <svg>, así que el CSS puede
        // ganarle a los atributos width/height. Si dejara de propagarlo, el arreglo
        // de arriba quedaría inerte sin que nada avisara.
        const { container } = render(
            <MinimalAvatar id={MINIMAL_AVATARS[0].id} className="caja-de-prueba" />,
        );
        const svg = container.querySelector('svg');
        expect(svg).toBeTruthy();
        expect(svg.getAttribute('class')).toContain('caja-de-prueba');
    });
});
