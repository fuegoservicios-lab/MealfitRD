/**
 * [P2-FOOTER-COLUMN-DEDUP · 2026-08-14] Las cuatro columnas del pie estaban
 * escritas DOS VECES.
 *
 * `Footer.jsx` repetía cuatro veces el patrón `{isPaper ? (<details>…</details>)
 * : (<>…</>)}` con los hijos **idénticos carácter a carácter**: 16 `<Link>` más
 * el bloque de soporte, duplicados a lo largo de ~115 líneas. La única diferencia
 * entre las ramas es el ENVOLTORIO (un `<details>` plegable bajo 640 px contra un
 * `<h4>` plano), nunca el contenido.
 *
 * Y no había ni un test que montara el Footer — un componente que renderizan las
 * 19 rutas públicas Y la app. El precedente de deriva está escrito en el propio
 * repo (`legalRoutes.js`: «No hacerlo fue exactamente el bug que dejó las 4
 * políticas nuevas con el header recortado»).
 *
 * ⚠️ POR QUÉ EL COMPONENTE EXTRAÍDO ELIGE EL ELEMENTO Y NO SÓLO EL ESTADO: el CSS
 * fuerza el `<details>` abierto y no-interactivo por encima de 640 px, y esa
 * palanca se midió para bajar de 812 px de alto en móvil. Hay que conservar
 * exactamente `summary` + `div.colBody`, no «un div que a veces colapsa».
 *
 * El guard que hace irreversible el arreglo es el primero: el CONJUNTO DE DESTINOS
 * tiene que ser el mismo en los dos modos. Es la aserción que la duplicación no
 * podía dar.
 */
import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from '../components/layout/Footer';

const enRuta = (ruta) =>
    render(
        <MemoryRouter initialEntries={[ruta]}>
            <Footer />
        </MemoryRouter>,
    );

/** Todos los destinos del pie, normalizados y ordenados. */
const destinos = (contenedor) =>
    [...within(contenedor).getAllByRole('link')]
        .map((a) => a.getAttribute('href'))
        .filter(Boolean)
        .sort();

describe('[P2-FOOTER-COLUMN-DEDUP] el pie ofrece lo mismo en ambos modos', () => {
    it('la superficie papel y la app enlazan EXACTAMENTE los mismos destinos', () => {
        // `/` es papel (plegable); `/dashboard` no lo es (columnas planas).
        const papel = enRuta('/');
        const dePapel = destinos(papel.container);
        papel.unmount();

        const app = enRuta('/dashboard');
        const deApp = destinos(app.container);

        expect(dePapel).toEqual(deApp);
    });

    it('enlaza las políticas legales completas, no un subconjunto', () => {
        const { container } = enRuta('/');
        const hrefs = destinos(container);
        // [P1-LEGAL-UNA-SOLA-COPIA · 2026-08-19] Ahora salen al APEX, no a una ruta
        // interna. La intención de este caso no cambia —que estén las ocho y no un
        // subconjunto—; cambia dónde viven. Se compara por el final de la URL para
        // no atarlo al dominio, que es lo único accesorio aquí.
        //
        // Por qué dejaron de ser rutas internas: un <Link> lo resuelve React Router
        // en el cliente, así que el 301 de nginx nunca se ejecuta y el usuario
        // seguía viendo la copia interna —con el diseño y el nav anteriores—.
        for (const ruta of ['/terms', '/privacy', '/medical', '/refunds', '/ai-policy',
            '/acceptable-use', '/data-protection', '/responsible-disclosure']) {
            expect(
                hrefs.some((h) => h.endsWith(ruta)),
                `el pie no enlaza ${ruta} por ninguna vía`,
            ).toBe(true);
        }
    });
});

describe('[P2-FOOTER-COLUMN-DEDUP] el envoltorio sigue siendo el correcto', () => {
    it('en superficie papel las columnas son <details> plegables', () => {
        // No es cosmético: el CSS las fuerza abiertas por encima de 640 px y la
        // palanca se midió contra 812 px de alto en móvil.
        const { container } = enRuta('/');
        expect(container.querySelectorAll('details').length).toBeGreaterThanOrEqual(4);
        expect(container.querySelectorAll('summary').length).toBeGreaterThanOrEqual(4);
    });

    it('fuera de la superficie papel NO hay plegables', () => {
        const { container } = enRuta('/dashboard');
        expect(container.querySelectorAll('details').length).toBe(0);
    });

    it('cada columna plegable conserva su cuerpo propio', () => {
        // `summary` + `div.colBody` es la estructura que el CSS de papel espera;
        // un `<details>` sin ese div rompe el forzado-abierto de escritorio.
        const { container } = enRuta('/');
        for (const d of container.querySelectorAll('details')) {
            expect(d.querySelector('summary')).toBeTruthy();
            expect(d.children.length).toBe(2);
        }
    });
});
