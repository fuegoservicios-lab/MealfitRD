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
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// [P1-I18N-GATE-CIEGO-SIN-T · 2026-08-21] El recorrido del grafo se movió a
// `lib/grafo-modulos.mjs` sin cambiarlo, porque el detector de i18n necesita el
// MISMO para saber qué ficheros sólo se alcanzan a través del landing. Copiar el
// resolvedor habría creado otra pareja de tablas que drifta.
import { todosLosFicheros, alcanzablesDesde } from './lib/grafo-modulos.mjs';
import { ENTRADAS } from './entradas.mjs';

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


const alcanzables = alcanzablesDesde(ENTRADAS.map((e) => path.join(SRC, e)).filter(existsSync));

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
