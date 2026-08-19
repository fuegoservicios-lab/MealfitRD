/**
 * [P1-LEGAL-UNA-SOLA-COPIA · 2026-08-19] El service worker no atiende las públicas.
 *
 * POR QUÉ. nginx redirige con 301 las 16 rutas públicas de app.bioboros.com al
 * apex. Pero un service worker que atiende la navegación hace el `fetch` ÉL
 * MISMO: el 301 lo consume el worker y el navegador se queda en la URL de la app.
 *
 * Medido el 2026-08-19 en un navegador real: con el worker registrado, ir a
 * `app.bioboros.com/privacy` NO se movía de ahí y renderizaba la copia interna
 * —se veía por sus propios chunks, `/assets/LegalPages-*.css`—. Tras
 * desregistrarlo y limpiar Cache Storage, la misma navegación aterrizaba en
 * `bioboros.com/privacy` a la primera.
 *
 * O sea: la redirección funcionaba para el visitante NUEVO y era inerte para el
 * que ya tiene la aplicación instalada, que es justo la población que importa.
 * Es la tercera capa del mismo problema, y cada una tapaba a la siguiente:
 * nginx, luego el `<Link>` de React Router, y por último el worker.
 *
 * Este test es barato y ancla la lista: si alguien añade una página pública al
 * apex y no la mete aquí, la app volverá a servir su propia copia a los usuarios
 * instalados, en silencio.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SW = path.join(process.cwd(), 'src', 'custom-sw.js');

/** Las mismas 15 que redirige nginx (novedades cubre su subruta). */
const PUBLICAS = [
    'about', 'acceptable-use', 'ai-policy', 'como-funciona', 'data-protection',
    'medical', 'motor', 'novedades', 'precios', 'privacy', 'refunds',
    'research', 'responsible-disclosure', 'supermercado', 'terms',
];

/**
 * La LÍNEA del denylist, no el fichero entero.
 *
 * La primera versión buscaba cada ruta en todo el `custom-sw.js`, y la mutación
 * la desenmascaró: quitar `privacy` del denylist dejaba el test en VERDE, porque
 * la palabra seguía apareciendo... en el comentario que yo mismo escribí encima
 * explicando el arreglo.
 *
 * Es la tercera vez hoy que un comentario roba el ancla de un guard. Un guard que
 * casa contra prosa no vigila código.
 */
function lineaDelDenylist(src) {
    const linea = src.split('\n').find(
        (l) => l.includes('acceptable-use') && l.includes('denylist') === false && l.trim().startsWith('/^'),
    );
    if (!linea) throw new Error('no encuentro la línea de rutas públicas del denylist');
    return linea;
}

describe('P1-LEGAL-UNA-SOLA-COPIA · el service worker', () => {
    const src = fs.readFileSync(SW, 'utf8');
    const denylist = lineaDelDenylist(src);

    it.each(PUBLICAS)('deja /%s fuera de la navegación que atiende', (ruta) => {
        expect(
            denylist.includes(`${ruta}|`) || denylist.includes(`|${ruta}`),
            `/${ruta} no está en el denylist de la NavigationRoute. El worker `
            + `atenderá esa navegación, se comerá el 301 de nginx y el usuario `
            + `instalado seguirá viendo la copia interna de la app.`,
        ).toBe(true);
    });

    it('sigue excluyendo /api y conserva el fallback offline', () => {
        // Sin esto, alguien podría "simplificar" el denylist y romper dos cosas
        // distintas de una vez.
        // Se busca la subcadena literal y no una expresión regular: escribir una
        // regex que casa otra regex acumula tres niveles de escapado, y ya se pagó
        // hoy con un fichero que ni siquiera parseaba.
        expect(src).toContain('/^\\/api\\//');
        expect(src).toContain("matchPrecache('index.html')");
    });
});
