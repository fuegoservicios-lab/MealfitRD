/**
 * [P1-I18N-DASHBOARD · 2026-08-15] Validador de catálogos de idioma.
 *
 * ── Por qué este script NO es opcional ───────────────────────────────────────
 * El motor usa el texto español COMO clave (`t('Guardar')`, no
 * `t('settings.save')`). Eso compra tres cosas grandes: es-DO no descarga
 * catálogo, una cadena sin traducir muestra español en vez de una clave en
 * crudo, y una migración a medias deja pantallas coherentes.
 *
 * Y cuesta una: **cambiar el copy español huérfana su traducción EN SILENCIO**.
 * Nadie ve un error; simplemente el francés vuelve al español en esa línea, y
 * solo se detecta si alguien navega en francés hasta esa pantalla. Ese es el
 * único fallo de este diseño, y no se cierra con disciplina — se cierra aquí.
 * Sin este script, «la clave es el español» es una trampa; con él, una red.
 *
 * ── Qué reporta ──────────────────────────────────────────────────────────────
 *   HUÉRFANAS  (error)   clave en un catálogo que YA NO existe en el código.
 *                        Casi siempre significa que alguien tocó el copy
 *                        español y dejó atrás 4 traducciones muertas.
 *   FALTANTES  (info, o error con --strict)
 *                        clave viva sin traducir en ese idioma. Durante la
 *                        migración es el estado normal (cae a español); en CI
 *                        con --strict es lo que exige cobertura completa.
 *   t() EN ÁMBITO DE MÓDULO (error)
 *                        `t()` evaluado al importar, fuera de un componente o
 *                        función. Corre ANTES de que el catálogo esté cargado,
 *                        así que se congela en español para siempre — y encima
 *                        parece que funciona, porque en es-DO se ve bien. Es el
 *                        bug más difícil de ver de todo el sistema.
 *
 * Uso:
 *   node scripts/i18n-check.mjs            # huérfanas + módulo-scope → falla
 *   node scripts/i18n-check.mjs --strict   # además exige 100% de cobertura
 *   node scripts/i18n-check.mjs --json     # salida legible por máquina
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// [P1-I18N-EXTRACTOR-AST · 2026-08-21] Declarado en devDependencies a propósito.
// Hasta hoy llegaba de rebote por `@vitejs/plugin-react` → `@babel/core`, y un
// gate apoyado en un transitivo muere con ERR_MODULE_NOT_FOUND en el siguiente
// bump del lockfile sin que nadie lo haya decidido.
import { parse } from '@babel/parser';
// [P1-I18N-GATE-CIEGO-SIN-T · 2026-08-21] El NEGATIVO de este script: lo que
// nunca se envolvió en `t()`. Ver la cabecera de esos dos módulos.
import { detectarEnFuente, clavesNoLiterales } from './i18n-sin-envolver.mjs';
import { clasificarAlcance } from './i18n-alcance.mjs';
import { sinComentarios } from './lib/sin-comentarios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');
const LOCALES_DIR = join(SRC, 'i18n', 'locales');

const STRICT = process.argv.includes('--strict');
const AS_JSON = process.argv.includes('--json');
const WRITE_TEMPLATE = process.argv.includes('--write-template');
// [P1-I18N-GATE-CIEGO-SIN-T · 2026-08-21] Reescribe el trinquete de literales sin
// envolver con el estado de hoy. Se invoca a mano y deja el cambio en el diff:
// una línea que baja es una mejora que hay que poder ver; una que sube, un
// retroceso que hay que poder discutir.
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
// [P3-I18N-TRINQUETE-SIN-COMPROBACION-DE-DIRECCION · 2026-08-22] Subir el trinquete deja de
// ser gratis y silencioso: hay que decirlo, y entonces sale escrito en el log.
const ALLOW_RATCHET_UP = process.argv.includes('--allow-ratchet-up');
const BASELINE_PATH = join(__dirname, 'i18n-sin-envolver.baseline.json');

// SSOT de idiomas: se lee de locales.js en vez de repetir la lista.
const LOCALES_SRC = readFileSync(join(SRC, 'i18n', 'locales.js'), 'utf8');
const DEFAULT_LOCALE = (LOCALES_SRC.match(/DEFAULT_LOCALE\s*=\s*'([^']+)'/) || [])[1];
const ALL_CODES = [...LOCALES_SRC.matchAll(/\{\s*code:\s*'([^']+)'/g)].map((m) => m[1]);
const TARGET_CODES = ALL_CODES.filter((c) => c !== DEFAULT_LOCALE);

if (!DEFAULT_LOCALE || ALL_CODES.length === 0) {
    console.error('[i18n:check] No pude leer la lista de idiomas de src/i18n/locales.js.');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Recolección de archivos
// ---------------------------------------------------------------------------
function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
            if (entry === '__tests__' || entry === 'node_modules' || entry === 'i18n') continue;
            walk(p, out);
        } else if (/\.(jsx?|tsx?)$/.test(entry) && !/\.test\./.test(entry)) {
            out.push(p);
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Extracción de claves
// ---------------------------------------------------------------------------
// Regex y no un parser AST: las llamadas que nos interesan son literales de
// cadena en la primera posición (o primera y segunda en `tn`). Un template
// literal o una variable NO es traducible por definición — la clave tiene que
// ser estática para poder existir en un catálogo — así que quedan fuera a
// propósito. [P2-I18N-CLAVE-NO-LITERAL-INVISIBLE-PARA-LAS-DOS-MITADES · 2026-08-23]
// Este comentario decía «se reportan aparte como sospechosas» y NO había ni una línea
// que lo hiciera: las formas con literales dentro (ternario, template, concat, const
// pelada) eran invisibles para esta regex Y para el escáner de sin-envolver. Ahora
// las reporta `clavesNoLiterales` (AST, i18n-sin-envolver.mjs) como fallo duro.
const T_CALL = /(?<![\w.])t\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;
const TN_CALL = /(?<![\w.])tn\(\s*[^,]+,\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*,\s*(['"])((?:(?!\3)[^\\]|\\.)*)\3/g;
// [P1-DISPLAY-VOCAB-CERRADO · 2026-08-21] `i18nKey('…')` declara una clave que se
// resuelve en otro sitio (una tabla de rótulos con `t(sec.titleKey)`). Sin esto, esa
// clave sale HUÉRFANA en los cuatro catálogos y el mensaje del gate invita a borrar
// justo la traducción que hace falta.
//
// NO cuenta como violación de ámbito de módulo: es identidad pura, no lee el catálogo,
// así que ponerla en un `const` de módulo no congela nada. Esa es toda la diferencia
// con `t()`, y es la razón de que exista.
const KEY_DECL = /(?<![\w.])i18nKey\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;

function unescape(s) {
    return s.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
}

/** Un solo escaneo, dos respuestas: profundidad de llaves antes del offset y si
 *  ese offset cae DENTRO de un comentario o de una cadena.
 *
 *  [P1-HIST-DIAS-I18N · 2026-08-19] Lo segundo se añadió porque el matcher lee la
 *  fuente CRUDA: un `t('Domingo')` citado dentro de un comentario —justo el que
 *  explica esta misma trampa— se reportaba como llamada en ámbito de módulo. Un
 *  guard que obliga a censurar la prosa que lo documenta es un guard que alguien
 *  acaba desactivando. [P3-I18N-CLAVE-MUERTA-QUE-EL-GATE-DECLARA-VIVA · 2026-08-23]
 *  Esta nota decía que la extracción de claves NO vaciaba comentarios «porque una clave
 *  mencionada solo en un comentario sigue contando como viva, y vaciarlos la volvería
 *  huérfana y rompería el gate» — eso era el DEFECTO descrito como propiedad: una clave
 *  que sólo cita un comentario ESTÁ muerta, y el gate la declaraba viva. Ahora la
 *  extracción lee `sinComentarios(src)` (scripts/lib). Medido al cerrarlo: 2 claves. */
