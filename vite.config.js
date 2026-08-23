import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync, existsSync } from 'fs'

// [P2-DEV-LAN-HTTPS] Ver el bloque `server` más abajo. Solo con `--host` (servir al
// teléfono) y solo si los certificados existen; si no, `undefined` = HTTP como siempre.
function devHttpsConfig() {
  if (!process.argv.includes('--host')) return undefined
  const key = new URL('./.dev-certs/key.pem', import.meta.url)
  const cert = new URL('./.dev-certs/cert.pem', import.meta.url)
  if (!existsSync(key) || !existsSync(cert)) return undefined
  return { key: readFileSync(key), cert: readFileSync(cert) }
}
// [P1-LANDING-HEAD-PRELOAD · 2026-08-14] Ver el plugin `bioboros-landing-head`
// más abajo y el porqué extenso en scripts/landingHead.mjs.
import { landingPreloadTargets, landingHeadSnippet } from './scripts/landingHead.mjs'
// [P1-APEX-PRECACHE-BLIND · 2026-08-14] Ver el plugin `bioboros-precache-audience`
// más abajo y el porqué extenso en scripts/precacheAudience.mjs.
import { chunksNoPrecacheables } from './scripts/precacheAudience.mjs'

// [BIOBOROS-SENTRY-RELEASE · 2026-07-30] El release de Sentry se hornea aquí
// como UNA cadena literal, derivada de package.json.
//
// Antes vivía en `main.jsx` como `` `mealfitrd@${APP_VERSION}` `` y el deploy
// subía los sourcemaps con `--release <version>` a secas. Nunca casaron:
// `mealfitrd@1.0.0` != `1.0.0`. Con 61 de 63 ficheros sin debug id, Sentry no
// tenía por dónde enlazar — los sourcemaps se subían y no des-minificaban nada.
//
// Que sea un literal contiguo no es cosmético: el template literal de antes NO
// se plegaba en el bundle (sólo aparecía el fragmento `mealfitrd@`), así que el
// deploy no podía leer del artefacto qué release se había horneado. Ahora sí, y
// por eso el deploy extrae el release del propio `dist/` en vez de recalcularlo
// — dos mitades que no pueden discrepar porque sólo hay una.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const APP_RELEASE = `bioboros@${pkg.version}`

// https://vite.dev/config/
//
// [P3-FRONTEND-1 · 2026-05-12] Strip de `console.log/warn/debug/info` y
// `debugger` en builds production via esbuild. Preserva `console.error` /
// `console.trace` / `console.assert` para mantener trazas de errores
// genuinos en prod (críticos para post-mortem cuando un usuario reporta
// un bug por screenshot). En `mode !== 'production'` (dev, test) no se
// aplica nada — los logs siguen visibles para Vitest + debug interactivo.
//
// Razón del audit 2026-05-11: 141 console.* en 24 archivos source.
// Muchos legítimos para debug local pero terminaban en el bundle público
// ofuscando logs de error reales en producción + leak menor de
// info interna (ej. shape de respuestas, IDs internos).
//
// esbuild `pure` marca las funciones como side-effect-free → si el return
// value no se usa (siempre true para console.*) el call es eliminado por
// tree-shaking. No requiere terser ni deps extra.
// Anchor: P3-FRONTEND-1-ESBUILD-DROP-CONSOLE.
/**
 * [P1-LANDING-HEAD-PRELOAD · 2026-08-14] Inyecta en el `<head>` compilado un
 * bloque que decide por HOST qué precalentar: en el apex, el chunk del landing
 * (que hasta hoy no se descubría hasta parsear el entry entero); fuera del apex,
 * el `preconnect` al host de autenticación, que antes estaba fijo en index.html
 * y por tanto también en la portada, donde no se contacta jamás.
 *
 * `order: 'post'` + `ctx.bundle` porque los nombres llevan hash de contenido:
 * sólo se conocen cuando el bundle ya está generado. En dev no hay bundle y el
 * hook no hace nada — el servidor de dev sirve los módulos sin hashear.
 */
const landingHeadPlugin = (authOrigin) => ({
  name: 'bioboros-landing-head',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (!ctx || !ctx.bundle) return html
      const snippet = landingHeadSnippet(landingPreloadTargets(ctx.bundle), { authOrigin })
      if (!snippet) return html
      return html.replace('</head>', `${snippet}\n</head>`)
    },
  },
})

