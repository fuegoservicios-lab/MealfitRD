#!/usr/bin/env node
// [P3-AGENT-BUNDLE-CAP · 2026-05-19] Enforcer del tamaño del chunk de
// AgentPage tras `vite build`. Pre-fix: el chunk era ~37 KB gzip pero no
// había CI gate que detectara una regresión grande (alguien añade una
// dep heavy, code-split mal hecho, polyfill que crece sin notar). El
// audit production-readiness del Agente (2026-05-19) marcó esto como
// P3 — útil pero NO bloqueante para el ship inicial.
//
// Diseño:
//   - Lee `frontend/dist/assets/AgentPage-*.js` (Vite hashea filenames).
//   - Si encuentra múltiples chunks (code-split agresivo), SUMA los gzip sizes.
//   - Compara contra `MEALFIT_AGENT_PAGE_GZIP_CAP_KB` (default 80 KB).
//   - Clamp defensivo [10, 1000] KB — un cap absurdo (0 o 100MB) sería
//     útil para nadie. Floor 10 evita "build siempre falla" por env
//     mal seteado; techo 1000 evita "cap inútil que nunca dispara".
//   - Exit 0 si dentro del cap; exit 1 con mensaje verbose si excede.
//
// Por qué un script custom y NO `rollup-plugin-visualizer`:
//   - Visualizer genera HTML/JSON pero NO falla CI por sí mismo.
//   - Cero deps nuevas: `node:fs` + `node:zlib` (stdlib).
//   - Salida grep-friendly para CI logs.
//   - Knob via env var = configurable sin tocar código (subir el cap
//     temporalmente si una feature legítima requiere espacio).
//
// Cómo subir el cap temporalmente:
//   MEALFIT_AGENT_PAGE_GZIP_CAP_KB=120 npm run check:bundle-size
//
// Cómo correr en CI:
//   - npm run build && npm run check:bundle-size
//   - Si falla, el job de CI reporta exit code 1 → bloquea el merge.
//
// Tooltip-anchor: P3-AGENT-BUNDLE-CAP.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_FRONTEND = resolve(__dirname, "..");
const DIST_ASSETS = join(REPO_FRONTEND, "dist", "assets");

const DEFAULT_CAP_KB = 80;
const CLAMP_MIN_KB = 10;
const CLAMP_MAX_KB = 1000;

function readCapKb() {
  const raw = process.env.MEALFIT_AGENT_PAGE_GZIP_CAP_KB;
  if (!raw) return DEFAULT_CAP_KB;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    console.warn(
      `[P3-AGENT-BUNDLE-CAP] MEALFIT_AGENT_PAGE_GZIP_CAP_KB=${JSON.stringify(raw)} ` +
        `no es un entero. Usando default=${DEFAULT_CAP_KB}.`
    );
    return DEFAULT_CAP_KB;
  }
  if (parsed < CLAMP_MIN_KB) return CLAMP_MIN_KB;
  if (parsed > CLAMP_MAX_KB) return CLAMP_MAX_KB;
  return parsed;
}

function findAgentChunks() {
  if (!existsSync(DIST_ASSETS)) {
    console.error(
      `[P3-AGENT-BUNDLE-CAP] ${DIST_ASSETS} no existe. ` +
        `Corre \`npm run build\` antes de \`npm run check:bundle-size\`.`
    );
    process.exit(1);
  }
  const files = readdirSync(DIST_ASSETS);
  const chunks = files.filter(
    (f) => /^AgentPage-[\w-]+\.js$/.test(f) && !f.endsWith(".map")
  );
  if (chunks.length === 0) {
    console.error(
      `[P3-AGENT-BUNDLE-CAP] no se encontró ningún chunk AgentPage-*.js ` +
        `en ${DIST_ASSETS}. ¿Quizá Vite renombró el chunk o el code-split ` +
        `cambió el patrón? Inspecciona el build output:`
    );
    console.error(`  ls ${DIST_ASSETS} | head -20`);
    process.exit(1);
  }
  return chunks.map((c) => join(DIST_ASSETS, c));
}

function gzipSizeBytes(filePath) {
  const raw = readFileSync(filePath);
  const gz = gzipSync(raw, { level: 9 });
  return { rawBytes: raw.length, gzipBytes: gz.length };
}

function fmtKb(bytes) {
  return (bytes / 1024).toFixed(1);
}

function main() {
  const capKb = readCapKb();
  const chunks = findAgentChunks();

  let totalRaw = 0;
  let totalGzip = 0;
  const perChunk = [];
  for (const path of chunks) {
    const { rawBytes, gzipBytes } = gzipSizeBytes(path);
    totalRaw += rawBytes;
    totalGzip += gzipBytes;
    perChunk.push({ path, rawBytes, gzipBytes });
  }

  const totalGzipKb = totalGzip / 1024;
  const headerLine =
    `[P3-AGENT-BUNDLE-CAP] AgentPage chunks=${chunks.length} ` +
    `raw=${fmtKb(totalRaw)}KB gzip=${fmtKb(totalGzip)}KB cap=${capKb}KB`;

  if (totalGzipKb > capKb) {
    console.error(`❌ ${headerLine} — EXCEDE`);
    for (const c of perChunk) {
      console.error(
        `   - ${c.path}: raw=${fmtKb(c.rawBytes)}KB gzip=${fmtKb(c.gzipBytes)}KB`
      );
    }
    console.error(
      `\n[P3-AGENT-BUNDLE-CAP] El chunk de AgentPage creció más del cap.\n` +
        `   Diagnóstico sugerido:\n` +
        `   1. ¿Se añadió una dep heavy? Inspecciona los últimos commits del frontend.\n` +
        `   2. ¿El code-split se rompió? Usa \`npm run build -- --mode analyze\`\n` +
        `      con vite-plugin-visualizer si está instalado.\n` +
        `   3. Si la feature LEGÍTIMAMENTE requiere más espacio, sube el cap:\n` +
        `      - Knob: MEALFIT_AGENT_PAGE_GZIP_CAP_KB=<n>\n` +
        `      - Default: ${DEFAULT_CAP_KB}KB · clamp [${CLAMP_MIN_KB}, ${CLAMP_MAX_KB}]KB\n` +
        `      - Cambia el default en este script si la subida es permanente.`
    );
    process.exit(1);
  }

  console.log(`✅ ${headerLine}`);
  if (process.env.VERBOSE) {
    for (const c of perChunk) {
      console.log(
        `   - ${c.path}: raw=${fmtKb(c.rawBytes)}KB gzip=${fmtKb(c.gzipBytes)}KB`
      );
    }
  }
}

try {
  main();
} catch (err) {
  console.error(`[P3-AGENT-BUNDLE-CAP] error inesperado: ${err}`);
  process.exit(1);
}
