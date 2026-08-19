/**
 * [P1-LEGAL-UNA-SOLA-COPIA · 2026-08-19] Los legales del pie salen al apex.
 *
 * POR QUÉ NO BASTA LA REDIRECCIÓN. nginx devuelve un 301 de
 * `app.bioboros.com/privacy` a `bioboros.com/privacy`, y eso cubre a quien teclea
 * la URL. Pero un `<Link>` lo resuelve React Router EN EL CLIENTE: no hay
 * petición, no hay 301, y el usuario sigue viendo la copia interna.
 *
 * O sea que el 301 solo cubre el camino menos usado y se le escapa el más usado
 * —pinchar en el pie—. Media solución habría dejado el síntoma exactamente donde
 * se ve.
 *
 * Y lo que quedaba detrás no era estético: esa copia arrastraba el nav anterior,
 * con enlaces a `/funciones`, `/precision` e `/investigacion` que en el apex son
 * 301, 301 y 404 —medido el 2026-08-19—. El texto también había divergido: ese
 * mismo día la afirmación falsa de que protegemos una contraseña (no existe: se
 * entra por código al correo o con Google) vivía en TRES sitios a la vez.
 *
 * Este test existe porque el cambio es fácil de deshacer sin querer: un `<a>`
 * entre `<Link>` parece una inconsistencia que alguien "arregla".
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FOOTER = path.join(process.cwd(), 'src', 'components', 'layout', 'Footer.jsx');

/** Las ocho que sirve el apex y ya no debe servir la app. */
const LEGALES = [
    'terms', 'acceptable-use', 'refunds', 'ai-policy',
    'medical', 'privacy', 'data-protection', 'responsible-disclosure',
];

describe('P1-LEGAL-UNA-SOLA-COPIA · el pie', () => {
    const src = fs.readFileSync(FOOTER, 'utf8');

    it.each(LEGALES)('/%s no vuelve a ser un <Link> de React Router', (ruta) => {
        expect(
            src.includes(`<Link to="/${ruta}"`),
            `Footer.jsx enlaza /${ruta} con <Link>. React Router lo resuelve en el `
            + `cliente, así que el 301 de nginx nunca se ejecuta y el usuario ve la `
            + `copia interna —con el diseño y el nav anteriores—. Usa <EnlaceLegal>, `
            + `que sale al apex donde vive la única copia.`,
        ).toBe(false);
    });

    // Sin esto, borrar los ocho enlaces dejaría el test en verde: pasaría por «no
    // usa <Link>» simplemente por no enlazar nada.
    it('sigue habiendo ocho enlaces legales, y salen al apex', () => {
        const salidas = [...src.matchAll(/<EnlaceLegal a="\/([a-z-]+)"/g)].map((m) => m[1]);
        expect(salidas.sort()).toEqual([...LEGALES].sort());
        // Y por el helper COMPARTIDO, no por una constante propia. La primera
        // version de este fichero fijaba el dominio a pelo en Footer.jsx, sin ver
        // que `Login.jsx` ya tenia el mismo helper desde junio. Dos formas de
        // decir «la URL de la pagina publica» es como se empieza a no saber cual
        // usar; y la que ya existia es mejor, porque deriva el host del actual en
        // vez de fijarlo y en dev cae a la ruta interna.
        expect(src).toContain("from '../../config/site'");
        expect(src).toContain('apexUrl(a)');
    });
});