// [P1-APEX-PRECACHE-BLIND · 2026-08-14] El puente entre el bundle y el precache.
//
// El problema de fontanería: `injectManifest.globIgnores` se evalúa con patrones
// de fichero, y los chunks que hay que excluir llevan hash de contenido — un
// patrón literal caducaría en el siguiente deploy y fallaría en silencio. Los
// nombres reales sólo se conocen en `generateBundle`, y para entonces la config
// de VitePWA ya está fijada.
//
// La salida es este par: el plugin captura los nombres en `generateBundle` y
// `manifestTransforms` (más abajo, en la config de VitePWA) los lee como closure.
// Los dos corren en el mismo proceso y en este orden — build del cliente
// (`generateBundle`) → build del SW → generación del manifest — así que cuando el
// transform pregunta, el Set ya está lleno.
//
// Si el orden cambiara alguna vez, el Set llegaría VACÍO y el efecto sería
// «vuelven los 237 KiB», no «se rompe el sitio». Por eso el guard de peso del
// `postbuild` es obligatorio y no decorativo: es lo que convierte ese fallo
// silencioso en un build rojo.
const excluidosDelPrecache = new Set()

const precacheAudiencePlugin = () => ({
  name: 'bioboros-precache-audience',
  generateBundle(_opciones, bundle) {
    excluidosDelPrecache.clear()
    for (const nombre of chunksNoPrecacheables(bundle)) excluidosDelPrecache.add(nombre)
  },
})

/**
 * [P3-HTML-LIMPIO · 2026-08-18] Quita los comentarios de `index.html` AL CONSTRUIR.
 *
 * Los comentarios de este HTML son buenos y hay que conservarlos: explican por
 * qué el zoom está bloqueado, por qué el arranque de idioma y el de tema van
 * inline, qué hace cada bloque de SEO. Lo que no tiene sentido es EMBARCARLOS.
 *
 * Medido: 9.471 B crudos, 4.400 B gzip —el 43% del fichero—. Y el HTML no es un
 * asset con hash: viaja, revalidado, en cada carga de cada visitante, así que
 * esos 4,4 kB no se amortizan nunca con la caché como sí hacen los `.js`.
 *
 * ⚠ NO SE TOCA LO QUE HAY DENTRO DE `<script>` NI DE `<style>`. Un
 * `String.replace(/<!--[\s\S]*?-->/g, '')` a pelo sobre todo el documento
 * arrasaría con cualquier `-->` que aparezca dentro de una cadena de JavaScript
 * —y aquí hay siete scripts inline, incluidos los dos arranques sin parpadeo, que
 * son load-bearing: si se corrompen, la página parpadea en el tema equivocado o
 * se queda en blanco—. Por eso se trocea primero y sólo se limpian los tramos de
 * fuera.
 *
 * `apply: 'build'` a propósito: en desarrollo los comentarios se quedan, que es
 * donde alguien los va a leer.
 */
/**
 * [P2-DEV-ESPEJO-APEX · 2026-08-23] En desarrollo, las rutas de marketing se comportan
 * como en producción.
 *
 * El landing público NO sale de este repo: lo genera `bioboros-cinematic` (HTML estático,
 * `python build.py`). Aquí sobreviven las rutas React equivalentes, CONGELADAS en el
 * diseño anterior. En producción nginx las redirige al apex (P1-LEGAL-UNA-SOLA-COPIA y
 * P2-RUTAS-HUERFANAS-APP), pero el servidor de desarrollo las servía tal cual: abrir
 * `localhost:5173/about` enseñaba el diseño viejo y parecía que local iba atrasado.
 * No iba atrasado — son DOS SITIOS distintos y sólo uno es el público. Al dueño le costó
 * tres vueltas, que es lo que cuesta siempre un entorno que miente sobre el de verdad.
 *
 * La lista es la MISMA de `backend/infra/nginx/mealfit.conf`, y su guard
 * (`test_p2_dev_espejo_apex.py`) exige que no se separen.
 *
 * `apply: 'serve'`: esto NO toca el build. Para EDITAR el landing, sírvelo aparte:
 *   cd bioboros-cinematic && python -m http.server 8080 --directory bioboros
 */