function scanAt(src, index) {
    let depth = 0;
    let inStr = null;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = 0; i < index; i++) {
        const c = src[i];
        const n = src[i + 1];
        if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
        if (inBlockComment) { if (c === '*' && n === '/') { inBlockComment = false; i++; } continue; }
        if (inStr) {
            if (c === '\\') { i++; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '/' && n === '/') { inLineComment = true; i++; continue; }
        if (c === '/' && n === '*') { inBlockComment = true; i++; continue; }
        if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') depth--;
    }
    return { depth, inComment: inLineComment || inBlockComment, inStr: inStr !== null };
}

/** Offsets de las llamadas `t()`/`tn()` que corren AL IMPORTAR, vía AST.
 *
 *  [P1-I18N-EXTRACTOR-AST · 2026-08-21] Esto lo decidía un contador de llaves, y
 *  era ciego al ejemplo que la propia doc usa para explicar la trampa:
 *
 *      const TABS = [{ label: t('Plan') }];   // ❌ congelado en español
 *
 *  Un literal de objeto o de array TAMBIÉN abre llave, así que toda tabla de copy
 *  —la forma real del bug; nadie escribe `const X = t('...')` suelto— salía con
 *  `depth >= 1` y no se reportaba. Medido antes del cambio: cazaba 1 de 3 formas.
 *
 *  La pregunta «¿esto corre al importar?» es «¿hay una función entre la llamada y
 *  la raíz del módulo?», y eso no lo responde un contador de llaves: lo responde
 *  un AST. De regalo desaparece el caso del comentario (un `t('x')` citado en
 *  prosa no es un CallExpression, así que no existe para el walker) sin necesidad
 *  del filtro que hubo que añadir a mano en P1-HIST-DIAS-I18N.
 *
 *  Devuelve `null` si el fichero no parsea; el llamador cae al heurístico viejo
 *  en vez de quedarse ciego. */
const NODOS_FUNCION = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
    'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod',
]);

function moduleScopeCallOffsets(src) {
    let ast;
    try {
        ast = parse(src, {
            sourceType: 'module',
            errorRecovery: true,
            plugins: ['jsx', 'typescript', 'classProperties', 'decorators-legacy'],
        });
    } catch {
        return null;
    }
    const offsets = new Set();
    const visitar = (nodo, dentroDeFuncion) => {
        if (!nodo || typeof nodo.type !== 'string') return;
        if (
            !dentroDeFuncion
            && nodo.type === 'CallExpression'
            && nodo.callee
            && nodo.callee.type === 'Identifier'
            && (nodo.callee.name === 't' || nodo.callee.name === 'tn')
        ) {
            offsets.add(nodo.callee.start);
        }
        // El nodo función en sí vive en el ámbito de fuera; su CUERPO no.
        const siguiente = dentroDeFuncion || NODOS_FUNCION.has(nodo.type);
        for (const clave of Object.keys(nodo)) {
            if (clave === 'loc' || clave === 'leadingComments'
                || clave === 'trailingComments' || clave === 'innerComments') continue;
            const valor = nodo[clave];
            if (Array.isArray(valor)) {
                for (const hijo of valor) {
                    if (hijo && typeof hijo.type === 'string') visitar(hijo, siguiente);
                }
            } else if (valor && typeof valor.type === 'string') {
                visitar(valor, siguiente);
            }
        }
    };
    visitar(ast.program, false);
    return offsets;
}

/** ¿La llamada en `index` corre al importar?
 *
 *  Con AST disponible la respuesta es exacta. Sin él (fichero que no parsea) cae
 *  al heurístico de llaves de siempre: filtra por comentario y NO por cadena,
 *  porque el escáner marca todo lo que hay entre backticks como cadena y excluir
 *  `inStr` se tragaría los `${t('Foo')}` de un template literal, que son llamadas
 *  REALES. Cambiar un falso positivo por un falso negativo no es arreglar nada. */
function isModuleScopeCode(src, index, offsets) {
    if (offsets) return offsets.has(index);
    const { depth, inComment } = scanAt(src, index);
    return depth === 0 && !inComment;
}

const files = walk(SRC);
const keys = new Map();          // clave → [archivos]
const pluralKeys = new Set();    // claves que se usan con tn()
const moduleScopeHits = [];      // { file, key }

