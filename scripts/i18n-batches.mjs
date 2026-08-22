/**
 * [P1-I18N-DASHBOARD · 2026-08-15] Partidor y ensamblador de lotes de traducción.
 *
 * Existe por un motivo de mecánica, no de diseño: traducir ~2.200 claves × 4
 * idiomas en un solo fichero por idioma obliga a escribir ~150 kB de JSON de una
 * sentada, y varios traductores trabajando en paralelo sobre el MISMO fichero se
 * pisan. Partiendo en lotes, cada uno escribe su propio trozo y aquí se cosen.
 *
 *   node scripts/i18n-batches.mjs split <nLotes>   → escribe locales/_parts/<lang>.<i>.todo.json
 *   node scripts/i18n-batches.mjs merge            → cose los .done.json en <lang>.json y borra _parts
 *
 * El fichero `.todo.json` lleva las claves con valor vacío (o {one,other} vacío
 * si es plural); el traductor guarda su gemelo `.done.json` con los valores
 * puestos. `merge` valida que las CLAVES no hayan cambiado — un traductor que
 * "arregla" una clave rompe el enlace con el código y su trabajo nace huérfano.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// `execFileSync` y no `execSync`: no hay shell de por medio, así que ningún
// metacarácter puede interpretarse. Aquí el comando es fijo y sin entrada de
// usuario, pero la forma segura no cuesta nada y no invita a copiarla mal.
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');
const LOCALES_DIR = join(SRC, 'i18n', 'locales');
const PARTS = join(LOCALES_DIR, '_parts');

const LOCALES_SRC = readFileSync(join(SRC, 'i18n', 'locales.js'), 'utf8');
const DEFAULT_LOCALE = (LOCALES_SRC.match(/DEFAULT_LOCALE\s*=\s*'([^']+)'/) || [])[1];
const TARGETS = [...LOCALES_SRC.matchAll(/\{\s*code:\s*'([^']+)'/g)]
    .map((m) => m[1])
    .filter((c) => c !== DEFAULT_LOCALE);

const mode = process.argv[2];

if (mode === 'split') {
    const n = Number(process.argv[3] || 4);
    // Rellena los catálogos con las claves vivas y valores vacíos.
    execFileSync(process.execPath, ['scripts/i18n-check.mjs', '--write-template'], {
        cwd: join(__dirname, '..'),
        stdio: 'ignore',
    });

    // [P2-I18N-BATCHES-DESTRUCTIVO · 2026-08-21] La misma trampa que el `merge`, una
    // función más arriba: re-partir borraba `_parts/` con los `.done.json` que el
    // traductor ya había entregado y nadie había cosido todavía. Si hay trabajo dentro,
    // se archiva; si está vacía, se borra y ya.
    if (existsSync(PARTS)) {
        const hechos = readdirSync(PARTS).filter((f) => f.endsWith('.done.json'));
        if (hechos.length) {
            const archivo = `${PARTS}.pre-split-${new Date().toISOString().replace(/[:.]/g, '-')}`;
            renameSync(PARTS, archivo);
            console.warn(`  ⚠ había ${hechos.length} lote(s) traducidos sin coser: archivados en ${archivo}`);
        } else {
            rmSync(PARTS, { recursive: true, force: true });
        }
    }
    mkdirSync(PARTS, { recursive: true });

    for (const lang of TARGETS) {
        const catalog = JSON.parse(readFileSync(join(LOCALES_DIR, `${lang}.json`), 'utf8'));
        // Solo lo que falta por traducir (cadena vacía / plural con huecos).
        const pending = Object.keys(catalog).filter((k) => {
            const v = catalog[k];
            if (typeof v === 'string') return v === '';
            if (v && typeof v === 'object') return !v.other;
            return true;
        });
        const size = Math.ceil(pending.length / n);
        for (let i = 0; i < n; i++) {
            const slice = pending.slice(i * size, (i + 1) * size);
            if (!slice.length) continue;
            const obj = Object.fromEntries(slice.map((k) => [k, catalog[k]]));
            writeFileSync(
                join(PARTS, `${lang}.${i + 1}.todo.json`),
                JSON.stringify(obj, null, 2) + '\n',
                'utf8'
            );
        }
    }
    const files = readdirSync(PARTS);
    console.log(`[i18n:batches] ${files.length} lotes escritos en ${PARTS}`);
    for (const f of files.sort()) {
        const o = JSON.parse(readFileSync(join(PARTS, f), 'utf8'));
        console.log(`  ${f}  →  ${Object.keys(o).length} claves`);
    }
} else if (mode === 'merge') {
    if (!existsSync(PARTS)) {
        console.error('[i18n:batches] no hay _parts/ — ¿corriste `split` antes?');
        process.exit(1);
    }
    let merged = 0;
    let skipped = 0;
    for (const lang of TARGETS) {
        const catalogPath = join(LOCALES_DIR, `${lang}.json`);
        const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
        const parts = readdirSync(PARTS).filter((f) => f.startsWith(`${lang}.`) && f.endsWith('.done.json'));
        for (const p of parts) {
            const done = JSON.parse(readFileSync(join(PARTS, p), 'utf8'));
            for (const [k, v] of Object.entries(done)) {
                if (!(k in catalog)) {
                    // Clave inventada o alterada: NO se acepta. Enlazaría con
                    // nada y `i18n:check` la reportaría como huérfana.
                    console.error(`  ⚠ ${p}: clave desconocida, descartada → ${JSON.stringify(k)}`);
                    skipped++;
                    continue;
                }
                if (typeof v === 'string' && v.trim() === '') { skipped++; continue; }
                if (v && typeof v === 'object' && !v.other) { skipped++; continue; }
                catalog[k] = v;
                merged++;
            }
        }
        const ordered = Object.fromEntries(Object.keys(catalog).sort().map((k) => [k, catalog[k]]));
        writeFileSync(catalogPath, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
    }
    // [P2-I18N-BATCHES-DESTRUCTIVO · 2026-08-21] Antes: `rmSync` incondicional y salida
    // 0. Se llevaba por delante los lotes cuyas claves acababa de DESCARTAR —clave
    // desconocida, valor vacío, plural sin `other`— y también los que el traductor
    // todavía no había entregado, que viven en la misma carpeta. Sin salida distinta de
    // cero, nadie se enteraba.
    //
    // Ahora: con descartes, la carpeta NO se toca (hay que poder mirar qué se cayó) y
    // se sale 1. Sin descartes, se ARCHIVA en vez de borrarse — un `rename` cuesta lo
    // mismo que un borrado y deja el trabajo del traductor recuperable si el merge
    // resulta estar mal.
    if (skipped > 0) {
        console.error(
            `[i18n:batches] ${merged} traducciones cosidas y ${skipped} DESCARTADAS. ` +
            `${PARTS} se conserva intacto para que puedas ver qué se cayó.`,
        );
        process.exit(1);
    }
    const archivo = `${PARTS}.merged-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    renameSync(PARTS, archivo);
    console.log(`[i18n:batches] ${merged} traducciones cosidas, 0 descartadas. _parts/ archivado en ${archivo}.`);
} else {
    console.error('Uso: node scripts/i18n-batches.mjs split <n> | merge');
    process.exit(1);
}