const espejoApexEnDesarrollo = () => ({
    name: 'espejo-apex-en-desarrollo',
    apply: 'serve',
    configureServer(server) {
        const APEX = 'https://bioboros.com';
        // pasan tal cual: existen en el apex con el mismo nombre
        const PASO = new Set([
            'about', 'acceptable-use', 'ai-policy', 'como-funciona', 'data-protection',
            'medical', 'motor', 'novedades', 'precios', 'privacy', 'refunds', 'research',
            'responsible-disclosure', 'supermercado', 'terms',
        ]);
        // cambian de nombre: el apex no tiene estas tres direcciones
        const RENOMBRA = {
            funciones: '/como-funciona',
            precision: '/research',
            cookies: '/privacy#cookies',
        };
        server.middlewares.use((req, res, next) => {
            const ruta = (req.url || '/').split('?')[0];
            const primero = ruta.split('/')[1] || '';
            const destino = RENOMBRA[primero] || (PASO.has(primero) ? ruta : null);
            if (!destino) return next();
            res.writeHead(301, { Location: APEX + destino });
            return res.end();
        });
    },
});

const sinComentariosHtml = () => ({
    name: 'sin-comentarios-html',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
        const trozos = html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/i);
        return trozos
            .map((t, i) => (i % 2 === 1 ? t : t.replace(/<!--[\s\S]*?-->/g, '')))
            .join('')
            .replace(/\n{3,}/g, '\n\n');
    },
});

