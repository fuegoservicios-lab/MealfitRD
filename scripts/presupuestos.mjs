/**
 * [P1-PRESUPUESTOS · 2026-08-18] Techo al peso de la carga inicial.
 *
 * POR QUÉ. Había dos guards de tamaño —el de la página del agente y el del
 * precache del service worker— y ninguno vigilaba lo primero que descarga
 * CUALQUIER visitante: el entry y lo que el HTML declara como imprescindible.
 * El peso del arranque es la magnitud que empeora sin que nadie lo decida: cada
 * import nuevo en un fichero que ya estaba en el camino crítico entra sin
 * revisión, porque no crea ningún fichero nuevo que llame la atención en el
 * `git diff`. Esta tanda ya vio un caso —`@sentry` entrando al entry por cinco
 * puertas distintas— y costó una jornada encontrarlo. Un número con techo lo
 * habría dicho el día que pasó.
 *
 * QUÉ SE MIDE, y por qué esto y no «el tamaño del bundle». El total de `dist/`
 * no significa nada para el usuario: la mayor parte son trozos perezosos que
 * quizá no descargue nunca. Lo que retrasa el primer pintado es exactamente lo
 * que `index.html` declara: el módulo de entrada, sus `modulepreload` —que Vite
 * emite justo para las dependencias estáticas del entry— y las hojas de estilo.
 * Eso es lo que se suma aquí, comprimido con gzip, que es como viaja.
 *
 * LO QUE NO ES. No es una medida de rendimiento percibido. Un presupuesto de
 * bytes no dice nada del LCP real de un usuario en un móvil de gama media con
 * una conexión mala; para eso hace falta medir en el campo. Es una cota
 * superior sobre la única variable que sí controla el repositorio.
 *
 *   node scripts/presupuestos.mjs           # informa
 *   node scripts/presupuestos.mjs --gate    # falla si algo excede su techo
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(AQUI, '..', 'dist');

/**
 * Techos en kB gzip. Fijados sobre la medición del 2026-08-18 con un margen
 * deliberadamente CORTO: un margen ancho es un permiso para engordar. Subirlos
 * exige escribir aquí qué se ganó a cambio — que es justo la conversación que
 * un presupuesto existe para provocar.
 */
const TECHOS = {
    /* El módulo de entrada MÁS sus `modulepreload`. Medido hoy: 137,2 —entry
       55,0 + `vendor-react` + `vendor-ui`—. Ojo con confundir este número con
       los 53,6 kB gz que dejó P1-APEX-ENTRY-DIET: aquel era el entry SOLO. Los
       preloads no son opcionales para el navegador, van a prioridad alta en la
       misma tanda, así que un presupuesto de arranque que los ignore mide media
       verdad. */
    /* [P2-ARRANQUE-148 · 2026-09-04] 140 → 148. Medido hoy: 146,3 (entry 63,7 + preloads). Lo que
       ENTRÓ en el camino crítico después de fijar el 140 (fecha de creación de cada módulo del
       entry, por git): el motor i18n de 5 idiomas (08-15), el gate nativo con `@capacitor/core`
       (08-21, ~8 kB sin comprimir), la sesión first-party de iOS (08-21) y el manejo del teclado
       (08-23). Son arranque a propósito —deciden idioma, plataforma y sesión antes de pintar—, no
       grasa: el techo viejo medía un producto sin app nativa ni idiomas. Margen corto otra vez
       (1,7 kB): el siguiente que quiera entrar tiene que escribir aquí qué se gana. */
    arranqueJS: 148,
    // Las hojas de estilo que bloquean el pintado. Medido: 10,2.
    arranqueCSS: 12,
    /* El trozo perezoso más gordo. Medido: 274,6 —`html2pdf`—, y conviene saber
       lo que es antes de alarmarse: NO está en el camino crítico, se descarga
       solo cuando alguien exporta su plan a PDF. El techo está puesto donde
       está para CONGELARLO, no para bendecirlo: que 274 kB sean aceptables para
       una acción deliberada y ocasional es una decisión distinta de dejar que
       crezca hasta 400 sin que nadie se entere. */
    trozoMayor: 280,
};

if (!existsSync(DIST)) {
    console.error('[presupuestos] no hay dist/. Ejecuta `npm run build` antes.');
    process.exit(2);
}

const gz = (rel) => {
    const abs = path.join(DIST, rel.replace(/^\//, ''));
    if (!existsSync(abs) || !statSync(abs).isFile()) return null;
    return gzipSync(readFileSync(abs)).length / 1024;
};

const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');

const entrada = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]);
const precarga = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
const estilos = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);

const sumar = (lista) => lista.reduce((a, r) => a + (gz(r) || 0), 0);

const arranqueJS = sumar([...entrada, ...precarga]);
const arranqueCSS = sumar(estilos);

// El trozo perezoso más grande de `assets/`, excluyendo lo que ya se contó.
const yaContado = new Set([...entrada, ...precarga, ...estilos].map((r) => path.basename(r)));
let mayor = { nombre: '(ninguno)', kb: 0 };
const dirAssets = path.join(DIST, 'assets');
if (existsSync(dirAssets)) {
    for (const f of readdirSync(dirAssets)) {
        if (!f.endsWith('.js') || yaContado.has(f)) continue;
        const kb = gzipSync(readFileSync(path.join(dirAssets, f))).length / 1024;
        if (kb > mayor.kb) mayor = { nombre: f, kb };
    }
}

const filas = [
    ['arranqueJS', arranqueJS, TECHOS.arranqueJS, `${entrada.length} entry + ${precarga.length} modulepreload`],
    ['arranqueCSS', arranqueCSS, TECHOS.arranqueCSS, `${estilos.length} hoja(s)`],
    ['trozoMayor', mayor.kb, TECHOS.trozoMayor, mayor.nombre],
];

console.log('[presupuestos] peso de la carga inicial (kB gzip):');
const excesos = [];
for (const [nombre, valor, techo, detalle] of filas) {
    const marca = valor > techo ? 'X' : 'ok';
    console.log(`  ${marca}  ${nombre.padEnd(12)} ${valor.toFixed(1).padStart(7)} / ${String(techo).padStart(4)}   ${detalle}`);
    if (valor > techo) excesos.push({ nombre, valor, techo });
}

if (excesos.length) {
    console.log('\n[presupuestos] por encima del techo:');
    for (const e of excesos) {
        console.log(`  · ${e.nombre}: ${e.valor.toFixed(1)} kB gz supera ${e.techo} kB en ${(e.valor - e.techo).toFixed(1)}.`);
    }
    console.log(
        '\n  Antes de subir el techo: mira QUE entro. La causa casi siempre es un import\n'
        + '  nuevo en un fichero que ya estaba en el camino critico, y esos no crean\n'
        + '  ficheros nuevos —por eso no se ven en el diff—. `npx vite-bundle-visualizer`\n'
        + '  o comparar `dist/assets` contra la release anterior lo senala en un minuto.'
    );
    if (process.argv.includes('--gate')) process.exit(1);
} else {
    const holgura = filas.map(([n, v, t]) => `${n} ${(t - v).toFixed(1)}`).join(' · ');
    console.log(`\n[presupuestos] OK. Holgura: ${holgura} kB.`);
}