// [P1-I18N-GATE-CIEGO-SIN-T · 2026-08-21] Aquí vivía
//
//     if (!/\bt\(|\btn\(|\bi18nKey\(/.test(src)) continue;
//
// y era el corazón del punto ciego: un fichero sin UNA SOLA llamada `t()` ni se
// abría. Medido: 8 utils de etiquetas (planWeeks, shelfLife, authErrors,
// chunkStatus, chunkKinds, foodSearch, routeMeta, todayRemaining) con español
// puro dentro, invisibles para un gate que cantaba «100,0 % en los 4 idiomas».
// El coste de abrirlos todos es de milisegundos; el de saltárselos era no ver la
// mitad del problema.
const contenidos = new Map();
for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(SRC, file).replace(/\\/g, '/');
    contenidos.set(rel, src);
    // [P3-I18N-KEYDECL-TRAS-EL-FILTRO-BARATO · 2026-08-22] `i18nKey` entra en el filtro.
    //
    // `P1-I18N-GATE-CIEGO-SIN-T` quitó de aquí el `\bi18nKey\(` al reducir el filtro, y con
    // eso la extracción de declaraciones quedó DETRÁS de una puerta que no las deja pasar:
    // un fichero que sólo DECLARA claves —el patrón `{ titleKey: i18nKey('Montaje') }`, que
    // resuelve otro— ni se abría. Su traducción aparecía entonces como HUÉRFANA en los
    // cuatro idiomas, y el mensaje del gate invita literalmente a borrarla.
    //
    // Es el mismo defecto que ese P-fix cerró, un nivel más abajo: no ver un fichero porque
    // no contiene la forma que esperabas.
    if (!/\bt\(|\btn\(|\bi18nKey\(/.test(src)) continue;
    const modOffsets = moduleScopeCallOffsets(src);
    // [P3-I18N-CLAVE-MUERTA-QUE-EL-GATE-DECLARA-VIVA] las claves se extraen del CÓDIGO, no de la prosa.
    const codigo = sinComentarios(src);

    for (const m of codigo.matchAll(T_CALL)) {
        const key = unescape(m[2]);
        if (!key) continue;
        if (!keys.has(key)) keys.set(key, []);
        if (!keys.get(key).includes(rel)) keys.get(key).push(rel);
        if (isModuleScopeCode(src, m.index, modOffsets)) moduleScopeHits.push({ file: rel, key });
    }
    for (const m of codigo.matchAll(KEY_DECL)) {
        const key = unescape(m[2]);
        if (!key) continue;
        if (!keys.has(key)) keys.set(key, []);
        if (!keys.get(key).includes(rel)) keys.get(key).push(rel);
        // sin `moduleScopeHits`: ver el comentario de KEY_DECL
    }
    for (const m of codigo.matchAll(TN_CALL)) {
        // La clave de un plural es la forma «other» (el 2º literal).
        const other = unescape(m[4]);
        if (!other) continue;
        if (!keys.has(other)) keys.set(other, []);
        if (!keys.get(other).includes(rel)) keys.get(other).push(rel);
        pluralKeys.add(other);
        if (isModuleScopeCode(src, m.index, modOffsets)) moduleScopeHits.push({ file: rel, key: other });
    }
}

// ---------------------------------------------------------------------------
// Glosario: el mismo sustantivo, la misma palabra (P3-I18N-SIN-GLOSARIO · 2026-08-21)
// ---------------------------------------------------------------------------
//
// Sin glosario ni memoria entre lotes, cada tanda de traducción reinventa el término.
// MEDIDO sobre los catálogos: el MISMO objeto físico se llama «Nevera», «Despensa» y
// «Alacena» en el copy español, y cada uno recibió su propia traducción —
// fridge/pantry/cupboard, frigo/garde-manger/placard—. Y fr-FR usa «frigo» en casi todos
// los sitios y «réfrigérateur» en el escáner, para la misma cosa.
//
// Es un TRINQUETE y no un fallo duro a propósito: hay reformulaciones legítimas —una
// frase que rodea el sustantivo en vez de nombrarlo— y un guard que grita con cada una
// se apaga en una semana. Ya se pagó esa lección en el landing (27 avisos → 14 reales).
// Lo que impide es que el número SUBA.
const GLOSARIO_PATH = join(SRC, 'i18n', 'glosario.json');
const BASELINE_GLOSARIO = join(__dirname, 'i18n-glosario.baseline.json');

const sinAcentos = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Desvíos del glosario por idioma, o `null` si no hay glosario. */
function revisarGlosario(catalogosPorCodigo) {
    if (!existsSync(GLOSARIO_PATH)) return null;
    const glosario = JSON.parse(readFileSync(GLOSARIO_PATH, 'utf8'));
    const porIdioma = {};

    for (const code of TARGET_CODES) {
        const cat = catalogosPorCodigo[code];
        if (!cat) continue;
        const desvios = [];
        for (const [termino, spec] of Object.entries(glosario)) {
            if (termino.startsWith('_') || !spec || typeof spec !== 'object') continue;
            const esperada = spec[code];
            if (!esperada) continue;
            // El término y sus sinónimos españoles apuntan a LA MISMA palabra: eso es
            // justo lo que impide que tres nombres del mismo objeto acaben en tres
            // traducciones distintas.
            const nombres = [termino, ...(spec.alias || [])].map(sinAcentos);
            const quiere = sinAcentos(esperada);
            for (const [k, v] of Object.entries(cat)) {
                // [P3-I18N-SIN-GLOSARIO · placeholders 2026-08-22] Los `{plato}` y
                // `{plan}` se quitan ANTES de buscar el término: el nombre de un
                // placeholder es un IDENTIFICADOR, no prosa — el traductor lo copia tal
                // cual y debe hacerlo. Medido: 22 de los 39 desvíos italianos que
                // quedaban eran exactamente eso.
                //
                // Es la tercera cara del mismo error en dos días —«sal» dentro de
                // «salt», «plan» dentro de `plan_chunk_queue`, y ahora «plato» dentro de
                // `{plato}`—: un término del producto puede aparecer donde no está
                // hablando de sí mismo.
                const clave = sinAcentos(k).replace(/\{[^}]*\}/g, ' ');
                // [P3-I18N-SIN-GLOSARIO · frontera 2026-08-21] Por PALABRA, no por
                // subcadena. `plan_chunk_queue` contiene «plan» y no es la palabra
                // «Plan»: es el nombre de una tabla, y el traductor lo deja igual a
                // propósito. Sin la frontera, cada mención de un identificador del
                // sistema contaba como desvío del glosario.
                //
                // Es la MISMA clase que `P3-DISPLAY-SUBSTRING-SIN-FRONTERA` cerró el
                // mismo día en el validador de `_display` («sal» dentro de «salt»).
                // Aparece en sitios distintos porque un `includes` es fácil de
                // escribir y el fallo no se ve hasta que un dato concreto lo destapa.
                //
                // `String.raw` y no un template literal a secas: dentro de un template
                // el parser se come la barra y la clase queda `[w]` —la LETRA w—, así
                // que `plan_chunk_queue` seguía casando y el guard PARECÍA arreglado.
                // Me pasó dos veces seguidas contando escapes a mano.
                if (!nombres.some((termino) => new RegExp(
                    String.raw`(?<![\w])`
                    + termino.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
                    + String.raw`(?![\w])`,
                ).test(clave))) continue;
                // [P3-I18N-GLOSARIO-ALCANCE-RECORTADO · 2026-08-22] LAS DOS formas del
                // plural, no sólo `other`.
                //
                // Un plural es una clave con dos textos y el glosario sólo miraba uno: una
                // traducción podía usar el término pactado en «2 platos» y otro distinto en
                // «1 plato», y el desvío no existía para el gate. Es el mismo hueco que
                // `P1-I18N-GATE-VALOR` cerró en el cotejo de catálogos —medir que la clave
                // existe no es medir que sirve— aplicado a la mitad de una clave.
                //
                // Se exige el término en CADA forma presente, no en su concatenación: unir
                // los dos textos y buscar una vez deja pasar justo el caso que esto busca.
                //
                // Medido antes de escribirlo: con las dos formas salen los MISMOS 16
                // desvíos. Cero stock oculto — se arregla el mecanismo, no una deuda.
                const formas = typeof v === 'string'
                    ? [v]
                    : [v && v.one, v && v.other].filter((x) => typeof x === 'string' && x);
                if (!formas.length) continue;
                if (formas.some((f) => !sinAcentos(f).includes(quiere))) {
                    desvios.push({ termino, clave: k });
                }
            }
        }
        porIdioma[code] = desvios;
    }
    return porIdioma;
}

// ---------------------------------------------------------------------------
// Cotejo contra catálogos
// ---------------------------------------------------------------------------
const liveKeys = new Set(keys.keys());
const report = { locales: {}, moduleScope: moduleScopeHits, totalKeys: liveKeys.size };
const catalogosLeidos = {};   // los reusa el chequeo de glosario, para no releerlos
let hardFail = false;

for (const code of TARGET_CODES) {
    const path = join(LOCALES_DIR, `${code}.json`);
    if (!existsSync(path)) {
        console.error(`[i18n:check] Falta el catálogo ${code}.json (declarado en locales.js).`);
        hardFail = true;
        continue;
    }
    let catalog;
    try {
        catalog = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
        console.error(`[i18n:check] ${code}.json no es JSON válido: ${e.message}`);
        hardFail = true;
        continue;
    }

    catalogosLeidos[code] = catalog;

    const catKeys = new Set(Object.keys(catalog));
    const orphans = [...catKeys].filter((k) => !liveKeys.has(k));
    const missing = [...liveKeys].filter((k) => !catKeys.has(k));

    // [P1-I18N-GATE-VALOR · 2026-08-21] Hasta hoy este bloque medía que la CLAVE
    // existiera y nunca que el valor SIRVIERA. Medido sobre este mismo script:
    // poner `""` en una clave viva daba «100.0% · 0 faltan · ✅» y exit 0 en
    // ESTRICTO. Pasaban por traducidos `""`, `"   "`, `null`, `0`, `[]`, `{}`,
    // `{one:'',other:''}` y un plural sin `one`.
    //
    // Y no era hipotético: lo escribe ESTE script. `--write-template` (abajo)
    // rellena las faltantes con `''` / `{one:'',other:''}` directamente en el
    // catálogo que se despacha, y `i18n-batches.mjs` lo invoca en cada `split`
    // mientras su `merge` DESCARTA los vacíos en vez de completarlos. Toda clave
    // que el traductor no devolviera quedaba en blanco con `missing = 0` para
    // siempre.
    //
    // El usuario no ve un hueco —el motor cae al español— así que el defecto es
    // el FALSO VERDE: la cobertura es el único número con el que alguien decide
    // si un idioma está listo, y un 100% que incluye blancos no mide cobertura.
    const util = (v, esPlural) => {
        if (esPlural) {
            if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
            // Las DOS formas. Un `{other}` sin `one` traduce en singular igual que
            // el plural declarado como cadena que este check ya cazaba: era la
            // misma clase de fallo mirada en una sola dirección.
            return typeof v.one === 'string' && v.one.trim() !== ''
                && typeof v.other === 'string' && v.other.trim() !== '';
        }
        return typeof v === 'string' && v.trim() !== '';
    };
    // [P2-I18N-GATE-CIEGO-PLACEHOLDER · 2026-08-22] …y que el valor CONSERVE lo que la
    // clave interpola.
    //
    // El bloque de arriba mide que el valor exista y sirva. No miraba los `{placeholders}`,
    // y ésos no son estilo: son el contrato entre la cadena y el código que la llama.
    //
    //   · Un placeholder PERDIDO borra el dato de la pantalla. «Te quedan {n} comidas» sin
    //     `{n}` deja «Te quedan comidas»: una frase que parece correcta y no dice nada.
    //   · Un placeholder INVENTADO se pinta LITERAL —`_interpolate` sólo sustituye las
    //     claves que le pasan— así que el usuario ve `{dias}` en crudo en su pantalla.
    //
    // Las dos formas se cuelan enteras por el check de cobertura, porque la clave existe y
    // el valor es una cadena no vacía. Y ninguna la ve una revisión en es-DO, que no pasa
    // por el catálogo.
    //
    // [P3-I18N-CHECK-SIN-MARCADO · 2026-08-22] Y lo mismo con el MARCADO. Nueve claves
    // llevan HTML que entra al `innerHTML` del PDF; una traducción que se deja un
    // `</strong>` rompe el documento a partir de ahí. El validador de secuencia de tags
    // existía SÓLO en la herramienta de merge, o sea que vigilaba la puerta por la que
    // entran las traducciones nuevas y no el estado del catálogo.
    const _placeholders = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).slice().sort().join(',');
    const _tags = (s) => (String(s).match(/<\/?[a-zA-Z][^>]*>/g) || [])
        .map((x) => x.replace(/\s[^>]*/, '').toLowerCase()).join('>');
    const _formas = (v) => (typeof v === 'string' ? [v]
        : (v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v).filter((x) => typeof x === 'string') : []));

    const motivo = (k) => {
        const v = catalog[k];
        const esPlural = pluralKeys.has(k);
        if (!util(v, esPlural)) {
            const esObjeto = v !== null && typeof v === 'object' && !Array.isArray(v);
            if (esPlural && !esObjeto) return 'plural declarado como valor simple';
            if (!esPlural && esObjeto) return 'clave simple declarada como objeto de plural';
            if (esPlural) return 'plural sin sus dos formas {one, other} rellenas';
            return 'valor vacío o no textual';
        }
        const espPh = _placeholders(k);
        const espTags = _tags(k);
        for (const forma of _formas(v)) {
            if (_placeholders(forma) !== espPh) {
                return `placeholders distintos de la clave (esperaba [${espPh || '—'}], tiene [${_placeholders(forma) || '—'}])`;
            }
            if (_tags(forma) !== espTags) {
                return `secuencia de etiquetas HTML distinta de la clave (esperaba [${espTags || '—'}], tiene [${_tags(forma) || '—'}])`;
            }
        }
        return null;
    };
    // Solo sobre las claves VIVAS del catálogo: una huérfana ya se cuenta aparte,
    // y restarla dos veces desfasaría la cobertura hacia abajo.
    const inservibles = [...catKeys]
        .filter((k) => liveKeys.has(k))
        .map((k) => ({ key: k, motivo: motivo(k) }))
        .filter((x) => x.motivo);

    const traducidas = catKeys.size - orphans.length - inservibles.length;

    report.locales[code] = {
        translated: traducidas,
        missing: missing.length,
        orphans,
        unusable: inservibles,
        coverage: liveKeys.size ? (traducidas / liveKeys.size) : 1,
    };

    if (orphans.length) hardFail = true;
    // Falla SIEMPRE, con o sin `--strict`. Permisivo tolera lo AUSENTE a propósito
    // (una migración a medias cae a español y deja pantallas coherentes); un valor
    // inservible no es «todavía no traducido», es una clave que YA se procesó y
    // salió vacía — siempre un error de la herramienta o del traductor.
    if (inservibles.length) hardFail = true;
    if (STRICT && missing.length) hardFail = true;

    if (WRITE_TEMPLATE && missing.length) {
        // Rellena el catálogo con las faltantes en blanco, para que el traductor
        // vea exactamente qué falta sin reconstruir la lista a mano. Cadena
        // vacía ⇒ el motor cae al español (`typeof hit === 'string' && hit !== ''`).
        const next = { ...catalog };
        for (const k of missing) next[k] = pluralKeys.has(k) ? { one: '', other: '' } : '';
        const ordered = Object.fromEntries(Object.keys(next).sort().map((k) => [k, next[k]]));
        writeFileSync(path, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
    }
}