export default defineConfig(({ mode }) => {
  // El origen de Neon Auth se deriva de `VITE_NEON_AUTH_URL` en vez de repetirse
  // a mano: el valor ya vive en `.env.production` y una segunda copia en el HTML
  // fue justo lo que dejó el preconnect apuntando a un host que el apex no usa.
  const env = loadEnv(mode, process.cwd(), '')
  // [P1-IOS-CODEMAGIC · 2026-08-22] `native` es el build del binario iOS
  // (`npm run build:native`, lo corre Codemagic). Se DISTRIBUYE igual que production,
  // así que hereda sus dos endurecimientos: sin console.* y sin sourcemaps dentro.
  // El modo es distinto de `production` solo para que Vite cargue `.env.native`.
  const esDistribuible = mode === 'production' || mode === 'native'
  let authOrigin = ''
  try {
    authOrigin = env.VITE_NEON_AUTH_URL ? new URL(env.VITE_NEON_AUTH_URL).origin : ''
  } catch {
    authOrigin = ''
  }

  return {
  plugins: [
    react(),
    espejoApexEnDesarrollo(),
    sinComentariosHtml(),
    landingHeadPlugin(authOrigin),
    precacheAudiencePlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'custom-sw.js',
      // [P2-PWA-SKIPWAITING · 2026-05-30] 'prompt' (era 'autoUpdate'). El SW
      // nuevo NO toma control hasta que el usuario acepta el toast "Nueva
      // versión" (main.jsx onNeedRefresh → updateSW(true) → SKIP_WAITING en
      // custom-sw.js). Evita el reload abrupto a mitad de un formulario largo
      // (Assessment) o del chat, y cierra el agujero de stale-bundle: antes el
      // SW nuevo quedaba en 'waiting' indefinidamente y el usuario servía el
      // bundle viejo por días tras un deploy.
      registerType: 'prompt',
      // [P2-PWA-DEV-MODE · 2026-05-12] `devOptions.enabled: true` registraba
      // el Service Worker en `npm run dev`. Riesgos:
      //   (a) Browsers que abrieron tanto localhost:5173 como mealfitrd.com
      //       en el mismo dispositivo pueden cachear bundles dev/stale en
      //       el SW y servirlos de vuelta en sesiones futuras (depende del
      //       scope del SW por origen).
      //   (b) Rompe HMR — cualquier cambio de source dispara invalidación
      //       parcial, dejando el module graph mitad nuevo / mitad cacheado.
      //   (c) Deja artefactos en `.vite/` que confunden bug reports
      //       ("¿por qué mi cambio no aparece?" cuando el SW lo intercepta).
      // Para testear PWA localmente: `npm run build && npm run preview`
      // (modo production-like sin tocar el binary corriendo).
      devOptions: {
        enabled: false,
        type: 'module',
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // [P2-PWA-PRECACHE-TRIM · 2026-05-30] Excluir del precache assets
        // pesados que NO necesitan estar disponibles offline en el primer
        // install. Antes el SW descargaba ~5.8MB de golpe en la 1ª visita
        // (costoso en datos móviles del mercado es-DO). Excluidos:
        //   - html2pdf-*.js (~976KB): lazy `await import()` on-demand (P2-LAZY-PDF);
        //     se baja solo cuando el usuario exporta el PDF, no en el install.
        //   - dashboard_bg_v2.png (~1MB): fondo CSS que el navegador pide por red al
        //     renderizar; degrada a fondo liso sin red (no hay requisito offline-first
        //     cosmético). [P6-SPEED-IMG] Sirve .webp (43.6KB) vía image-set; el .png es
        //     solo fallback y el .webp NO está en globPatterns → ninguno se precachea.
        //     (auth_bg_new.png/.webp eliminados en P2-DEAD-CODE-SAFE — el fondo de Auth
        //     es ahora un gradient CSS.)
        //   - apple-touch-icon*.png (~137KB entre los tres) [P1-LANDING-SW-DEFER ·
        //     2026-08-14]: iconos que pide el SISTEMA OPERATIVO cuando el usuario
        //     INSTALA el PWA («Añadir a inicio») o abre el share sheet de iOS.
        //     Dentro de la app no se renderizan nunca, así que un visitante anónimo
        //     del landing los descargaba enteros para no mostrarlos jamás.
        //     ⚠️ Excluidos del PRECACHE, NO borrados: `manifest.json` referencia
        //     `apple-touch-icon.png` 4 veces y BRAND-FAVICON-B los declara por
        //     escrito fallback de root. Borrarlos rompe el icono del PWA instalado.
        //     El navegador los sigue pidiendo por red en el momento de instalar,
        //     que es exactamente cuando hacen falta.
        //     [P3-APPLE-ICON-180-HUERFANO · 2026-08-15] De los cinco, uno SÍ estaba
        //     muerto: `apple-touch-icon-180.png` (23.802 B). `index.html` usa
        //     `-180-v2` (BRAND-FAVICON-B cambió el NOMBRE porque iOS cachea estos
        //     iconos a nivel de SO e ignora el `?v=`) y `manifest.json` nunca lo
        //     nombró — sólo al `-192` y al plano. Cero referencias en todo el repo.
        //     Borrado, y su línea de `globIgnores` con él: una exclusión que ya no
        //     puede casar con nada se lee como «eso ya está excluido» y manda a
        //     buscar los bytes a otro sitio (la misma trampa que P1-LANDING-SW-DEFER
        //     encontró con la entrada muerta de `og-image.png`).
        // El app-shell (JS/CSS/HTML + favicons) SÍ se precachea para el
        // offline-load.
        //
        // [P1-LANDING-SW-DEFER · 2026-08-14] Aquí había una entrada `og-image.png`
        // que llevaba meses sin poder casar con nada: el fichero se renombró a
        // `og-image-v4.jpg` en el rebrand y los `.jpg` ni siquiera entran en
        // `globPatterns`. Una exclusión que no puede casar no es inofensiva —
        // quien depure el peso del precache la lee como «esa imagen ya está
        // excluida» y busca los bytes en otro sitio. Un test la vigila ahora.
        globIgnores: [
          // [P2-LANDING-PRERENDER-META · 2026-08-14] Los ~18 HTML por ruta que
          // estampa `scripts/build-route-meta.mjs`. `globPatterns` incluye
          // `**/*.html`, asi que en principio entrarian TODOS al precache
          // (+~250 KB por visitante) para nada: su unico consumidor son los
          // unfurlers y los crawlers, que no instalan service worker.
          //
          // ⚠️ HONESTIDAD SOBRE QUE HACE ESTA LINEA HOY: verificado en el build
          // del 2026-08-14, el manifest sale con UNA sola entrada `.html` (la
          // raiz) incluso sin esta exclusion — porque el prerender corre en
          // `postbuild`, o sea DESPUES de que VitePWA calcule el manifest. Es
          // decir, ahora mismo el trabajo lo hace el ORDEN, no esta linea.
          // Se deja igualmente como cinturon: el dia que alguien mueva el
          // prerender dentro del build (un plugin, un `closeBundle`), el orden
          // deja de proteger y esta linea pasa a ser lo unico que lo hace.
          // El `index.html` de la raiz SI debe precachearse — es el fallback
          // offline del SPA — y por eso el patron lleva subdirectorio.
          '*/index.html',
          'assets/html2pdf-*.js',
          'dashboard_bg_v2.png',
          'model-v1.jpeg',
          'apple-touch-icon.png',
          'apple-touch-icon-192.png',
          'apple-touch-icon-v2.png',
          'apple-touch-icon-180-v2.png',
        ],
        // [P1-APEX-PRECACHE-BLIND · 2026-08-14] Lo que `globIgnores` no puede
        // expresar: exclusiones por CONTENIDO del chunk, no por nombre.
        //
        // Medido antes de esto: 237,0 KiB gz —un tercio del precache del apex—
        // eran @sentry-internal/replay, @neondatabase/auth+zod y la cadena de
        // markdown. Las tres tienen un gate de runtime que garantiza que la
        // portada NO las ejecuta jamás, y ninguna de las tres sirve de nada
        // offline: subir un replay, autenticarse y pedirle texto a un LLM
        // requieren red por definición. Se excluyen para los DOS hosts.
        //
        // Un chunk fuera del precache no se rompe: se sirve por red cuando se
        // navegue a él (la misma degradación graciosa que ya documenta
        // `custom-sw.js` para el filtro por host).
        manifestTransforms: [
          (entradas) => ({
            manifest: entradas.filter((e) => !excluidosDelPrecache.has(
              String(e.url || '').replace(/^\//, ''),
            )),
            warnings: [],
          }),
        ],
      },
      // [P3-PRECACHE-FAVICON-DUP · 2026-08-15] `includeAssets` vaciado.
      //
      // Declaraba `favicon.png`, que YA entra por `globPatterns`
      // (`**/*.{js,css,html,ico,png,svg}`), así que el manifest lo listaba DOS
      // veces. Con la misma `revision` en ambas, Workbox deduplica y no hay
      // descarga doble — por eso nunca dolió y por eso llevaba ahí tanto tiempo.
      //
      // Se limpia igualmente porque el manifest es lo que uno lee para saber qué
      // pesa el precache, y una entrada repetida hace dudar del resto del conteo.
      // (Si algún día hiciera falta un asset que `globPatterns` NO cubre —un
      // `.woff2`, un `.jpg`— este es su sitio; hoy no hay ninguno.)
      includeAssets: [],
      // [P2-MANIFEST-DEDUPE · 2026-07-09] `manifest: false`. Antes convivían DOS
      // manifests divergentes en el HTML compilado: el <link rel="manifest"
      // href="/manifest.json"> manual de index.html (SSOT rico: lang es-DO,
      // orientation, shortcuts, iconos P3-PWA-ICON-PADDING) y el
      // manifest.webmanifest que inyectaba este plugin (lang 'en', sin
      // shortcuts ni orientation). El browser tomaba el primero, pero la
      // duplicación era ambigua y drift-prone. public/manifest.json queda como
      // SSOT único; el plugin sigue generando SOLO el service worker.
      manifest: false,
    })
  ],
  // Ver [BIOBOROS-SENTRY-RELEASE] arriba. Anchor: BIOBOROS-SENTRY-RELEASE-DEFINE.
  define: {
    __APP_RELEASE__: JSON.stringify(APP_RELEASE),
  },
  // [P2-DEV-LAN · 2026-08-23] El bucle de trabajo en un TELÉFONO real. Emular un móvil
  // en el escritorio no reproduce el teclado de iOS — y ahí es donde viven los defectos
  // de esta semana —, así que el servidor de desarrollo tiene que ser alcanzable desde el
  // iPhone: `npm run dev:lan` escucha en la red local y `MF_DEV_API` decide contra qué
  // backend habla. Por defecto, el backend local de siempre: nada cambia para quien ya
  // tenía su entorno montado.
  //
  // El proxy es lo que hace esto posible SIN tocar la lista CORS del backend: para el
  // navegador todo es el mismo origen (el propio servidor de desarrollo), así que no hay
  // petición cross-origin que permitir. Apuntar `VITE_API_BASE_URL` a producción en su
  // lugar SÍ la dispararía, y `http://<ip-lan>:5173` no está ni debe estar en esa lista.
  //
  // [P2-DEV-LAN-HTTPS · 2026-08-23] Y tiene que ser HTTPS. Un origen `http://10.0.0.68`
  // NO es contexto seguro para iOS, y eso rompe tres cosas a la vez, ninguna visible
  // desde el escritorio: `crypto.randomUUID` no existe (el chat lo usa para abrir la
  // sesión y el SDK de Neon por dentro), la cookie de sesión first-party nace con
  // `Secure` y el navegador la descarta (el login con código «termina» y rebota), y la
  // API absoluta a 127.0.0.1 sería contenido mixto. Con `--host` y los certificados en
  // `.dev-certs/` (autofirmados, fuera de git; el teléfono pregunta una vez) se sirve
  // HTTPS. Sin `--host` nada cambia: `http://localhost:5173` sigue siendo lo de siempre.
  server: {
    port: 5173,
    https: devHttpsConfig(),
    proxy: {
      '/api': {
        target: process.env.MF_DEV_API || 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  // [P3-FRONTEND-1 · 2026-05-12] esbuild config solo en production. En dev
  // y test los logs se preservan (debug interactivo + Vitest specs que
  // inspeccionan console output siguen funcionando).
  esbuild: esDistribuible ? {
    drop: ['debugger'],
    pure: ['console.log', 'console.warn', 'console.debug', 'console.info'],
  } : {},
  // [P3-I18N-JSON-NAMEDEXPORTS · 2026-08-21] `namedExports: true` (el default)
  // cortocircuita la propia regla `stringify: 'auto'` de Vite: para poder ofrecer
  // `import { clave } from 'x.json'` hay que emitir un objeto literal, y entonces el
  // umbral de tamaño que decidiría usar `JSON.parse` no se llega a aplicar.
  //
  // MEDIDO: los cuatro catálogos salen como objeto literal de 184-200 kB — 19 veces el
  // umbral de 10 kB. Un objeto literal de ese tamaño lo tiene que parsear el motor de
  // JS con el parser completo; `JSON.parse` sobre una cadena usa un parser dedicado y
  // es varias veces más rápido en arranque frío, que es exactamente cuando esto corre
  // (un usuario no hispano abriendo la app por primera vez).
  //
  // Es seguro globalmente: los ÚNICOS cuatro imports de JSON de toda la app son estos
  // catálogos, y los cuatro toman `.default` (`LOADERS` en `i18n/index.js`). Cero
  // imports nombrados desde JSON en `src/`.
  json: { namedExports: false, stringify: 'auto' },

  build: {
    // [P2-SOURCEMAPS-HIDDEN · 2026-07-30] Sin sourcemaps, TODO error de frontend
    // llega a Sentry como `t.default` dentro de una función llamada `Ln` — no es
    // que un bug concreto sea difícil, es que ninguno se puede leer. Caso real:
    // un `TypeError: Cannot read properties of undefined (reading 'default')` en
    // /login que costó una hora de inferencia estática y quedó SIN cerrar por
    // falta de stack trace legible.
    //
    // `'hidden'` y no `true`: genera los `.map` pero NO añade el comentario
    // `//# sourceMappingURL=` al bundle, así que ningún navegador los pide.
    // Aun así el fichero existiría en `dist/`, y `dist/` lo sirve nginx —
    // publicarlos expondría el código con nombres y comentarios originales, que
    // en este repo incluyen razonamiento de negocio (umbrales, incidentes).
    // Por eso el deploy los SUBE a Sentry y luego los BORRA de `dist/`, y nginx
    // además deniega `*.map` como segunda barrera. Ver deploy-mealfit.ps1.
    // [P1-IOS-CODEMAGIC · 2026-08-22] En `native` NO se generan: nadie los sube a
    // Sentry ni los borra (ese paso vive en deploy-mealfit.ps1, que aquí no corre),
    // así que 130 .map (~20 MB) irían dentro del .ipa exponiendo lo mismo que el
    // párrafo de arriba dice que no se publica. Medido: dist/ nativo 24 MB, 23 de assets.
    sourcemap: mode === 'native' ? false : 'hidden',
    // Target modern browsers for smaller output
    target: 'es2020',
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Chunk strategy for optimal caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor: heavy libs cached separately
          // [P2-VENDOR-REACT-CLIENT · 2026-07-09] 'react-dom/client' añadido:
          // es un export-path SEPARADO que NO es dependencia de react-dom/index,
          // así que listar solo 'react-dom' dejaba react-dom-client.production
          // (~130KB min / ~40KB gzip — el reconciler entero) dentro del ENTRY
          // chunk, cuyo hash cambia en cada deploy → los usuarios re-descargaban
          // el framework en cada release en vez de servirlo del cache del vendor
          // chunk estable. Verificado con rollup-plugin-visualizer 2026-07-09.
          'vendor-react': ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
          // [P2-NEON-LAZY · 2026-07-12] `vendor-neon-auth` REMOVIDO de manualChunks
          // (misma lección que framer, abajo): un vendor chunk NOMBRADO recibe
          // <link modulepreload> eager de Vite aunque solo se alcance por dynamic
          // import. authClient.js ahora carga el SDK vía import() → sin nombrarlo,
          // Rollup lo auto-divide en un chunk async on-demand (vía __vitePreload),
          // fuera del critical path. El SDK (~89KB gzip) solo se descarga al primer
          // uso de auth (getSession/login), no en la landing pública.
          // [P1-PERF-FRAMER-SPLIT · 2026-05-31] framer-motion REMOVIDO de
          // vendor-ui y SIN manualChunk propio. Antes vivía junto a lucide-react +
          // sonner; como ambos se importan EAGER (lucide en Login/Register/Header/
          // Footer/DashboardLayout, sonner Toaster en App), todo vendor-ui (incl.
          // framer ~39KB gzip) caía en el critical path con modulepreload. framer
          // SOLO lo usan páginas/componentes lazy (Dashboard/Plan/Recipes/Settings/
          // History/Home/Modal/PaymentModal/…) — ningún módulo eager lo importa.
          // Darle un manualChunk explícito (`vendor-motion`) NO ayudaba: Vite igual
          // emite <link modulepreload> para todo vendor chunk nombrado → seguía
          // descargándose al arranque. Dejándolo SIN listar, Rollup lo auto-divide
          // en un chunk compartido que se carga on-demand (vía __vitePreload) solo
          // cuando la primera ruta lazy que lo usa se monta → fuera del critical
          // path real. lucide + sonner siguen en vendor-ui (sí eager, justificado).
          //
          // ⚠️ [P2-FRAMER-CRITICAL-PATH · 2026-08-15] CORRECCIÓN: la frase «fuera
          // del critical path real» era cierta para `/login`, que es la ruta que
          // motivó P1-PERF-FRAMER-SPLIT — y es FALSA para `/`.
          //
          // Medido: `proxy-*.js` (framer) son 114.942 B / 37,7 kB gz y es el TERCER
          // recurso del critical path del apex, por detrás sólo de vendor-react y
          // del entry. Llega ahí porque `Hero.jsx`, `DashboardShowcase.jsx` y
          // `NewsHighlight.jsx` importan `motion`, y el bloque gateado por host de
          // P1-LANDING-HEAD-PRELOAD lo precarga junto al chunk de Home — a
          // propósito: la evaluación del módulo lo necesita ANTES de pintar el hero.
          //
          // Se corrige el comentario y NO se toca el chunking, porque mientras
          // dijera que framer está fuera del critical path, el siguiente auditor
          // descartaba la optimización sin medirla. Que es exactamente lo que pasó
          // hasta hoy: el gap llevaba abierto desde el 2026-08-14 con esta frase
          // como razón para no mirarlo.
          //
          // Y lo que dice la PRIMERA traza real de LCP (2026-08-15, Slow 4G + CPU
          // 4x, contra producción) sobre si conviene migrar a `LazyMotion`:
          // el LCP es **>99% render delay** y **<0,2% TTFB**. El cuello no son los
          // bytes, es la ejecución. Cambiar framer por LazyMotion ahorraría ~10-15
          // kB gz de descarga y prácticamente nada de parseo+ejecución, que es
          // donde está el tiempo. Antes de gastar ese esfuerzo —`whileInView`
          // depende de la feature de viewport, y los módulos CSS documentan un
          // acoplamiento fino con cómo framer escribe el transform— hay que medir
          // el delta REAL con una traza, no asumirlo.
          // [P2-LANDING-OLA1-DIET · 2026-08-14] `lucide-react` SALE de aquí.
          //
          // Un vendor chunk NOMBRADO recibe `<link rel=modulepreload>` eager de
          // Vite en TODAS las rutas (la misma mecánica que documentan P2-NEON-LAZY
          // y P1-PERF-FRAMER-SPLIT arriba). Medido el 2026-08-14: el chunk eran
          // 95.846 B, y su sourcemap contenía EXACTAMENTE 181 módulos de icono
          // (49.996 B) — entre ellos `refrigerator`, `syringe`, `stethoscope`,
          // `shrimp`, `chef-hat`, `microscope`: pantallas que el apex ni siquiera
          // puede alcanzar. El chrome eager importa 18; el landing entero, ~25.
          //
          // Sin nombrar la librería, Rollup reparte: los iconos del chrome caen en
          // el entry (siguen eager, que es lo que P1-PERF-FRAMER-SPLIT quería
          // garantizar) y el resto viaja con su página lazy.
          //
          // ⚠️ El coste que este repo ya pagó una vez: P2-VENDOR-REACT-CLIENT movió
          // react-dom/client a un vendor chunk PRECISAMENTE porque el entry
          // re-hashea en cada deploy. Los iconos que caen ahí se re-descargan en
          // cada release — por eso el saldo hay que MEDIRLO, no asumirlo, y por eso
          // `sonner` se queda: es eager de verdad (el <Toaster/> de App) y estable.
          'vendor-ui': ['sonner'],
        }
      }
    },
    // [P3-VITE-CHUNK-WARNING-THRESHOLD · 2026-05-15] Cap reducido 500→300.
    // El cap default de Vite es 500 KB; bajarlo a 300 captura regresiones
    // de entry chunks que crecen accidentalmente (ej. import estático de
    // una lib pesada en lugar de dynamic import). Los chunks intencionalmente
    // lazy (html2pdf-*.js ~976KB, P2-LAZY-PDF) seguirán emitiendo warning
    // en cada build — es esperado y se ignora; la señal útil es cuando
    // aparece un NUEVO chunk > 300 KB. Si la señal/ruido empeora, override
    // per-chunk con `output.manualChunks` arriba.
    chunkSizeWarningLimit: 300,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: true,
    // [P1-VITEST-WORKER-STABILITY · 2026-08-20] Sin este tope, vitest arranca
    // ~11 forks (nucleos - 1) y CADA uno monta jsdom + la app entera. En esta
    // maquina (12 nucleos, 16,9 GB, ~3,6 GB libres con el editor abierto) los
    // workers se MUEREN: "Worker exited unexpectedly".
    //
    // Lo grave no es que fallen, es COMO fallan: tres corridas seguidas dieron
    // 247, 258 y 265 archivos. Los que no llegan a ejecutarse simplemente NO
    // aparecen -- el resumen dice "255 passed" sin mencionar que faltan diez.
    // Un total menor se lee igual de verde que el total completo, y el gate del
    // deploy se apoya en eso. Es la misma forma del falso verde que
    // P1-CI-GATE-INCONCLUSIVE cerro en pytest, al otro lado del mismo gate.
    //
    // Medido, no supuesto: con 4 workers, dos corridas consecutivas dieron
    // 265/265 archivos y 2.697/2.697 tests, exit 0 y cero errores. Cuesta ~130 s
    // frente a ~98 s. Treinta segundos por una cifra en la que se puede confiar
    // es un cambio barato; el que sale caro es desplegar con la suite a medias.
    //
    // Knob por si otra maquina aguanta mas (o menos): VITEST_MAX_WORKERS.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 4,
    minWorkers: 1,
    // [P1-4 · COVERAGE-REPORT-ONLY · 2026-07-09] @vitest/coverage-v8 en modo
    // REPORT-ONLY: thresholds en 0 → nunca falla CI (informa, no bloquea).
    // Publica lcov (artefacto CI) + text-summary (consola). Excluye targets no-
    // ejecutables (tests, config, tipos ambient, scaffolds) para que el % refleje
    // codigo de producto, no ruido. Correr con `vitest run --coverage`.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      all: false,
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
      exclude: [
        'node_modules/**',
        'dist/**',
        'e2e/**',
        'coverage/**',
        'src/**/*.test.{js,jsx}',
        'src/**/__tests__/**',
        'src/setupTests.js',
        'src/types/**',
        '**/*.config.{js,mjs,ts}',
        'scripts/**',
      ],
    },
    // [P1-VITEST-EXCLUDE-E2E · 2026-06-25] Los specs de `e2e/` son Playwright
    // (necesitan navegador + servidor levantado) — el glob default de vitest
    // (`**/*.spec.js`) los recogía y fallaban en el run unitario. Se ejecutan
    // aparte con `npm run test:e2e` (playwright test). Preservamos los excludes
    // default de vitest (no se importa configDefaults para no acoplar el build).
    exclude: [
      '**/node_modules/**', '**/dist/**', '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'e2e/**',
      // [P1-IOS-NATIVE-SHELL] proyecto Xcode de Capacitor (trae su propia copia de dist).
      'ios/**',
    ],
  },
  }
})
