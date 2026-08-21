/**
 * [P1-I18N-GATE-CIEGO-SIN-T · 2026-08-21] Qué ficheros de `src/` están DENTRO del
 * alcance declarado del sistema de idiomas.
 *
 * ── El problema ──────────────────────────────────────────────────────────────
 * El alcance de `P1-I18N-DASHBOARD` es la interfaz del DASHBOARD. Fuera quedan,
 * por decisión escrita:
 *
 *   · El landing (14 páginas de marketing). Traducirlo exige URLs por idioma y
 *     `hreflang`; hacerlo a medias es peor que no hacerlo.
 *   · Los legales (601 cadenas). Traducir un contrato genera obligaciones en cada
 *     jurisdicción: es una decisión legal, no de producto.
 *
 * Medido: de 1.149 literales en español que el detector encuentra en `src/`, 509
 * están en un solo fichero de legales y la mayoría del resto en el landing. Sin
 * separar el alcance, el trinquete nace con un 80 % de ruido y no significa nada.
 *
 * ── Por qué se DERIVA y no se lista ──────────────────────────────────────────
 * Una lista de ficheros de marketing escrita a mano es la enésima copia del mismo
 * dato: envejece en cuanto alguien añade una página, y nadie se entera. Aquí se
 * calcula, y de la única fuente que ya existe:
 *
 *   1. `src/utils/paperSurface.js` es el SSOT de QUÉ RUTAS son marketing. Ya lo
 *      usan el boot de `index.html`, el tema «papel» y la autodetección de idioma.
 *   2. `src/App.jsx` mapea ruta → componente → fichero (`lazy(() => import(…))`).
 *   3. El grafo de imports (`lib/grafo-modulos.mjs`, el mismo que usa el detector
 *      de código muerto) dice qué cuelga de cada página.
 *
 * ── La regla, y su matiz ─────────────────────────────────────────────────────
 * Fuera de alcance = **lo que SÓLO se alcanza atravesando una página de
 * marketing**. Se recorre el grafo desde las entradas reales CORTANDO en las
 * páginas de marketing; lo que queda sin visitar es suyo en exclusiva.
 *
 * El matiz es lo que hace correcta la regla: un componente compartido entre el
 * landing y el dashboard queda DENTRO. Y debe quedar dentro — el usuario lo ve
 * logueado, así que hay que traducirlo, aunque el landing también lo pinte. Una
 * lista por directorio (`components/home/**`) no sabría distinguirlo.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { todosLosFicheros, alcanzablesDesde, resolver } from './lib/grafo-modulos.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(AQUI, '..', 'src');
const APP = path.join(SRC, 'App.jsx');
const PAPER = path.join(SRC, 'utils', 'paperSurface.js');

const ENTRADAS = ['main.jsx', 'custom-sw.js'];

/** Las rutas de marketing, leídas del SSOT: exactas y por prefijo. */
export function rutasDeMarketing() {
    if (!existsSync(PAPER)) return { exactas: [], prefijos: [] };
    const txt = readFileSync(PAPER, 'utf8');
    const lista = (nombre) => {
        const bloque = txt.match(new RegExp(nombre + '\\s*=\\s*\\[([\\s\\S]*?)\\]'));
        return bloque ? [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
    };
    return {
        exactas: lista('PAPER_SURFACE_ROUTES'),
        prefijos: lista('PAPER_SURFACE_PREFIXES'),
    };
}

function esRutaDeMarketing(ruta, { exactas, prefijos }) {
    return exactas.includes(ruta) || prefijos.some((p) => ruta.startsWith(p));
}

/**
 * Los ficheros de página que sirven una ruta de marketing.
 *
 * Se resuelve en dos saltos porque así está escrito `App.jsx`: un `lazy()` por
 * componente arriba y un `<Route>` por ruta abajo. Las páginas legales comparten
 * fichero (`LegalPages.jsx` exporta varias), y eso sale solo: todas resuelven al
 * mismo destino.
 */
export function paginasDeMarketing() {
    if (!existsSync(APP)) return new Set();
    const app = readFileSync(APP, 'utf8');

    const porComponente = new Map();
    const LAZY = /const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const m of app.matchAll(LAZY)) {
        const destino = resolver(APP, m[2]);
        if (destino) porComponente.set(m[1], destino);
    }
    // Import estático de una página (no todas son perezosas).
    const IMPORT = /import\s+(\w+)\s+from\s*['"](\.[^'"]+)['"]/g;
    for (const m of app.matchAll(IMPORT)) {
        const destino = resolver(APP, m[2]);
        if (destino && !porComponente.has(m[1])) porComponente.set(m[1], destino);
    }

    const rutas = rutasDeMarketing();
    const paginas = new Set();

    // El corte tiene que ser la PÁGINA, no el envoltorio. Las rutas se escriben
    // `element={<Layout><PricingPage /></Layout>}`, así que quedarse con el primer
    // componente corta en `Layout` — chrome COMPARTIDO con el dashboard— y se
    // lleva por delante `Header` y `Footer`, que sí hay que traducir. Medido: con
    // el primer componente salían «2 páginas» y Header/Footer/Layout marcados
    // fuera de alcance, exactamente al revés de lo correcto.
    //
    // Se recogen TODOS los componentes del `element` y se conservan sólo los que
    // resuelven a un fichero bajo `pages/`: la página es la hoja del envoltorio.
    const ROUTE = /<Route\s+path=\{?["']([^"']+)["']\}?\s*element=\{([\s\S]*?)\}\s*\/>/g;
    for (const m of app.matchAll(ROUTE)) {
        if (!esRutaDeMarketing(m[1], rutas)) continue;
        for (const c of m[2].matchAll(/<(\w+)/g)) {
            const fichero = porComponente.get(c[1]);
            if (!fichero) continue;
            const rel = path.relative(SRC, fichero).split(path.sep).join('/');
            if (rel.startsWith('pages/')) paginas.add(fichero);
        }
    }
    return paginas;
}

/**
 * @returns {{dentro: string[], fuera: string[]}} rutas relativas a `src/`, con `/`.
 */
export function clasificarAlcance() {
    const marketing = paginasDeMarketing();
    const sinMarketing = alcanzablesDesde(
        ENTRADAS.map((e) => path.join(SRC, e)).filter(existsSync),
        { cortarEn: marketing },
    );

    const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
    const dentro = [];
    const fuera = [];
    for (const f of todosLosFicheros(SRC)) {
        // El propio corte queda en `sinMarketing` (se marca al llegar, no se
        // atraviesa), así que las páginas de marketing se descuentan aparte.
        const esMarketing = marketing.has(f) || !sinMarketing.has(f);
        (esMarketing ? fuera : dentro).push(rel(f));
    }
    dentro.sort();
    fuera.sort();
    return { dentro, fuera };
}

export { SRC };