if (moduleScopeHits.length) hardFail = true;

// ---------------------------------------------------------------------------
// [P1-I18N-GATE-CIEGO-SIN-T · 2026-08-21] Lo que NUNCA se envolvió en `t()`
// ---------------------------------------------------------------------------
// Todo lo de arriba mide el denominador que este script define: las claves que ya
// pasan por `t()`. Esto mide el otro lado. Arranca como TRINQUETE y no como error
// porque hay 153 cadenas vivas dentro del alcance: ponerlo en rojo el día uno
// entrena a saltarse el gate, que es la lección de P1-CI-GATE-PASSABLE. El número
// puede bajar, nunca subir; el día que llegue a 0, pasa a error.
const { dentro: ficherosEnAlcance } = clasificarAlcance();
const enAlcance = new Set(ficherosEnAlcance);

// [P2-I18N-GATE-SIN-REGLA-FORMATO-CLAVADO · 2026-08-22] Un locale escrito a mano.
//
// La migración de los formateadores clavados aterrizó y el trinquete que el propio plan
// pedía no se escribió nunca: un `toLocaleString('es-DO')` nuevo entra hoy con el gate en
// verde, y pinta separadores dominicanos en las cuatro traducciones — en pt-BR la coma es
// DECIMAL, así que no es cosmético.
//
// MEDIDO antes de escribir la regla: en `src/` quedan DIEZ apariciones y NUEVE son
// comentarios que documentan el arreglo. Código real: **una**. O sea que esto no es una
// migración pendiente disfrazada de regla — es sólo la regla, y por eso el detector tiene
// que saltarse los comentarios: si no, la documentación del arreglo dispara el guard que
// el arreglo instaló. Es la misma trampa que ya ha costado once falsos rojos este mes.
//
// La excepción es `SupermarketPage.jsx`: la página del supermercado es superficie
// SÓLO-ESPAÑOL por decisión de alcance (el landing no se traduce), así que ahí un `es-DO`
// fijo es correcto y no una omisión. Se nombra el fichero, no se relaja la regla.
// [P2-I18N-GATE-FORMATO-CIEGO-A-CUATRO-FORMAS · 2026-08-23] La regla sólo cazaba el literal
// `'xx-XX'`, y MEDIDO hoy sobre `src/` eso da CERO. Las formas que sí había vivas:
//   · sin argumento — `n.toLocaleString()` formatea con el idioma del NAVEGADOR, no el de la
//     app (1 viva: ResetPassword, una cifra de filtraciones);
//   · dos letras — `'es'` (0 hoy, pero es la forma más fácil de escribir);
//   · `localeCompare` sin locale — ordena con el navegador (7 vivas: Nevera ×4, lista del
//     PDF ×1, y 2 que NO son para pintar: comparan inventarios serializados).
// La forma «por variable» (`Intl.NumberFormat(_locale, …)`) NO se prohíbe: es el motor
// mismo, en `src/i18n/index.js`, y es donde tiene que estar.
//
// El `localeCompare` se prohíbe SÓLO en código que pinta. Los dos de `useRegeneratePlan`
// ordenan para COMPARAR dos snapshots, y ésos deben ser estables y no seguir al idioma:
// migrarlos a `compareText` sería un error. Se reconocen por la PROPIEDAD (el resultado
// entra en un `JSON.stringify(`, no en una lista), no por el nombre del fichero.
const LOCALE_CLAVADO = /(?:toLocale(?:Date|Time)?String|Intl\.(?:NumberFormat|DateTimeFormat|RelativeTimeFormat|ListFormat|DisplayNames))\(\s*['"][a-z]{2}(?:-[A-Z]{2})?['"]/;
const LOCALE_DEL_NAVEGADOR = /\.toLocale(?:Date|Time)?String\(\s*\)/;
// Sin locale (navegador) O con locale CLAVADO (`'es'`, `'es-DO'`): las dos esquivan el
// idioma activo. La segunda es justo lo que P3-I18N-ORDEN-NOMBRES-ES-CLAVADO quitó ayer y
// mi primera versión de esta regla no veía — lo cazó la mutación M2.
const ORDEN_DEL_NAVEGADOR = /\blocaleCompare\(\s*[A-Za-z_$][\w$.]*\s*(?:\)|,\s*['"][a-z]{2}(?:-[A-Z]{2})?['"])/;
const ORDEN_PARA_COMPARAR = /JSON\.stringify\(/;   // no se pinta: debe ser estable
const FORMATO_EXENTO = new Set([
    // Superficie sólo-español por alcance: el landing no se traduce.
    //
    // La ruta va SIN el prefijo `src/`: las claves de `contenidos` son relativas a esa
    // carpeta. Escribirla con prefijo dejaba la exención inerte y el gate rojo por un
    // fichero que está bien — un falso rojo enseña a apagar el gate.
    'pages/SupermarketPage.jsx',
]);

const formatosClavados = [];
for (const [rel, src] of contenidos) {
    if (FORMATO_EXENTO.has(rel.replace(/\\/g, '/'))) continue;
    src.split('\n').forEach((linea, i) => {
        const limpia = linea.trimStart();
        // Sólo CÓDIGO. Un comentario que cita el patrón está documentando por qué no se
        // usa, y ponerse rojo por eso enseña a no documentarlo.
        if (limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*')
            || limpia.startsWith('{/*')) return;
        if (LOCALE_CLAVADO.test(linea)) {
            formatosClavados.push(`${rel}:${i + 1}: ${limpia.slice(0, 100)}`);
        } else if (LOCALE_DEL_NAVEGADOR.test(linea)) {
            formatosClavados.push(`${rel}:${i + 1}: [locale del NAVEGADOR] ${limpia.slice(0, 90)}`);
        } else if (ORDEN_DEL_NAVEGADOR.test(linea) && !ORDEN_PARA_COMPARAR.test(linea)
                   && !rel.replace(/\\/g, '/').startsWith('i18n/')) {
            formatosClavados.push(`${rel}:${i + 1}: [orden del NAVEGADOR] usa compareText — ${limpia.slice(0, 80)}`);
        }
    });
}
if (formatosClavados.length) {
    hardFail = true;
    console.error('');
    console.error('❌ LOCALE CLAVADO EN UN FORMATEADOR — usa `formatDate`/`formatNumber`/');
    console.error('   `formatCurrency` de `src/i18n`, que leen el idioma ACTIVO.');
    console.error('   Un locale fijo pinta separadores dominicanos en las cuatro');
    console.error('   traducciones, y en pt-BR la coma es DECIMAL.');
    for (const f of formatosClavados) console.error(`     ${f}`);
    console.error('');
}

// [P2-I18N-CLAVE-NO-LITERAL-INVISIBLE-PARA-LAS-DOS-MITADES · 2026-08-23] La tercera
// mirada (ver `clavesNoLiterales` en i18n-sin-envolver.mjs). Fallo DURO y no trinquete:
// el árbol está a 0 y una clave que no puede vivir en un catálogo no es deuda, es una
// cadena nueva en español que las otras dos mitades declaran «100,0 %».
const clavesOpacas = [];
for (const [rel, src] of contenidos) {
    if (!enAlcance.has(rel)) continue;
    for (const h of clavesNoLiterales(src)) {
        clavesOpacas.push(`${rel}:${h.linea}: [${h.forma}] ${h.texto}`);
    }
}
if (clavesOpacas.length) {
    hardFail = true;
    console.error('');
    console.error('❌ CLAVE DE t() QUE NO PUEDE VIVIR EN UN CATÁLOGO — invisible para el');
    console.error('   extractor Y para el escáner de español sin envolver. Saca el t() a');
    console.error("   cada rama (`ok ? t('A') : t('B')`), interpola con `t('… {n}', {n})`,");
    console.error("   o declara la clave con `i18nKey('…')`.");
    for (const c of clavesOpacas) console.error(`     ${c}`);
    console.error('');
}

const sinEnvolverPorArchivo = {};
let sinEnvolverTotal = 0;
for (const [rel, src] of contenidos) {
    if (!enAlcance.has(rel)) continue;
    const hallazgos = detectarEnFuente(src);
    if (hallazgos.length) {
        sinEnvolverPorArchivo[rel] = hallazgos.length;
        sinEnvolverTotal += hallazgos.length;
    }
}

// [P2-I18N-TRINQUETE-DESAPARECE-EN-SILENCIO · 2026-08-22] Un trinquete que se apaga solo no
// es un trinquete.
//
// Antes: si el fichero faltaba o no parseaba, `baseline = null`, el bloque de retrocesos no
// corría y el gate salía VERDE. O sea que la forma más fácil de desactivar la única defensa
// contra el español sin envolver era BORRAR un fichero — y nada lo decía. El pytest que lo
// ancla hace `skip` cuando no lo encuentra, así que tampoco avisaba.
//
// Ahora la ausencia y la corrupción son fallo duro, y sólo `--update-baseline` (que existe
// justo para (re)crearlo) las perdona. Es la misma regla que este repo ya tiene escrita para
// el gate de CI: «no concluyente» no puede colapsar a verde.
let baseline = null;
if (existsSync(BASELINE_PATH)) {
    try {
        baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    } catch (e) {
        if (!UPDATE_BASELINE) {
            console.error(`\n❌ El trinquete de español sin envolver no es JSON válido: ${e.message}`);
            console.error('   Sin él, el gate NO puede detectar un retroceso y saldría verde por omisión.');
            console.error('   Arréglalo, o regenéralo a conciencia con `node scripts/i18n-check.mjs --update-baseline`.');
            hardFail = true;
        }
        baseline = null;
    }
} else if (!UPDATE_BASELINE) {
    console.error(`\n❌ Falta el trinquete de español sin envolver (${relative(join(__dirname, '..'), BASELINE_PATH)}).`);
    console.error('   Sin él, el gate NO puede detectar un retroceso y saldría verde por omisión —');
    console.error('   borrar este fichero era la forma más fácil de desactivar la defensa, en silencio.');
    console.error('   Si es la primera vez, créalo con `node scripts/i18n-check.mjs --update-baseline`.');
    hardFail = true;
}

if (UPDATE_BASELINE) {
    // [P3-I18N-TRINQUETE-SIN-COMPROBACION-DE-DIRECCION · 2026-08-22] «Puede BAJAR, nunca
    // subir» vivía SÓLO en el comentario del fichero. `--update-baseline` reescribía el
    // valor sin mirar, así que la forma de convertir un rojo en verde era ejecutar el
    // comando que el propio mensaje de error sugiere.
    //
    // No se prohíbe subirlo —hay casos legítimos: una tanda que añade una pantalla nueva a
    // medio traducir— pero deja de ser gratis y silencioso: hay que decirlo con
    // `--allow-ratchet-up`, y entonces la subida sale escrita en el log y en el diff.
    const subidas = [];
    if (baseline) {
        for (const [rel, n] of Object.entries(sinEnvolverPorArchivo)) {
            const previo = (baseline.porArchivo || {})[rel] ?? 0;
            if (n > previo) subidas.push(`${rel}: ${previo} → ${n}`);
        }
    }
    if (subidas.length && !ALLOW_RATCHET_UP) {
        console.error('\n❌ `--update-baseline` SUBIRÍA el trinquete en estos ficheros:');
        for (const s of subidas) console.error(`     · ${s}`);
        console.error('   El trinquete puede BAJAR, nunca subir: eso es lo que lo hace un trinquete.');
        console.error('   Si de verdad quieres subirlo (una pantalla nueva a medio traducir), dilo:');
        console.error('     node scripts/i18n-check.mjs --update-baseline --allow-ratchet-up');
        process.exit(1);
    }
    const ordenado = Object.fromEntries(
        Object.entries(sinEnvolverPorArchivo).sort(([a], [b]) => a.localeCompare(b))
    );
    writeFileSync(BASELINE_PATH, JSON.stringify({
        _comentario: 'Trinquete de P1-I18N-GATE-CIEGO-SIN-T: literales en español, DENTRO '
            + 'del alcance, que nunca pasaron por t(). Puede BAJAR, nunca subir. '
            + 'Regenerar con `node scripts/i18n-check.mjs --update-baseline` y '
            + 'revisar el diff: una línea que baja es una pantalla traducida.',
        total: sinEnvolverTotal,
        porArchivo: ordenado,
    }, null, 2) + '\n', 'utf8');
    console.log(`[i18n:check] trinquete reescrito: ${sinEnvolverTotal} en ${Object.keys(ordenado).length} archivos.`);
}

const retrocesos = [];
if (baseline && !UPDATE_BASELINE) {
    // Por FICHERO y no sólo por total: si uno mejora y otro empeora, el total
    // puede quedar igual y el retroceso pasar inadvertido. Un trinquete que sólo
    // mira la suma no es un trinquete, es un promedio.
    for (const [rel, n] of Object.entries(sinEnvolverPorArchivo)) {
        const previo = (baseline.porArchivo || {})[rel] ?? 0;
        if (n > previo) retrocesos.push({ rel, previo, ahora: n });
    }
}
if (retrocesos.length) hardFail = true;

// --- Glosario: mismo trinquete, por IDIOMA -----------------------------------
// Por idioma y no por total, por la misma razón que el de arriba va por fichero: si el
// francés mejora y el italiano empeora, la suma queda igual y el retroceso pasa
// inadvertido. Un trinquete que sólo mira la suma es un promedio.
const glosarioPorIdioma = revisarGlosario(catalogosLeidos) || {};
const glosarioConteo = Object.fromEntries(
    Object.entries(glosarioPorIdioma).map(([code, d]) => [code, d.length])
);

// [P2-I18N-TRINQUETE-GLOSARIO-SIN-NINGUNA-DE-LAS-DOS-DEFENSAS-DE-SU-GEMELO · 2026-08-23]
// Su gemelo de 80 líneas más arriba ya tiene las dos defensas, y éste ninguna. MEDIDO:
// borrar `i18n-glosario.baseline.json` → exit 0; corromperlo → exit 0. Un trinquete que
// se apaga al borrar su fichero no es un trinquete. Y `--update-baseline` lo subía sin
// pedir `--allow-ratchet-up`: en-US 3 → N y en silencio. Mismas dos defensas, misma forma.
let baseGlosario = null;
if (existsSync(BASELINE_GLOSARIO)) {
    try {
        baseGlosario = JSON.parse(readFileSync(BASELINE_GLOSARIO, 'utf8'));
    } catch (e) {
        if (!UPDATE_BASELINE) {
            console.error(`\n❌ El trinquete del glosario no es JSON válido: ${e.message}`);
            console.error('   Sin él, el gate NO puede detectar una deriva del glosario y saldría verde por omisión.');
            console.error('   Arréglalo, o regenéralo a conciencia con `node scripts/i18n-check.mjs --update-baseline`.');
            hardFail = true;
        }
        baseGlosario = null;
    }
} else if (!UPDATE_BASELINE) {
    console.error(`\n❌ Falta el trinquete del glosario (${relative(join(__dirname, '..'), BASELINE_GLOSARIO)}).`);
    console.error('   Sin él, el gate NO puede detectar una deriva y saldría verde por omisión.');
    console.error('   Si es la primera vez, créalo con `node scripts/i18n-check.mjs --update-baseline`.');
    hardFail = true;
}

if (UPDATE_BASELINE) {
    const subidasGlosario = [];
    if (baseGlosario) {
        for (const [code, n] of Object.entries(glosarioConteo)) {
            const previo = (baseGlosario.porIdioma || {})[code] ?? 0;
            if (n > previo) subidasGlosario.push(`${code}: ${previo} → ${n}`);
        }
    }
    if (subidasGlosario.length && !ALLOW_RATCHET_UP) {
        console.error('\n❌ `--update-baseline` SUBIRÍA el trinquete del glosario:');
        for (const s of subidasGlosario) console.error(`     · ${s}`);
        console.error('   El trinquete puede BAJAR, nunca subir. Si de verdad quieres subirlo, dilo:');
        console.error('     node scripts/i18n-check.mjs --update-baseline --allow-ratchet-up');
        process.exit(1);
    }
    writeFileSync(BASELINE_GLOSARIO, JSON.stringify({
        _comentario: 'Trinquete de P3-I18N-SIN-GLOSARIO: claves cuya traducción no usa la '
            + 'palabra pactada en `src/i18n/glosario.json`. Puede BAJAR, nunca subir. '
            + 'No es un fallo duro porque hay reformulaciones legítimas — una frase que '
            + 'rodea el sustantivo en vez de nombrarlo. Regenerar con '
            + '`node scripts/i18n-check.mjs --update-baseline`.',
        porIdioma: glosarioConteo,
    }, null, 2) + '\n', 'utf8');
    console.log(`[i18n:check] trinquete del glosario reescrito: ${JSON.stringify(glosarioConteo)}`);
}

const retrocesosGlosario = [];
if (baseGlosario && !UPDATE_BASELINE) {
    for (const [code, n] of Object.entries(glosarioConteo)) {
        const previo = (baseGlosario.porIdioma || {})[code] ?? 0;
        if (n > previo) retrocesosGlosario.push({ code, previo, ahora: n });
    }
}
if (retrocesosGlosario.length) hardFail = true;

report.glosario = {
    porIdioma: glosarioConteo,
    baseline: baseGlosario ? baseGlosario.porIdioma : null,
    retrocesos: retrocesosGlosario,
    ejemplos: Object.fromEntries(
        Object.entries(glosarioPorIdioma).map(([c, d]) => [c, d.slice(0, 5)])
    ),
};

report.sinEnvolver = {
    total: sinEnvolverTotal,
    baseline: baseline ? baseline.total : null,
    porArchivo: sinEnvolverPorArchivo,
    retrocesos,
};

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------
if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log(`\n[i18n:check] ${liveKeys.size} claves vivas en ${files.length} archivos.\n`);
    console.log('IDIOMA   TRADUCIDAS   FALTAN   HUÉRFANAS   COBERTURA');
    for (const code of TARGET_CODES) {
        const r = report.locales[code];
        if (!r) continue;
        console.log(
            code.padEnd(9) +
            String(r.translated).padEnd(13) +
            String(r.missing).padEnd(9) +
            String(r.orphans.length).padEnd(12) +
            // [P3-I18N-COBERTURA-REDONDEA-A-100 · 2026-08-22] El porcentaje NO puede
            // decir 100.0% si falta algo. `toFixed` REDONDEA: con 2.524 de 2.525 daba
            // «100.0%» junto a un «1» en la columna FALTAN, y la cobertura es el unico
            // numero con el que alguien decide si un idioma esta listo. Se trunca hacia
            // abajo, y el 100 se reserva para el 100 de verdad.
            ((r.missing > 0 || r.orphans.length > 0 || (r.unusable || []).length > 0)
                ? Math.min(99.9, Math.floor(r.coverage * 1000) / 10).toFixed(1)
                : (r.coverage * 100).toFixed(1)) + '%'
        );
    }

    for (const code of TARGET_CODES) {
        const r = report.locales[code];
        if (!r) continue;
        if (r.orphans.length) {
            console.error(`\n❌ ${code}: ${r.orphans.length} clave(s) HUÉRFANA(S) — están en el catálogo pero ya no en el código.`);
            console.error('   Casi siempre: alguien cambió el copy español y dejó la traducción atrás.');
            for (const k of r.orphans.slice(0, 15)) console.error(`     · ${JSON.stringify(k)}`);
            if (r.orphans.length > 15) console.error(`     … y ${r.orphans.length - 15} más`);
        }
        if (r.unusable.length) {
            console.error(`\n❌ ${code}: ${r.unusable.length} clave(s) presentes con un valor INSERVIBLE.`);
            console.error('   Están en el catálogo, así que no cuentan como faltantes — pero el motor');
            console.error('   las descarta y pinta español. Para el usuario son idénticas a no estar,');
            console.error('   y para la cifra de cobertura contaban como traducidas: ese era el bug.');
            console.error('   Si vienen de `--write-template`, es que el lote volvió sin traducir.');
            for (const { key, motivo } of r.unusable.slice(0, 15)) {
                console.error(`     · ${JSON.stringify(key)} — ${motivo}`);
            }
            if (r.unusable.length > 15) console.error(`     … y ${r.unusable.length - 15} más`);
        }
    }

    if (retrocesosGlosario.length) {
        console.error(`\n\u274c GLOSARIO: ${retrocesosGlosario.length} idioma(s) con MÁS desvíos que el trinquete.`);
        console.error('   Un término del producto se tradujo de una forma nueva. Si es');
        console.error('   deliberado, actualiza `src/i18n/glosario.json`; si no, usa la');
        console.error('   palabra pactada — el usuario no sabe que dos nombres son la misma');
        console.error('   pantalla.');
        for (const r of retrocesosGlosario) {
            console.error(`     · ${r.code}: ${r.previo} \u2192 ${r.ahora}`);
            for (const d of (glosarioPorIdioma[r.code] || []).slice(0, 3)) {
                console.error(`         «${d.termino}» en ${JSON.stringify(d.clave.slice(0, 55))}`);
            }
        }
    } else if (Object.keys(glosarioConteo).length) {
        const tot = Object.values(glosarioConteo).reduce((a, b) => a + b, 0);
        console.log(`\n\u2139  glosario: ${tot} desvío(s) tolerado(s) ${JSON.stringify(glosarioConteo)}`);
    }

    if (moduleScopeHits.length) {
        console.error(`\n❌ ${moduleScopeHits.length} llamada(s) a t()/tn() en ÁMBITO DE MÓDULO.`);
        console.error('   Se evalúan al importar, ANTES de que el catálogo exista: quedan');
        console.error('   congeladas en español para siempre y en es-DO parecen correctas.');
        console.error('   Solución: convertir la constante en función y llamarla en render.');
        for (const h of moduleScopeHits.slice(0, 15)) {
            console.error(`     · ${h.file}: ${JSON.stringify(h.key)}`);
        }
        if (moduleScopeHits.length > 15) console.error(`     … y ${moduleScopeHits.length - 15} más`);
    }

    // [P1-I18N-GATE-CIEGO-SIN-T] El trinquete de lo nunca envuelto.
    const se = report.sinEnvolver;
    if (se.retrocesos.length) {
        console.error(`\n❌ ${se.retrocesos.length} archivo(s) con MÁS español sin envolver que antes.`);
        console.error('   Estas cadenas no pasan por t(), así que no existen para el cotejo de');
        console.error('   catálogos: un usuario en inglés las lee en español y la cobertura');
        console.error('   sigue diciendo 100%. Envuélvelas en t(), o si de verdad no deben');
        console.error('   traducirse marca la línea con  // [I18N-EXEMPT: <razón>]');
        // [P2-I18N-ESCANER-RECALL · 2026-08-22] El trinquete llegó a CERO (78 → 0, y con un
        // detector MÁS ancho que el que produjo el 78: de los 78, cuarenta y ocho eran tablas
        // SSOT deliberadas que ahora llevan su marcador). Desde cero, «subió» y «existe» son
        // lo mismo, y el aviso puede decirlo: esto NO es deuda heredada, es tuyo.
        if (se.baseline === 0) {
            console.error('');
            console.error('   ⚠️  El trinquete está en CERO desde P2-I18N-ESCANER-RECALL, así que');
            console.error('   esto no es deuda heredada: la cadena la acabas de introducir tú.');
        }
        for (const r of se.retrocesos) {
            console.error(`     · ${r.rel}: ${r.previo} → ${r.ahora}`);
        }
    } else if (se.baseline !== null && se.total < se.baseline) {
        console.log(`\n🎉 español sin envolver: ${se.baseline} → ${se.total} (${se.baseline - se.total} menos).`);
        console.log('   Baja el trinquete para que no se pueda volver atrás:');
        console.log('     node scripts/i18n-check.mjs --update-baseline');
    } else if (se.total) {
        console.log(`\nℹ  español sin envolver, dentro de alcance: ${se.total} en `
            + `${Object.keys(se.porArchivo).length} archivos (trinquete: ${se.baseline ?? '—'}).`);
    }

    if (!hardFail) console.log('\n✅ Catálogos coherentes.\n');
    else console.error('\n[i18n:check] FALLO — ver arriba.\n');
}

process.exit(hardFail ? 1 : 0);
