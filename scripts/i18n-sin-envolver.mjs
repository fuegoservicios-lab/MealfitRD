/**
 * [P1-I18N-GATE-CIEGO-SIN-T · 2026-08-21] El negativo de `i18n-check.mjs`.
 *
 * ── El problema que resuelve ─────────────────────────────────────────────────
 * `i18n-check.mjs` extrae las claves de las llamadas `t()`/`tn()` y compara esa
 * lista contra los catálogos. Es exacto para lo que mide, y lo que mide es el
 * denominador que él mismo define: **una cadena que nunca se envolvió en `t()`
 * no entra en `liveKeys`, luego no puede faltar**. Peor, hasta hoy el bucle hacía
 *
 *     if (!/\bt\(|\btn\(/.test(src)) continue;
 *
 * así que un fichero sin UNA SOLA llamada `t()` ni siquiera se abría. Medido: 8
 * utils de etiquetas (planWeeks, shelfLife, authErrors, chunkStatus, chunkKinds,
 * foodSearch, routeMeta, todayRemaining) con 0 llamadas y español puro dentro,
 * invisibles para un gate que reportaba «100,0 % en los 4 idiomas».
 *
 * El comentario del gate en `run_ci.ps1` atribuía las ocho superficies en español
 * del 2026-08-20 a que «i18n:check sólo corría cuando alguien se acordaba», y
 * concluía que ponerlo en estricto lo cerraba. No lo cierra: aquellas eran de la
 * forma «nunca fue clave» —P1-HIST-DIAS-I18N: `History.jsx` era el único sitio
 * con el array de días crudo— y estricto no puede ver eso. Esta es la mitad que
 * faltaba.
 *
 * ── Cómo decide ──────────────────────────────────────────────────────────────
 * Dos filtros que se multiplican, y el segundo es el que evita el ruido:
 *
 *   1. POSICIÓN de alto rendimiento: texto JSX, atributos que el usuario lee o
 *      escucha (`title`, `aria-label`, `placeholder`, `alt`), propiedades de copy
 *      (`label`, `description`, `cta`, `hint`, …), el primer argumento de
 *      `toast.*()` y el `return` de un helper. Un literal español en cualquiera
 *      de esas posiciones es copy con una probabilidad altísima.
 *   2. MARCA de español: acento/eñe/`¿¡`, o una palabra funcional castellana
 *      como palabra completa.
 *
 * Lo que YA pasa por `t()`/`tn()` se excluye en el AST, no por texto: los
 * argumentos literales de esas llamadas se saltan. Sin eso,
 * `t('<strong>Aviso:</strong> …')` sería un falso positivo — y este repo tiene
 * seis precedentes en agosto de «un comentario derrotó al guard», todos por
 * filtrar con texto lo que había que filtrar con estructura.
 *
 * ── Por qué arranca en AVISO ─────────────────────────────────────────────────
 * Hay ~245 cadenas vivas. Ponerlo en error de golpe deja el gate rojo el día uno
 * y entrena a saltárselo, que es la lección que este repo ya escribió con
 * `P1-CI-GATE-PASSABLE`. Arranca como TRINQUETE: el número puede bajar, nunca
 * subir, y el día que llegue a 0 pasa a error. La lista vive en
 * `i18n-sin-envolver.baseline.json` con su fichero y su recuento, así que una
 * cadena nueva en un fichero limpio se ve en el diff.
 *
 * ── Escotilla ────────────────────────────────────────────────────────────────
 * Marcador en línea, en la propia línea o en las 3 anteriores:
 *
 *     // [I18N-EXEMPT: nombre de alimento, SSOT del motor]
 *
 * La razón es obligatoria y de al menos 4 caracteres. Es el mismo trato que
 * `P2-LOGGER-EXEMPT` le da a los `print()`: una excepción sin motivo escrito es
 * indistinguible de un silenciamiento por prisa.
 */
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';

