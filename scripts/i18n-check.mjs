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

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');
const LOCALES_DIR = join(SRC, 'i18n', 'locales');

const STRICT = process.argv.includes('--strict');
const AS_JSON = process.argv.includes('--json');
const WRITE_TEMPLATE = process.argv.includes('--write-template');

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
// propósito y se reportan aparte como sospechosas.
const T_CALL = /(?<![\w.])t\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;
const TN_CALL = /(?<![\w.])tn\(\s*[^,]+,\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*,\s*(['"])((?:(?!\3)[^\\]|\\.)*)\3/g;

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
 *  acaba desactivando. El filtro NO toca la extracción de claves: una clave
 *  mencionada solo en un comentario sigue contando como viva, como hasta ahora
 *  (vaciar comentarios antes de extraer la volvería huérfana y rompería el gate). */
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

for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!/\bt\(|\btn\(/.test(src)) continue;
    const rel = relative(SRC, file).replace(/\\/g, '/');
    const modOffsets = moduleScopeCallOffsets(src);

    for (const m of src.matchAll(T_CALL)) {
        const key = unescape(m[2]);
        if (!key) continue;
        if (!keys.has(key)) keys.set(key, []);
        if (!keys.get(key).includes(rel)) keys.get(key).push(rel);
        if (isModuleScopeCode(src, m.index, modOffsets)) moduleScopeHits.push({ file: rel, key });
    }
    for (const m of src.matchAll(TN_CALL)) {
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
// Cotejo contra catálogos
// ---------------------------------------------------------------------------
const liveKeys = new Set(keys.keys());
const report = { locales: {}, moduleScope: moduleScopeHits, totalKeys: liveKeys.size };
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
    const motivo = (k) => {
        const v = catalog[k];
        const esPlural = pluralKeys.has(k);
        if (util(v, esPlural)) return null;
        const esObjeto = v !== null && typeof v === 'object' && !Array.isArray(v);
        if (esPlural && !esObjeto) return 'plural declarado como valor simple';
        if (!esPlural && esObjeto) return 'clave simple declarada como objeto de plural';
        if (esPlural) return 'plural sin sus dos formas {one, other} rellenas';
        return 'valor vacío o no textual';
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
            (r.coverage * 100).toFixed(1) + '%'
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

    if (!hardFail) console.log('\n✅ Catálogos coherentes.\n');
    else console.error('\n[i18n:check] FALLO — ver arriba.\n');
}

process.exit(hardFail ? 1 : 0);
