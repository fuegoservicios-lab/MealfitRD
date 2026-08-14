/**
 * [P2-LANDING-HEAD-CLIENT · 2026-08-14] Lo que se puede arreglar del `<head>` sin
 * tocar infraestructura.
 *
 * TRES DEFECTOS, todos en el cliente:
 *
 *  1. `og:title` NUNCA se reescribía por ruta. `RouteTitle` ya corregía
 *     description, canonical, `og:description` y `og:url` — pero no el título
 *     social, así que ni siquiera los clientes que SÍ ejecutan JS veían el título
 *     correcto al compartir. Era el único de los cinco que faltaba.
 *
 *  2. SOFT-404 QUE SE AUTODECLARA CANÓNICO. `https://bioboros.com/precios2`
 *     responde 200 (fallback SPA de nginx) con la description de la portada y un
 *     `<link rel="canonical" href=".../precios2">`: le está diciendo a Google que
 *     una URL inexistente es la versión canónica de sí misma.
 *
 *  3. ⚠️ Y LA TRAMPA DEL ARREGLO, que es la razón de que este fichero exista:
 *     poner `noindex` en el 404 sin retirarlo al salir deja marcada la SIGUIENTE
 *     página. Un visitante que aterriza en un enlace roto y luego navega a
 *     `/precios` dejaría `/precios` en `noindex` — habríamos cambiado un
 *     problema de rastreo por uno de desindexación, que es mucho peor. Sólo se
 *     ve escribiendo el caso de la navegación.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RouteTitle from '../components/layout/RouteTitle';

const enRuta = (ruta) =>
    render(
        <MemoryRouter initialEntries={[ruta]}>
            <RouteTitle />
        </MemoryRouter>,
    );

const meta = (selector) => document.head.querySelector(selector)?.getAttribute('content') ?? null;
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
// Cadena vacía y no `null` cuando la meta no existe: ausencia y presencia-sin-
// noindex son el MISMO resultado deseado («esta página es indexable»), y
// distinguirlas obligaría a cada aserción a contemplar dos formas de acertar.
const robots = () => meta('meta[name="robots"]') ?? '';

beforeEach(() => {
    cleanup();
    document.head.innerHTML = '';
    document.title = '';
});

describe('[P2-LANDING-HEAD-CLIENT] título social por ruta', () => {
    it('reescribe og:title y twitter:title en una ruta conocida', () => {
        enRuta('/precios');
        expect(meta('meta[property="og:title"]')).toContain('Planes y Precios');
        expect(meta('meta[name="twitter:title"]')).toContain('Planes y Precios');
    });

    it('sigue alineando description y canonical (lo que ya funcionaba)', () => {
        enRuta('/supermercado');
        expect(canonical()).toBe('https://bioboros.com/supermercado');
        expect(meta('meta[property="og:url"]')).toBe('https://bioboros.com/supermercado');
    });

    it('respeta las páginas que gestionan su propio título', () => {
        // /motor y las tres de detalle fijan su <title> ellas mismas (SELF_MANAGED);
        // el og:title sí debe venir de aquí, porque ellas no lo tocan.
        enRuta('/motor');
        expect(meta('meta[property="og:title"]')).toBeTruthy();
    });
});

describe('[P2-LANDING-HEAD-CLIENT] el soft-404 no se declara canónico', () => {
    it('no escribe canonical en una ruta que no existe', () => {
        enRuta('/precios2');
        expect(canonical()).toBeNull();
    });

    it('marca la ruta inexistente como noindex', () => {
        enRuta('/esto-no-existe');
        expect(robots()).toContain('noindex');
    });

    it('una ruta conocida NO lleva noindex', () => {
        enRuta('/precios');
        expect(robots()).not.toContain('noindex');
    });

    it('RETIRA el noindex al navegar del 404 a una página real', () => {
        // El caso que convierte un arreglo en un desastre: si el noindex se queda
        // pegado, el visitante que llegó por un enlace roto desindexa la página
        // buena a la que va después.
        const vista = render(
            <MemoryRouter initialEntries={['/no-existe', '/precios']} initialIndex={0}>
                <RouteTitle />
            </MemoryRouter>,
        );
        expect(robots()).toContain('noindex');
        vista.unmount();

        enRuta('/precios');
        expect(robots()).not.toContain('noindex');
    });

    it('no toca los artículos de novedades, que se autogestionan', () => {
        document.title = 'Título del artículo';
        enRuta('/novedades/base-datos-supermercados-rd');
        expect(document.title).toBe('Título del artículo');
        expect(robots()).not.toContain('noindex');
    });

    it('no marca noindex las rutas de la app (en el apex sólo redirigen)', () => {
        // `/dashboard` existe: que en el apex se vaya a app.* no la convierte en
        // inexistente. Marcarla noindex seria delatar un 404 que no hay.
        enRuta('/dashboard');
        expect(robots()).not.toContain('noindex');
    });
});
