// [P1-APEX-PRECACHE-BLIND · 2026-08-14] Qué NO entra al precache del Service
// Worker, y un guard que descubre al siguiente intruso sin que haya que
// predecirlo.
//
// EL PROBLEMA. Medido el 2026-08-14 sobre el bundle real: el precache del apex
// eran 119 entradas / 2.252 KiB raw / **721,7 KiB por la red**. Tres entradas se
// llevaban 237,0 KiB gz —un tercio— y NINGUNA puede ejecutarse jamás en la
// portada:
//
//   · @sentry-internal/replay (115,5 KiB gz) — `shouldAttachSentryReplay()` lo
//     prohíbe en el apex desde P1-LANDING-OBS-PAPER, del mismo día.
//   · @neondatabase/auth + zod (87,1 KiB gz) — el apex no consulta sesión nunca
//     (`isApexHost()`, P3-APEX-NO-SESSION).
//   · unified/micromark/mdast (34,4 KiB gz) — markdown, sólo del chat.
//
// POR QUÉ EL FILTRO EXISTENTE NO PODÍA VERLOS. `custom-sw.js` filtraba con una
// lista negra de NOMBRES DE PÁGINA (`Dashboard|AgentPage|Pantry|…`). Los tres son
// chunks `index-<hash>.js`: vendor anónimo, sin nombre de página que casar. No es
// que el filtro se equivocara — es que no tenía con qué verlos. Y la lista crecía
// a mano: cada página nueva había que acordarse de añadirla.
//
// LA DECISIÓN, Y POR QUÉ ES MÁS SIMPLE DE LO QUE PARECE. No hace falta filtrar
// por host: estas tres familias no deberían precachearse para NINGUNO de los dos.
// El precache existe para el app-shell offline, y las tres son funciones que
// REQUIEREN red para servir de algo — subir un replay, autenticarse contra Neon,
// pedirle una respuesta al LLM. Precachearlas no compra offline; compra bytes.
//
// LA ASIMETRÍA QUE HACE SEGURO EQUIVOCARSE. Un falso positivo (excluir algo que
// sí hacía falta) cuesta UNA petición de red de una función que ya necesitaba
// red. Un falso negativo cuesta bytes en cada instalación. Ninguno rompe nada:
// un chunk fuera del precache se sirve por red igual (degradación graciosa, ya
// documentada en `custom-sw.js`). Por eso la clasificación puede ser una lista
// declarada, mientras la GENERALIDAD la aporta el guard de abajo.
//
// Guard: backend/tests/test_p1_apex_precache_blind.py
//        src/__tests__/PrecacheAudience.p1_apex_precache_blind.test.js

/**
 * Familias que NO se precachean, identificadas por PAQUETES MARCADORES.
 *
 * Un marcador es un paquete que existe *sólo* para esa función: si aparece en un
 * chunk, ese chunk es de esa función. `@sentry-internal/replay` no lo usa nada
 * más que el replay; `micromark-core-commonmark` nada más que el markdown.
 *
 * ⚠️ POR QUÉ NO ES UNA REGLA DE DOMINANCIA. El primer intento midió «≥50% de los
 * módulos del chunk pertenecen a la familia» y **no atrapó el chunk de replay**:
 * Rollup mete ahí también medio `@sentry/core` (311.858 B de fuente) porque
 * `addIntegration` lo necesita, y el core diluía la proporción por debajo del
 * umbral. La lección: en un chunk mixto, la parte pesada y la parte que lo
 * identifica no son la misma, así que medir volumen responde otra pregunta.
 *
 * Un marcador puede arrastrar de rebote paquetes genéricos que comparten chunk
 * —`zod` viaja con el SDK de auth— y eso es correcto: lo que se excluye es el
 * chunk, y el chunk entero sólo se carga cuando se usa la función.
 */
export const FAMILIAS_NO_PRECACHEABLES = [
    {
        id: 'sentry-replay',
        // El vídeo de sesión. Sin red no se sube; en el apex no se carga siquiera.
        marcadores: ['@sentry-internal/replay', '@sentry-internal/replay-canvas', '@sentry-internal/feedback'],
        gate: 'shouldAttachSentryReplay() — P1-LANDING-OBS-PAPER',
    },
    {
        id: 'auth-sdk',
        // Login. Sin red no hay autenticación posible, así que offline no aporta.
        marcadores: ['@neondatabase/auth', '@neondatabase/auth-ui', '@neondatabase/neon-js', 'better-auth'],
        gate: 'isApexHost() — P3-APEX-NO-SESSION',
    },
    {
        id: 'markdown',
        // Render de markdown del chat. Sin red no hay respuesta que renderizar.
        marcadores: ['micromark-core-commonmark', 'mdast-util-from-markdown', 'mdast-util-to-hast',
            'hast-util-to-jsx-runtime', 'unified'],
        gate: 'LazyMarkdown — sólo el chat',
    },
    {
        // [P1-I18N-DASHBOARD · 2026-08-15] Los catálogos de idioma: 244 KiB gz
        // entre los cuatro. El guard los cazó en su primer build, que es
        // exactamente para lo que existe.
        //
        // Por qué NO se precachean: el apex es la portada de marketing y está
        // escrita en español —no se migró a i18n—, así que ninguna de estas
        // 2.254 claves tiene nada que traducir ahí. Un visitante anónimo se
        // bajaría los cuatro idiomas en la instalación del SW para una página
        // que no usa ninguno.
        //
        // Y quien SÍ los necesita no los echa de menos: `loadLocale()` sólo
        // dispara desde el I18nProvider cuando la preferencia guardada no es
        // es-DO, o sea tras haber entrado al dashboard al menos una vez. En esa
        // primera visita el chunk se descarga por red y a partir de ahí lo
        // sirve la caché normal del navegador. Lo único que se pierde es tener
        // el idioma disponible OFFLINE en la primera carga tras cambiarlo, que
        // es una ventana de segundos.
        //
        // `es-DO` no aparece aquí porque no tiene catálogo: es el fallback, y
        // sus textos ya viajan dentro del código como claves.
        id: 'i18n-catalogs',
        marcadores: [],
        rutas: ['src/i18n/locales/'],
        gate: 'loadLocale() — sólo con preferencia ≠ es-DO, P1-I18N-DASHBOARD',
    },
];

