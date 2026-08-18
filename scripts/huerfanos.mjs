/**
 * [P2-CODIGO-MUERTO · 2026-08-18] Detecta módulos que nadie alcanza desde producción.
 *
 * POR QUÉ. `ChatWidget.jsx` sobrevivió 829 líneas sin que nada de producción lo
 * importara. No estaba escondido: lo mantenían VIVO sus propios tests. Esa es la
 * forma en que el código muerto se vuelve invisible — `grep ChatWidget` devolvía
 * catorce ficheros y parecía muy usado; trece eran tests, comentarios, o el
 * `HelpChatWidget`, que contiene la subcadena y es otro componente.
 *
 * Por eso este analizador recorre el grafo desde las ENTRADAS REALES y no
 * cuenta menciones. Un fichero al que solo llegan los tests no está usado: está
 * siendo sostenido por ellos.
 *
 * Qué cuenta como entrada, y por qué cada una:
 *   · `index.html` -> `src/main.jsx`: el arranque de la aplicación.
 *   · `src/custom-sw.js`: el service worker, que Vite compila aparte y por tanto
 *     no cuelga del grafo del `main`.
 *   · Los `import()` dinámicos: media aplicación se carga así (rutas perezosas),
 *     y un analizador que solo mire los `import` estáticos declararía huérfano
 *     medio dashboard.
 *
 *   node scripts/huerfanos.mjs           # informa
 *   node scripts/huerfanos.mjs --gate    # falla si hay huérfanos no declarados
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(AQUI, '..', 'src');

/**
 * Huérfanos ACEPTADOS, con su razón. Vacío a propósito: si algo entra aquí, que
 * sea con una explicación de por qué se conserva algo que nadie importa.
 */
const ACEPTADOS = new Set([
    // Infraestructura de test: la carga vitest, no la aplicacion.
    'setupTests.js',
    // Declaraciones de tipos: las consume `tsc`, no el runtime. No son modulos.
    'types/api.d.ts',
    'types/plan.d.ts',
    'types/shopping.d.ts',
]);

const ENTRADAS = ['main.jsx', 'custom-sw.js'];
const EXT = ['.js', '.jsx', '.ts', '.tsx'];

function todosLosFicheros(dir, acc = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === '__tests__' || e.name === 'node_modules') continue;
            todosLosFicheros(p, acc);
        } else if (EXT.includes(path.extname(e.name)) && !e.name.endsWith('.d.ts')) {
            acc.push(p);
        }
    }
    return acc;
}

/** Resuelve un especificador relativo a un fichero real de `src`. */
function resolver(desde, spec) {
    if (!spec.startsWith('.')) return null;
    const base = path.resolve(path.dirname(desde), spec);
    const candidatos = [
        base,
        ...EXT.map((e) => base + e),
        ...EXT.map((e) => path.join(base, 'index' + e)),
    ];
    for (const c of candidatos) {
        if (existsSync(c) && statSync(c).isFile()) return c;
    }
    return null;
}

/**
 * DOS patrones, no una alternancia. El primer intento los unia en una sola
 * expresion con `(?:import|export)[\s\S]*?from` y esa parte, al cruzar lineas,
 * se TRAGABA los `import()` dinamicos que hubiera por medio: declaraba huerfanos
 * a `HelpChatWidget`, `PaymentModal` y `PendingPipelineRecovery`, que se cargan
 * con `lazy(() => import('./X'))` y estan vivisimos —comprobado, HelpChatWidget
 * aparece en el bundle desplegado—.
 *
 * Un detector de codigo muerto que senala codigo vivo es peor que no tenerlo:
 * la primera vez discutes el falso positivo, la segunda dejas de mirarlo. Por eso
 * se SOBREAPROXIMA a favor de «vivo»: se cogen TODOS los `from '...'` y TODOS los
 * `import('...')`, aunque alguno venga de un comentario. Contar de mas deja
 * codigo muerto sin detectar; contar de menos borra codigo que se usa.
 */
const RE_FROM = /from\s*['"]([^'"]+)['"]/g;
const RE_DINAMICO = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

const alcanzables = new Set();
const cola = ENTRADAS.map((e) => path.join(SRC, e)).filter(existsSync);
cola.forEach((f) => alcanzables.add(f));

while (cola.length) {
    const f = cola.pop();
    let txt;
    try { txt = readFileSync(f, 'utf8'); } catch { continue; }
    const specs = [
        ...[...txt.matchAll(RE_FROM)].map((m) => m[1]),
        ...[...txt.matchAll(RE_DINAMICO)].map((m) => m[1]),
    ];
    for (const spec of specs) {
        if (!spec) continue;
        const destino = resolver(f, spec);
        if (destino && !alcanzables.has(destino)) {
            alcanzables.add(destino);
            cola.push(destino);
        }
    }
}

const todos = todosLosFicheros(SRC);
const huerfanos = todos
    .filter((f) => !alcanzables.has(f))
    .map((f) => path.relative(SRC, f).replace(/\\/g, '/'))
    .filter((f) => !ACEPTADOS.has(f))
    .sort();

// El conteo cruza los DOS conjuntos a proposito. `alcanzables` incluye tambien
// los `.json` de i18n y los `.css` de modulo —son dependencias reales— y por eso
// la primera version imprimia «288 de 234»: un numero imposible, que es
// exactamente lo que descalifica a una herramienta a la primera lectura.
const modulosVivos = todos.filter((f) => alcanzables.has(f)).length;
console.log(`[huerfanos] ${modulosVivos} de ${todos.length} modulos de src/ alcanzables desde ${ENTRADAS.join(' + ')}.`);
if (huerfanos.length) {
    console.log('[huerfanos] nadie los importa desde producción:');
    for (const h of huerfanos) console.log('  - ' + h);
    console.log(
        '\nSi alguno es codigo vivo que este analizador no ve (una entrada nueva de\n' +
        'Vite, un worker), anadela a ENTRADAS. Si de verdad no lo usa nadie, borralo:\n' +
        'un modulo que solo mantienen vivo sus tests no esta cubierto, esta sostenido.'
    );
}

if (process.argv.includes('--gate') && huerfanos.length) process.exit(1);
