#!/usr/bin/env node
// [P1-PLAN-LOTE-108 · 2026-09-19] Paquete OTA de la app nativa: `dist/ota/<id>.zip` +
// `dist/ota/latest.json`. Lo corre el despliegue del frontend DESPUÉS de `npm run build`
// (deploy-mealfit.ps1) y ANTES de publicar la release, así que manifiesto y zip se
// publican con el mismo `mv -T` atómico que la web: nunca hay uno sin el otro.
//
// El consumidor es `src/native/liveUpdate.js`; el contrato del manifiesto vive allí
// (`decidirOta`). `ota.config.json` decide si se ofrece, a qué binarios y el pánico.
//
// Construye en `dist-native` (no en `dist`: ese es el web recién hecho), repite la
// sanidad del pipeline de Codemagic —lo que Apple rechazaría en el binario tampoco puede
// llegar por OTA— y borra `dist-native` al acabar.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearZip } from './lib/zipWriter.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_WEB = join(RAIZ, 'dist');
const DIST_NATIVO = join(RAIZ, 'dist-native');
export const OTA_BASE_URL = 'https://app.bioboros.com/ota/';

export function otaStamp(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export function leerConfig(ruta = join(RAIZ, 'ota.config.json')) {
    const cfg = JSON.parse(readFileSync(ruta, 'utf8'));
    if (typeof cfg.enabled !== 'boolean' || typeof cfg.reset !== 'boolean') throw new Error('ota.config.json: enabled/reset deben ser booleanos');
    if (!Number.isInteger(cfg.minNativeBuild) || cfg.minNativeBuild < 1) throw new Error('ota.config.json: minNativeBuild debe ser un entero >= 1');
    return cfg;
}

export function listarFicheros(dir) {
    const out = [];
    const andar = (d) => {
        for (const nombre of readdirSync(d).sort()) {
            const ruta = join(d, nombre);
            if (statSync(ruta).isDirectory()) andar(ruta);
            else out.push(ruta);
        }
    };
    andar(dir);
    return out;
}

export function construirManifiesto({ cfg, bundleId, zip }) {
    return {
        schema: 1,
        enabled: cfg.enabled,
        reset: cfg.reset,
        bundleId,
        url: `${OTA_BASE_URL}${bundleId}.zip`,
        checksum: createHash('sha256').update(zip).digest('hex'),
        size: zip.length,
        minNativeBuild: cfg.minNativeBuild,
        createdAt: new Date().toISOString(),
    };
}

function sanidad(bundleId) {
    if (!existsSync(join(DIST_NATIVO, 'index.html'))) throw new Error('OTA: dist-native sin index.html');
    const js = listarFicheros(join(DIST_NATIVO, 'assets')).filter((f) => f.endsWith('.js'));
    const todo = js.map((f) => readFileSync(f, 'utf8'));
    if (todo.some((s) => /P-[0-9A-Z]{24,26}/.test(s))) throw new Error('OTA: hay plan IDs de la pasarela dentro del paquete nativo (Apple 3.1.1)');
    if (!todo.some((s) => s.includes('https://app.bioboros.com'))) throw new Error('OTA: el paquete no lleva la API absoluta');
    if (!todo.some((s) => s.includes(bundleId))) throw new Error('OTA: el paquete no lleva su propio id — se reinstalaría en bucle');
}

function main() {
    const cfg = leerConfig();
    if (!existsSync(join(DIST_WEB, 'index.html'))) throw new Error('OTA: falta dist/ — corre `npm run build` antes');
    const bundleId = otaStamp();
    const env = { ...process.env, MF_OTA_BUNDLE_ID: bundleId, MF_DIST_DIR: 'dist-native' };
    rmSync(DIST_NATIVO, { recursive: true, force: true });
    try {
        execFileSync(process.execPath, [join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--mode', 'native', '--outDir', 'dist-native', '--emptyOutDir'], { cwd: RAIZ, env, stdio: 'inherit' });
        execFileSync(process.execPath, [join(RAIZ, 'scripts', 'build-manifests-i18n.mjs')], { cwd: RAIZ, env, stdio: 'inherit' });
        sanidad(bundleId);
        const entradas = listarFicheros(DIST_NATIVO)
            .filter((f) => !f.endsWith('.map'))
            .map((f) => ({ name: relative(DIST_NATIVO, f).split(sep).join('/'), data: readFileSync(f) }));
        const zip = crearZip(entradas);
        const destino = join(DIST_WEB, 'ota');
        rmSync(destino, { recursive: true, force: true });
        mkdirSync(destino, { recursive: true });
        writeFileSync(join(destino, `${bundleId}.zip`), zip);
        const manifiesto = construirManifiesto({ cfg, bundleId, zip });
        writeFileSync(join(destino, 'latest.json'), `${JSON.stringify(manifiesto, null, 2)}\n`);
        console.log(`OTA OK ${bundleId}: ${entradas.length} ficheros, ${(zip.length / 1048576).toFixed(2)} MiB, enabled=${cfg.enabled}, minNativeBuild=${cfg.minNativeBuild}`);
    } finally {
        rmSync(DIST_NATIVO, { recursive: true, force: true });
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main();
}
