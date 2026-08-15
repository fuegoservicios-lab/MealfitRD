// [P1-APEX-PRECACHE-BLIND · 2026-08-14] El guard que convierte el silencio en
// una decisión.
//
// Las exclusiones de `precacheAudience.mjs` arreglan los tres intrusos de HOY.
// Esto descubre el de mañana. La lección del incidente no fue «se colaron tres
// chunks», fue que **nadie podía enterarse**: el precache creció hasta 721,7 KiB
// gz sin que ningún build dijera nada, porque no había ningún sitio donde el
// número apareciera. Un coste invisible no se discute.
//
// Regla: si en el precache del APEX entra un recurso por encima del umbral que no
// esté en la whitelist revisada, el build FALLA. No porque un chunk grande sea
// malo —cuatro de los cinco de la whitelist lo son y están justificados—, sino
// porque a partir de cierto peso la respuesta tiene que estar escrita.
//
// Se mide el apex y no `app.*` a propósito: son las dos audiencias del mismo
// bundle, y la del apex es la que puede no volver nunca — un visitante anónimo
// que llegó por un enlace, en datos móviles de prepago. El usuario de la app ya
// decidió instalarse el producto.
//
// Corre en `postbuild`. Ver también scripts/precacheAudience.mjs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { auditarPesoPrecache } from './precacheAudience.mjs';

const DIST = process.argv[2] || 'dist';
const UMBRAL_KB = 30;

// Recursos grandes que el apex SÍ debe precachear, cada uno con su razón. El
// prefijo va sin hash: un nombre con hash caducaría en el siguiente deploy.
//
// ⚠️ Añadir una línea aquí es una decisión de producto sobre los datos móviles de
// un desconocido. Que cueste escribirla es la función del guard, no un efecto
// secundario.
const REVISADOS = [
    // El shell. Sin esto no hay carga offline y el SW no sirve para nada.
    'assets/vendor-react-',
    'assets/index-',          // entry chunk (el propio shell)
    'assets/index-DmYl3VHB',  // CSS del shell — el patrón de arriba ya lo cubre
    // El landing. Es LO que el visitante del apex viene a ver.
    'assets/Home-',
    'assets/proxy-',          // framer-motion: el hero no renderiza sin él
    // Observabilidad que sí corre en el apex.
    'assets/sdk-',            // arranque de Sentry (init), P1-APEX-ENTRY-DIET
    'assets/module-',         // posthog-js: el embudo nace en la portada
    // Marca.
    'favicon.png',
    'favicon.ico',
    'index.html',
];

// Espejo del filtro por host de `src/custom-sw.js`. Duplicarlo aquí es
// deliberado: si alguien toca uno y no el otro, el guard mide una realidad
// distinta de la que se despliega — y el test parser-based
// backend/tests/test_p1_apex_precache_blind.py ancla que las dos listas coincidan.
const APP_ONLY = /(?:^|\/)(Dashboard|AgentPage|Pantry|Recipes|Settings|History|Plan|Assessment|Upgrade|Login|ResetPassword|DashboardLayout|VirtualizedMessageList|CameraViewfinder|BrandSelect|HelpChatWidget|PaymentModal|SettingsDialog)-[A-Za-z0-9_-]+\.(?:js|css)$/;

const swPath = path.join(DIST, 'custom-sw.js');
if (!fs.existsSync(swPath)) {
    console.error(`[precache-guard] no encuentro ${swPath}; ¿corriste el build?`);
    process.exit(1);
}

const sw = fs.readFileSync(swPath, 'utf8');
const i0 = sw.indexOf('[{');
const i1 = sw.indexOf('}]', i0) + 2;
if (i0 === -1 || i1 <= 1) {
    console.error('[precache-guard] no pude leer el manifest inyectado en custom-sw.js.');
    process.exit(1);
}
const manifest = JSON.parse(sw.slice(i0, i1).replace(/([{,])(\w+):/g, '$1"$2":'));
const apex = manifest.filter((e) => !APP_ONLY.test(e.url));

const pesoGz = (url) => {
    const p = path.join(DIST, url.replace(/^\//, ''));
    if (!fs.existsSync(p)) return 0;
    return zlib.gzipSync(fs.readFileSync(p), { level: 6 }).length;
};

let totalGz = 0;
for (const e of apex) totalGz += pesoGz(e.url);

const { ok, intrusos } = auditarPesoPrecache(apex, pesoGz, {
    umbralKb: UMBRAL_KB,
    revisados: REVISADOS,
});

console.log(
    `[precache-guard] apex: ${apex.length} entradas · ${(totalGz / 1024).toFixed(1)} KiB por la red (gzip 6)`,
);

if (!ok) {
    console.error(
        `\n[precache-guard] ❌ ${intrusos.length} recurso(s) por encima de ${UMBRAL_KB} kB gz en el `
        + 'precache del APEX sin estar revisados:\n'
        + intrusos.map((i) => `    ${String(i.kb).padStart(7)} kB gz  ${i.url}`).join('\n')
        + '\n\nUn visitante anónimo de la portada se los descarga en la instalación del\n'
        + 'Service Worker, aunque no navegue nunca a la pantalla que los usa.\n\n'
        + 'Dos salidas legítimas, y la elección hay que escribirla:\n'
        + '  · Si el apex NO lo ejecuta jamás (hay un gate de host o de función que lo\n'
        + '    impide) → añade su paquete marcador a FAMILIAS_NO_PRECACHEABLES en\n'
        + '    scripts/precacheAudience.mjs, con el gate anotado.\n'
        + '  · Si el apex SÍ lo necesita → añade su prefijo a REVISADOS en este fichero,\n'
        + '    con una línea diciendo por qué vale esos kilobytes.\n',
    );
    process.exit(1);
}

console.log(`[precache-guard] ✓ ningún recurso >${UMBRAL_KB} kB gz sin revisar.`);
