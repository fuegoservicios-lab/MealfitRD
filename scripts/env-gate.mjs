/**
 * [P2-SUPPLY-CHAIN · 2026-08-18] Contrato de variables de entorno del artefacto.
 *
 * POR QUÉ. Todo lo que empieza por `VITE_` acaba **dentro del bundle**, en texto
 * plano, servido a cualquiera que abra el sitio. Vite lo documenta y aun así es
 * el error más fácil de cometer: basta con que alguien copie una clave de la API
 * al `.env.production` con el prefijo puesto —para que «funcione»— y la haya
 * publicado sin enterarse. No hay aviso: el build pasa, el sitio funciona, y la
 * clave está en el JavaScript de producción.
 *
 * Este gate falla cuando:
 *   · una variable NO empieza por `VITE_` (no llega al bundle: o sobra en este
 *     fichero, o alguien espera que haga algo que no hace);
 *   · una variable huele a secreto por su nombre (KEY, SECRET, TOKEN…) y no está
 *     declarada como pública a propósito;
 *   · falta una de las obligatorias.
 *
 * La lista de permitidas es explícita: una variable nueva obliga a añadirla
 * aquí, y ese es justo el momento en que alguien se pregunta si debería ser
 * pública.
 *
 *   node scripts/env-gate.mjs [ruta]     # por defecto .env.production
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUTA = process.argv[2] || path.join(AQUI, '..', '.env.production');

/** Obligatorias: sin ellas el artefacto se construye pero no funciona. */
const OBLIGATORIAS = ['VITE_API_URL'];

/**
 * Públicas a propósito. Llevan palabras que parecen de secreto (KEY, ID) pero
 * son identificadores publicables por diseño: la clave de PostHog es de ingesta,
 * el client-id de PayPal va en el HTML, el DSN de Sentry identifica el proyecto.
 * Cada una está aquí porque alguien decidió que puede verse, no porque colara.
 */
const PUBLICAS_A_PROPOSITO = new Set([
    'VITE_POSTHOG_KEY',
    'VITE_PAYPAL_CLIENT_ID',
    'VITE_SENTRY_DSN',
    'VITE_NEON_AUTH_URL',
    'VITE_NEON_PROJECT_ID',
    // La mitad PUBLICA de un par VAPID (Web Push). Es publica por definicion:
    // el navegador la necesita para suscribirse. La privada vive en el backend
    // y NO debe aparecer nunca aqui — comprobado: no esta.
    'VITE_VAPID_PUBLIC_KEY',
]);

/** Nombres que sugieren secreto. No prueban nada; obligan a declararlo. */
const HUELE_A_SECRETO = /(SECRET|PASSWORD|PRIVATE|_TOKEN|SERVICE_ROLE|_KEY$)/i;

if (!existsSync(RUTA)) {
    console.error(`[env-gate] no existe ${RUTA}`);
    process.exit(2);
}

const lineas = readFileSync(RUTA, 'utf8').split('\n');
const vars = new Map();
for (const l of lineas) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    vars.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
}

const problemas = [];

for (const nombre of vars.keys()) {
    if (!nombre.startsWith('VITE_')) {
        problemas.push(
            `${nombre}: no empieza por VITE_, así que Vite NO la mete en el bundle. ` +
            `O sobra en este fichero, o alguien cuenta con que haga algo que no hace.`
        );
        continue;
    }
    if (HUELE_A_SECRETO.test(nombre) && !PUBLICAS_A_PROPOSITO.has(nombre)) {
        problemas.push(
            `${nombre}: el nombre sugiere un secreto y VITE_ la publica EN EL BUNDLE. ` +
            `Si de verdad es pública, declárala en PUBLICAS_A_PROPOSITO de este script ` +
            `(y que quede escrito quién lo decidió). Si no lo es, sácala de aquí y rótala.`
        );
    }
}

for (const req of OBLIGATORIAS) {
    if (!vars.has(req)) problemas.push(`falta la variable obligatoria ${req}`);
}

if (problemas.length) {
    console.error('[env-gate] ❌ contrato de entorno incumplido:\n - ' + problemas.join('\n - '));
    process.exit(1);
}

console.log(`[env-gate] ✓ ${vars.size} variables, todas VITE_ y declaradas.`);