const _norm = (id) => String(id || '').split('\\').join('/');

/** `node_modules/@scope/pkg/...` → `@scope/pkg`; `node_modules/pkg/...` → `pkg`. */
const _paqueteDe = (id) => {
    const m = /node_modules\/(@[^/]+\/[^/]+|[^/]+)/.exec(_norm(id));
    return m ? m[1] : null;
};

/**
 * La familia que MARCA un chunk, o null.
 *
 * Basta con que aparezca un marcador: ver el razonamiento en
 * `FAMILIAS_NO_PRECACHEABLES`.
 */
export function familiaMarcada(moduleIds) {
    const ids = (moduleIds || []).map(_norm);
    const paquetes = new Set(ids.map(_paqueteDe).filter(Boolean));

    for (const familia of FAMILIAS_NO_PRECACHEABLES) {
        if ((familia.marcadores || []).some((m) => paquetes.has(m))) return familia.id;
        // [P1-I18N-DASHBOARD · 2026-08-15] Marcador por RUTA DE FUENTE, además
        // de por paquete. Los catálogos de idioma son código propio
        // (`src/i18n/locales/*.json`), así que `_paqueteDe` devuelve null para
        // ellos y una regla que solo mire `node_modules/` no puede verlos —
        // exactamente el punto ciego que P1-APEX-PRECACHE-BLIND documentó para
        // los chunks `index-<hash>` anónimos, con otra causa.
        if ((familia.rutas || []).some((r) => ids.some((id) => id.includes(r)))) return familia.id;
    }
    return null;
}

/**
 * Nombres de fichero a excluir del precache, derivados del bundle real.
 *
 * Del bundle y no de una lista escrita a mano por la misma razón que
 * `landingHead.mjs`: los chunks llevan hash de contenido, así que cualquier lista
 * literal caduca en el siguiente deploy — y falla EN SILENCIO, que es la peor
 * forma de fallar.
 */
export function chunksNoPrecacheables(bundle) {
    const trozos = Object.values(bundle || {}).filter((c) => c && c.type === 'chunk');

    // El shell eager es intocable: entry + todo lo que el entry importa de forma
    // ESTÁTICA. Si un marcador acabara ahí, el problema es que algo se volvió
    // eager — y excluirlo del precache lo taparía en vez de mostrarlo.
    const intocables = new Set();
    for (const c of trozos) {
        if (!c.isEntry) continue;
        intocables.add(c.fileName);
        for (const dep of c.imports || []) intocables.add(dep);
    }

    const fuera = new Set();
    for (const salida of trozos) {
        if (intocables.has(salida.fileName)) continue;
        if (!familiaMarcada(salida.moduleIds)) continue;
        fuera.add(salida.fileName);
        for (const css of salida.viteMetadata?.importedCss || []) fuera.add(css);
    }
    return fuera;
}

/**
 * EL GUARD, y la parte que de verdad importa.
 *
 * Lo anterior arregla los tres intrusos de hoy. Esto descubre el de mañana sin
 * que nadie tenga que preverlo: si entra al precache un chunk por encima del
 * umbral que no esté explícitamente revisado, el build FALLA y obliga a tomar la
 * decisión. Convierte en explícito el silencio que dejó pasar 237 KiB.
 *
 * @param {Array<{url:string}>} manifest Entradas del precache ya generadas.
 * @param {(url:string)=>number} pesoGz  Peso comprimido de cada URL.
 * @param {{umbralKb?:number, revisados?:string[]}} opts
 * @returns {{ok: boolean, intrusos: Array<{url:string, kb:number}>}}
 */
export function auditarPesoPrecache(manifest, pesoGz, opts = {}) {
    const umbral = (opts.umbralKb ?? 30) * 1024;
    // Se comparan por PREFIJO sin hash: `assets/vendor-react-` casa con cualquier
    // build. Un nombre con hash aquí volvería a caducar cada deploy.
    const revisados = opts.revisados || [];
    const esRevisado = (url) => revisados.some((p) => url.startsWith(p));

    const intrusos = [];
    for (const entrada of manifest || []) {
        const url = typeof entrada === 'string' ? entrada : entrada?.url || '';
        if (!url || esRevisado(url)) continue;
        const peso = pesoGz(url);
        if (peso > umbral) intrusos.push({ url, kb: +(peso / 1024).toFixed(1) });
    }
    intrusos.sort((a, b) => b.kb - a.kb);
    return { ok: intrusos.length === 0, intrusos };
}