// ---------------------------------------------------------------------------
// Marca de español
// ---------------------------------------------------------------------------
// Dos vías. La primera es prueba directa (ningún texto inglés lleva `ñ` ni `¿`).
// La segunda pide una palabra funcional CASTELLANA como palabra completa: son
// palabras que no aparecen sueltas en inglés, así que el falso positivo caro
// —una cadena inglesa marcada como española— es muy improbable.
const ACENTO = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/;
const FUNCIONAL = new RegExp(
    '(^|[^\\p{L}])(?:para|con|sin|del|los|las|una|unos|unas|tus|que|por|este|esta|estos|estas'
    + '|hay|tiene|tienes|puedes|desde|hasta|cuando|donde|porque|pero|cada|ninguna|ningun'
    + '|nuestro|nuestra|tu|su|sus|al|de|la|el|en|se|le|lo|es|son|ya|aun|muy|todo|toda'
    + '|todos|todas|otro|otra|mismo|misma|sobre|entre|entre|entonces|tambien|solo|entra'
    + '|anade|elige|revisa|guarda|cancela|volver|cerrar|abrir|siguiente|anterior)([^\\p{L}]|$)',
    'iu',
);

/** ¿Este literal es copy en español? Conservador en LONGITUD, no en marca: una
 *  cadena de una letra o puramente numérica/simbólica nunca es copy. */
export function pareceEspanol(texto) {
    const s = String(texto || '').trim();
    if (s.length < 3) return false;
    if (!/\p{L}/u.test(s)) return false;          // solo cifras/símbolos
    if (/^[\p{Lu}\p{N}_.:-]+$/u.test(s)) return false;  // SCREAMING_CASE, ids, siglas
    if (/^(?:https?:|\/|#|@|data:|\.)/.test(s)) return false;  // rutas, urls, selectores
    if (ACENTO.test(s)) return true;
    // La palabra funcional sola no basta: **una palabra funcional sin espacio no
    // es una frase, es un identificador**. Sin esta condición, `'es-DO'` se
    // reportaba como copy español por el `es` — medido, era el único falso
    // positivo de la tanda de identificadores. No cuesta nada en recall: una
    // palabra suelta sin acento (`'Guardar'`, `'Nevera'`) tampoco la detectaba la
    // rama funcional, porque ninguna es palabra funcional.
    return FUNCIONAL.test(s) && /\s/.test(s);
}

// ---------------------------------------------------------------------------
// Posiciones de alto rendimiento
// ---------------------------------------------------------------------------
const ATRIBUTOS = new Set([
    'title', 'aria-label', 'aria-description', 'aria-placeholder',
    'aria-valuetext', 'aria-roledescription', 'placeholder', 'alt', 'label',
]);

const PROPIEDADES = new Set([
    'label', 'description', 'title', 'hint', 'sub', 'cta', 'placeholder',
    'message', 'texto', 'text', 'body', 'ayuda', 'leyenda', 'subtitulo',
    'tooltip', 'aviso', 'error', 'nombre', 'resumen', 'detalle',
]);

const NODOS_FUNCION = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
    'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod',
]);

/** El texto de un literal de cadena o de un template sin partes dinámicas. */
function textoLiteral(nodo) {
    if (!nodo) return null;
    if (nodo.type === 'StringLiteral') return nodo.value;
    if (nodo.type === 'TemplateLiteral') {
        // Las partes fijas de un template SÍ son copy: `Tienes ${n} planes` deja
        // «Tienes » y « planes» a la vista del usuario. Se concatenan para juzgar
        // la cadena entera; lo interpolado no es asunto de este detector.
        return nodo.quasis.map((q) => q.value.cooked ?? q.value.raw).join(' ');
    }
    return null;
}

function esLlamadaT(nodo) {
    return nodo
        && nodo.type === 'CallExpression'
        && nodo.callee
        && nodo.callee.type === 'Identifier'
        && (nodo.callee.name === 't' || nodo.callee.name === 'tn');
}

function esLlamadaToast(nodo) {
    if (!nodo || nodo.type !== 'CallExpression') return false;
    const c = nodo.callee;
    if (!c) return false;
    if (c.type === 'Identifier') return c.name === 'toast' || c.name === 'confirmToast';
    if (c.type === 'MemberExpression' && c.object && c.object.type === 'Identifier') {
        return c.object.name === 'toast';
    }
    return false;
}

