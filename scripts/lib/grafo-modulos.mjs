/**
 * [P1-I18N-GATE-CIEGO-SIN-T · 2026-08-21] El grafo de imports de `src/`, extraído
 * de `huerfanos.mjs` para que lo compartan sus dos consumidores.
 *
 * POR QUÉ SE EXTRAE Y NO SE COPIA. `huerfanos.mjs` (P2-CODIGO-MUERTO) ya sabía
 * recorrer el grafo desde las entradas reales; el detector de i18n necesita
 * exactamente lo mismo para responder «¿este fichero sólo se alcanza a través del
 * landing?». Copiar el resolvedor habría creado la enésima pareja de tablas que
 * drifta —la lección de P1-DIET-CANON-SSOT, donde tres tablas de dieta escritas a
 * mano divergieron y a la del filtro se le olvidó 'vegetariana'—.
 *
 * La conducta es la de `huerfanos.mjs` sin un cambio: mismas extensiones, mismo
 * resolvedor, mismos dos patrones de import, misma sobreaproximación a favor de
 * «vivo». Si esto cambia, `node scripts/huerfanos.mjs --gate` lo dice.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const EXT = ['.js', '.jsx', '.ts', '.tsx'];

export function todosLosFicheros(dir, acc = []) {
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
export function resolver(desde, spec) {
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
 * DOS patrones, no una alternancia. Unirlos en `(?:import|export)[\s\S]*?from`
 * hacía que la parte que cruza líneas se TRAGARA los `import()` dinámicos de en
 * medio, y eso declaraba huérfanos a componentes vivísimos que se cargan con
 * `lazy(() => import('./X'))`.
 *
 * Se SOBREAPROXIMA a favor de «vivo»: se cogen TODOS los `from '...'` y TODOS los
 * `import('...')`, aunque alguno venga de un comentario. Contar de más deja
 * código muerto sin detectar; contar de menos borra código que se usa.
 */
export const RE_FROM = /from\s*['"]([^'"]+)['"]/g;
export const RE_DINAMICO = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Los especificadores que un fichero importa, estáticos y dinámicos. */
export function importsDe(fichero) {
    let txt;
    try { txt = readFileSync(fichero, 'utf8'); } catch { return []; }
    return [
        ...[...txt.matchAll(RE_FROM)].map((m) => m[1]),
        ...[...txt.matchAll(RE_DINAMICO)].map((m) => m[1]),
    ].filter(Boolean);
}

/**
 * Ficheros alcanzables desde `entradas` (rutas absolutas).
 *
 * `cortarEn` es un Set de rutas absolutas por las que NO se sigue avanzando: el
 * fichero se marca como alcanzado pero sus imports no se exploran. Es lo que
 * permite preguntar «¿qué queda si no atravieso el landing?» sin mantener una
 * segunda lista de ficheros de landing a mano.
 */
export function alcanzablesDesde(entradas, { cortarEn = new Set() } = {}) {
    const alcanzables = new Set();
    const cola = entradas.filter(existsSync);
    cola.forEach((f) => alcanzables.add(f));

    while (cola.length) {
        const f = cola.pop();
        if (cortarEn.has(f)) continue;
        for (const spec of importsDe(f)) {
            const destino = resolver(f, spec);
            if (destino && !alcanzables.has(destino)) {
                alcanzables.add(destino);
                cola.push(destino);
            }
        }
    }
    return alcanzables;
}