// ---------------------------------------------------------------------------
// Escotilla
// ---------------------------------------------------------------------------
const EXENCION = /\[I18N-EXEMPT:\s*([^\]]{4,})\]/;

/** ¿La línea `linea` (1-based) está exenta? Se mira ella y las 3 anteriores, el
 *  mismo radio que usa `P2-LOGGER-EXEMPT`. */
function exenta(lineas, linea) {
    for (let i = Math.max(0, linea - 4); i < linea; i++) {
        if (EXENCION.test(lineas[i] || '')) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Detección
// ---------------------------------------------------------------------------
/**
 * @returns {{linea:number, texto:string, posicion:string}[]}
 */
export function detectarEnFuente(src) {
    let ast;
    try {
        ast = parse(src, {
            sourceType: 'module',
            errorRecovery: true,
            plugins: ['jsx', 'typescript', 'classProperties', 'decorators-legacy'],
        });
    } catch {
        return [];   // no parsea ⇒ no inventamos hallazgos
    }

    const lineas = src.split('\n');
    const hallazgos = [];
    const vistos = new Set();

    const anotar = (nodo, posicion) => {
        const texto = textoLiteral(nodo);
        if (texto === null || !pareceEspanol(texto)) return;
        const linea = nodo.loc ? nodo.loc.start.line : 0;
        const id = `${linea}:${texto}`;
        if (vistos.has(id)) return;
        if (exenta(lineas, linea)) return;
        vistos.add(id);
        hallazgos.push({ linea, texto: texto.trim().slice(0, 120), posicion });
    };

    // Los literales que YA son argumento de `t()`/`tn()` se marcan para saltarlos.
    // Se hace por IDENTIDAD DE NODO, no por texto: filtrar por texto es lo que
    // convierte a `t('<strong>Aviso:</strong>')` en un falso positivo.
    const yaTraducidos = new Set();

    const visitar = (nodo) => {
        if (!nodo || typeof nodo.type !== 'string') return;

        if (esLlamadaT(nodo)) {
            for (const arg of nodo.arguments || []) {
                if (arg && (arg.type === 'StringLiteral' || arg.type === 'TemplateLiteral')) {
                    yaTraducidos.add(arg);
                }
            }
        }

        if (esLlamadaToast(nodo)) {
            const primero = (nodo.arguments || [])[0];
            if (primero && !yaTraducidos.has(primero)) anotar(primero, 'toast');
        }

        if (nodo.type === 'JSXText') {
            const texto = nodo.value;
            if (pareceEspanol(texto)) {
                const linea = nodo.loc ? nodo.loc.start.line : 0;
                const limpio = texto.trim().replace(/\s+/g, ' ');
                const id = `${linea}:${limpio}`;
                if (!vistos.has(id) && !exenta(lineas, linea)) {
                    vistos.add(id);
                    hallazgos.push({ linea, texto: limpio.slice(0, 120), posicion: 'jsx-text' });
                }
            }
        }

        if (nodo.type === 'JSXAttribute' && nodo.name) {
            const nombre = nodo.name.type === 'JSXNamespacedName'
                ? `${nodo.name.namespace.name}:${nodo.name.name.name}`
                : nodo.name.name;
            if (ATRIBUTOS.has(nombre) && nodo.value) {
                const v = nodo.value.type === 'JSXExpressionContainer'
                    ? nodo.value.expression
                    : nodo.value;
                if (v && !yaTraducidos.has(v)) anotar(v, `attr:${nombre}`);
            }
        }

        if ((nodo.type === 'ObjectProperty' || nodo.type === 'Property') && nodo.key && !nodo.computed) {
            const nombre = nodo.key.name || nodo.key.value;
            if (PROPIEDADES.has(nombre) && nodo.value && !yaTraducidos.has(nodo.value)) {
                anotar(nodo.value, `prop:${nombre}`);
            }
        }

        // TABLA DE COPY. La forma más común del bug en este repo y la que la lista
        // de nombres de propiedad no puede ver, porque sus claves son el DOMINIO,
        // no el rol:
        //
        //     const CHUNK_STATUS_LABELS = { completed: 'Completado', pending: 'En cola' };
        //
        // El indicio no es cómo se llama la clave: es que un mismo objeto tenga
        // DOS O MÁS valores que parecen frases en español. Un objeto de
        // configuración no los tiene; una tabla de rótulos, sí. Con uno solo no
        // basta —sería un umbral de ruido— y por eso se exige el par.
        if (nodo.type === 'ObjectExpression') {
            const candidatos = (nodo.properties || []).filter((p) => {
                if (!p || (p.type !== 'ObjectProperty' && p.type !== 'Property')) return false;
                if (yaTraducidos.has(p.value)) return false;
                const texto = textoLiteral(p.value);
                return texto !== null && pareceEspanol(texto);
            });
            if (candidatos.length >= 2) {
                for (const p of candidatos) anotar(p.value, 'tabla-de-copy');
            }
        }

        // Asignación a una variable de copy: `label = 'Caduca hoy'`, y su gemela
        // declarada. `shelfLife.js` construye así los cuatro rótulos de caducidad,
        // dentro de un if/else, donde no hay ni objeto ni return que mirar.
        if (nodo.type === 'AssignmentExpression' && nodo.left
            && nodo.left.type === 'Identifier' && PROPIEDADES.has(nodo.left.name)
            && !yaTraducidos.has(nodo.right)) {
            anotar(nodo.right, `asig:${nodo.left.name}`);
        }
        if (nodo.type === 'VariableDeclarator' && nodo.id
            && nodo.id.type === 'Identifier' && PROPIEDADES.has(nodo.id.name)
            && nodo.init && !yaTraducidos.has(nodo.init)) {
            anotar(nodo.init, `var:${nodo.id.name}`);
        }

        if (nodo.type === 'ReturnStatement' && nodo.argument && !yaTraducidos.has(nodo.argument)) {
            anotar(nodo.argument, 'return');
        }

        for (const clave of Object.keys(nodo)) {
            if (clave === 'loc' || clave === 'leadingComments'
                || clave === 'trailingComments' || clave === 'innerComments') continue;
            const valor = nodo[clave];
            if (Array.isArray(valor)) {
                for (const hijo of valor) {
                    if (hijo && typeof hijo.type === 'string') visitar(hijo);
                }
            } else if (valor && typeof valor.type === 'string') {
                visitar(valor);
            }
        }
    };

    // Dos pasadas: la primera sólo recoge los argumentos de `t()`/`tn()`, para que
    // un `t()` que aparezca DESPUÉS en el fichero también proteja a su literal.
    // Con una sola pasada el orden del recorrido decidiría el resultado, y un
    // detector cuyo veredicto depende del orden de lectura no es un detector.
    const prepasar = (nodo) => {
        if (!nodo || typeof nodo.type !== 'string') return;
        if (esLlamadaT(nodo)) {
            for (const arg of nodo.arguments || []) {
                if (arg && (arg.type === 'StringLiteral' || arg.type === 'TemplateLiteral')) {
                    yaTraducidos.add(arg);
                }
            }
        }
        for (const clave of Object.keys(nodo)) {
            if (clave === 'loc' || clave === 'leadingComments'
                || clave === 'trailingComments' || clave === 'innerComments') continue;
            const valor = nodo[clave];
            if (Array.isArray(valor)) {
                for (const hijo of valor) if (hijo && typeof hijo.type === 'string') prepasar(hijo);
            } else if (valor && typeof valor.type === 'string') prepasar(valor);
        }
    };
    prepasar(ast.program);
    visitar(ast.program);

    hallazgos.sort((a, b) => a.linea - b.linea);
    return hallazgos;
}

export function detectarEnArchivo(ruta) {
    return detectarEnFuente(readFileSync(ruta, 'utf8'));
}

export { NODOS_FUNCION };
