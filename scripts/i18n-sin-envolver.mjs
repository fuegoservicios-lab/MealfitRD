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

// [P2-I18N-ESCANER-RECALL · 2026-08-22] La segunda marca: la MORFOLOGÍA.
//
// `pareceEspanol` exige un diacrítico o una palabra funcional CON espacio, y su comentario
// afirmaba que la rama funcional «no cuesta nada en recall». Costaba 39: los rótulos del
// panel forense del Historial —«Calidad LLM», «Pausado», «Emergencia», «Reintentos
// recovery»— no llevan tilde ni palabra funcional, así que el fichero reportaba CERO
// hallazgos con 39 cadenas en español dentro.
//
// Estas terminaciones no las produce el inglés (`-ción` vs `-tion`, `-idad` vs `-ity`,
// `-miento` vs `-ment`, `-ancia` vs `-ance`), así que el falso positivo caro —una cadena
// inglesa marcada como española— sigue siendo improbable. Aun así NO se mezclan con
// `pareceEspanol`: se usan sólo donde la POSICIÓN ya es evidencia (una tabla de rótulos, un
// `aria-label`, una tupla `[id, rótulo, tipo]`). En un `return` suelto o en texto JSX el
// riesgo no compensa.
const MORFOLOGIA = /(ción|ciones|dad|dades|mente|miento|mientos|ería|eza|anza|ado|ada|ados|adas|ando|endo|aje|ancia|encia|oso|osa|ismo|ista|ivo|iva)$/i;

/** ¿Copy en español, en una posición que YA es evidencia de copy? */
export function pareceEspanolEnPosicionFuerte(texto) {
    const s = String(texto || '').trim();
    if (pareceEspanol(s)) return true;
    if (s.length < 3 || !/\p{L}/u.test(s)) return false;
    if (/^[\p{Lu}\p{N}_.:-]+$/u.test(s)) return false;
    if (/^(?:https?:|\/|#|@|data:|\.)/.test(s)) return false;
    // Un rótulo empieza en mayúscula; `completed` o `okButton` no son rótulos.
    if (!/^[\p{Lu}]/u.test(s)) return false;
    return s.split(/\s+/).some((w) => MORFOLOGIA.test(w.replace(/[^\p{L}]/gu, '')));
}

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

// [P2-I18N-CLAVE-NO-LITERAL-INVISIBLE-PARA-LAS-DOS-MITADES · 2026-08-23] La tercera
// mirada. Una `t()` cuya clave no sea un literal pegado al paréntesis desaparecía de las
// DOS mitades del gate: el extractor de claves (regex: sólo ve `t('…')`) no la ve, y este
// escáner tampoco, porque sus literales ya son argumento de `t()`. Medido antes de
// escribir esto: `t(ok ? 'A' : 'B')`, `t(`…${n}…`)` y `t(K)` con `const K = '…'` dan
// claves `[]` y sin-envolver `[]` — cadena NUEVA en español, cobertura «100,0 %» y ✅.
// `t('a ' + 'b')` es peor: extrae MEDIA clave.
//
// Lo que SÍ es legítimo, y por eso no se marca: `t(identificador)` y `t(obj.prop)`, el
// patrón `i18nKey` (`{ titleKey: i18nKey('Montaje') }` resuelto por `t(sec.titleKey)`).
// El extractor ya recoge esas claves vía `KEY_DECL`. La única excepción dentro de esa
// familia: un identificador que EN ESTE MISMO FICHERO se declara como literal pelado
// (`const K = 'Abre tu nevera'`) — eso es una clave invisible con un nombre delante, y
// el arreglo es declararla con `i18nKey(...)`.
//
// Medido en el árbol al cerrarlo: 0 hallazgos (las 10 no-literales son todas el patrón
// i18nKey), así que en el gate es FALLO DURO, no trinquete.
const _TIPOS_DE_CLAVE_OPACA = new Set(['Identifier', 'MemberExpression', 'OptionalMemberExpression']);

/**
 * Llamadas a `t()`/`tn()` cuya clave no puede vivir en un catálogo tal como está escrita.
 * @param {string} src
 * @returns {{linea:number, texto:string, forma:string}[]}
 */
export function clavesNoLiterales(src) {
    let ast;
    try {
        ast = parse(src, {
            sourceType: 'module',
            errorRecovery: true,
            plugins: ['jsx', 'typescript', 'classProperties', 'decorators-legacy'],
        });
    } catch {
        return [];
    }
    // Identificadores de nivel de módulo declarados como literal pelado.
    const literalesPelados = new Map();
    for (const st of ast.program.body) {
        const decl = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
        if (!decl || decl.type !== 'VariableDeclaration') continue;
        for (const d of decl.declarations) {
            if (d.id && d.id.type === 'Identifier' && d.init && d.init.type === 'StringLiteral') {
                literalesPelados.set(d.id.name, d.init.value);
            }
        }
    }
    const hallazgos = [];
    const visitar = (nodo) => {
        if (!nodo || typeof nodo.type !== 'string') return;
        if (esLlamadaT(nodo)) {
            const indices = nodo.callee.name === 't' ? [0] : [1, 2];
            for (const i of indices) {
                const arg = nodo.arguments[i];
                if (!arg || arg.type === 'StringLiteral') continue;
                if (arg.type === 'TemplateLiteral' && arg.expressions.length === 0) continue;
                const linea = arg.loc ? arg.loc.start.line : 0;
                if (arg.type === 'Identifier' && literalesPelados.has(arg.name)) {
                    hallazgos.push({ linea, texto: `${arg.name} = '${literalesPelados.get(arg.name).slice(0, 60)}'`, forma: 'identificador-a-literal-pelado' });
                    continue;
                }
                if (_TIPOS_DE_CLAVE_OPACA.has(arg.type)) continue;
                const forma = arg.type === 'TemplateLiteral' ? 'template-con-interpolacion'
                    : arg.type === 'ConditionalExpression' ? 'ternario'
                    : arg.type === 'BinaryExpression' ? 'concatenacion'
                    : arg.type === 'LogicalExpression' ? 'logica'
                    : arg.type;
                const texto = src.slice(arg.start, Math.min(arg.end, arg.start + 80)).replace(/\s+/g, ' ');
                hallazgos.push({ linea, texto, forma });
            }
        }
        for (const k in nodo) {
            if (k === 'loc' || k === 'range') continue;
            const v = nodo[k];
            if (Array.isArray(v)) v.forEach(visitar);
            else if (v && typeof v.type === 'string') visitar(v);
        }
    };
    visitar(ast.program);
    return hallazgos;
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
function exentaEnLinea(lineas, linea) {
    for (let i = Math.max(0, linea - 4); i < linea; i++) {
        if (EXENCION.test(lineas[i] || '')) return true;
    }
    return false;
}

/** ¿Está exento este hallazgo, por su línea o por la de su SENTENCIA?
 *
 *  El radio de 3 líneas vale para un hallazgo suelto y no para una tabla. Medido con un
 *  bloque de 12 filas: el marcador puesto encima cubría las dos primeras y dejaba 20
 *  hallazgos fuera. Y la tabla es justo el caso que más necesita la escotilla — el real
 *  es `DOMINICAN_MEALS` (AssessmentContext.jsx), 26 líneas de nombres de platos que
 *  alimentan un objeto `meal` del plan: su `name` acaba resolviéndose contra
 *  `pantry_names_match`, el guard de coherencia y el backstop de alergias, así que
 *  traducirlo rompe las tres, dos de ellas en silencio.
 *
 *  Por eso el marcador puede ir también sobre la SENTENCIA de nivel superior que
 *  contiene el hallazgo: «exime esta tabla entera» es una unidad natural, y escribir el
 *  marcador dieciséis veces sería ruido que nadie mantiene. */
function exenta(lineas, linea, lineaSentencia) {
    if (exentaEnLinea(lineas, linea)) return true;
    if (lineaSentencia && lineaSentencia !== linea) {
        return exentaEnLinea(lineas, lineaSentencia);
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

    // Línea de la sentencia de nivel superior que se está recorriendo. Es lo que
    // permite eximir una tabla entera con un solo marcador encima.
    let lineaSentencia = 0;

    const anotar = (nodo, posicion, fuerte = false) => {
        // [P2-I18N-ESCANER-CIEGO-AL-TERNARIO-EN-PROP-DE-COPY · 2026-08-23] Un literal
        // dentro de un ternario o de un `||` está en la MISMA posición de copy que el nodo
        // que lo contiene: `sub: cond ? 'Alimento · por gramos' : 'Plato criollo'` pinta uno
        // de los dos, siempre. `textoLiteral` devolvía `null` para la expresión entera y el
        // escáner reportaba CERO. Medido: `detectarEnFuente` sobre esa línea → `[]`. Se
        // desdoblan las ramas y cada literal se anota por separado; un `t()` en una rama
        // sigue saltándose por identidad de nodo, como siempre.
        if (nodo && nodo.type === 'ConditionalExpression') {
            anotar(nodo.consequent, posicion, fuerte);
            anotar(nodo.alternate, posicion, fuerte);
            return;
        }
        if (nodo && nodo.type === 'LogicalExpression' && (nodo.operator === '||' || nodo.operator === '??')) {
            anotar(nodo.left, posicion, fuerte);
            anotar(nodo.right, posicion, fuerte);
            return;
        }
        if (nodo && yaTraducidos.has(nodo)) return;
        const texto = textoLiteral(nodo);
        const marca = fuerte ? pareceEspanolEnPosicionFuerte : pareceEspanol;
        if (texto === null || !marca(texto)) return;
        const linea = nodo.loc ? nodo.loc.start.line : 0;
        const id = `${linea}:${texto}`;
        if (vistos.has(id)) return;
        if (exenta(lineas, linea, lineaSentencia)) return;
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
                if (!vistos.has(id) && !exenta(lineas, linea, lineaSentencia)) {
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
                if (v && !yaTraducidos.has(v)) anotar(v, `attr:${nombre}`, true);
            }
        }

        if ((nodo.type === 'ObjectProperty' || nodo.type === 'Property') && nodo.key && !nodo.computed) {
            const nombre = nodo.key.name || nodo.key.value;
            if (PROPIEDADES.has(nombre) && nodo.value && !yaTraducidos.has(nodo.value)) {
                anotar(nodo.value, `prop:${nombre}`, true);
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
                return texto !== null && pareceEspanolEnPosicionFuerte(texto);
            });
            if (candidatos.length >= 2) {
                for (const p of candidatos) anotar(p.value, 'tabla-de-copy', true);
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

        // [P2-I18N-ESCANER-RECALL · 2026-08-22] TUPLA DE RÓTULO: `['id', 'Rótulo', 'tipo']`.
        //
        // Es la forma en la que vivían 28 de los 39 rótulos del panel forense del Historial,
        // y ningún nodo de los de arriba la alcanza: no es una propiedad de objeto, no es un
        // atributo y no es un return. El indicio es la ESTRUCTURA — el primer elemento es un
        // identificador en snake_case y el último un tipo — así que un array de frases
        // sueltas no dispara.
        if (nodo.type === 'ArrayExpression') {
            const els = nodo.elements || [];
            const todosStr = els.length >= 2 && els.length <= 3
                && els.every((e) => e && e.type === 'StringLiteral');
            if (todosStr && /^[a-z][a-z0-9_]*$/.test(els[0].value)) {
                for (let i = 1; i < els.length; i++) {
                    // El último elemento de una tupla de 3 es el TIPO, no copy.
                    if (els.length === 3 && i === 2) continue;
                    if (!yaTraducidos.has(els[i])) anotar(els[i], 'tupla-de-rotulo', true);
                }
            }
        }

        // El argumento de un `toast` puede llegar envuelto: `toast.error(msg || 'texto')` es
        // el patrón que `P1-I18N-SERVER-COPY-GANA` cerró a mano en cuatro canales, y
        // `toast(cond ? 'a' : 'b')` su hermano. El nodo que se anotaba era la expresión
        // entera, cuyo `textoLiteral` es null: pasaba de largo.
        if (esLlamadaToast(nodo)) {
            const primero = (nodo.arguments || [])[0];
            if (primero && primero.type === 'ConditionalExpression') {
                if (!yaTraducidos.has(primero.consequent)) anotar(primero.consequent, 'toast:ternario');
                if (!yaTraducidos.has(primero.alternate)) anotar(primero.alternate, 'toast:ternario');
            }
            if (primero && primero.type === 'LogicalExpression') {
                if (!yaTraducidos.has(primero.right)) anotar(primero.right, 'toast:fallback');
            }
        }

        // [P3-I18N-PDF-GATE-CIEGO-HTML · 2026-08-23] El copy que vive dentro de una CADENA
        // de HTML, no de un JSX.
        //
        // Los PDFs de este repo se construyen concatenando HTML (`html2pdf` recibe una
        // cadena, no JSX), así que su copy vive en template literals. El escáner miraba
        // atributos, props, tablas, tuplas, toasts y expresiones JSX — ninguna de esas
        // posiciones cubre «texto suelto entre dos etiquetas dentro de un backtick».
        //
        // VERIFICADO por inyección antes de escribir esto: un `<p>Revisa las cantidades
        // antes de comprar tus alimentos frescos</p>` metido en el generador del PDF pasaba
        // el gate en VERDE. Las ~500 líneas de copy del PDF ya están envueltas —eso se
        // midió y era lo que el gap daba por perdido—, pero nada impedía que la siguiente
        // entrara sin traducir.
        //
        // Se mira sólo el texto ENTRE ETIQUETAS (`>...<`). El resto del template literal es
        // marcado, estilo y expresiones: incluirlo daría un falso positivo por cada
        // `style="..."` con una palabra que parezca española.
        if (nodo.type === 'TemplateLiteral') {
            for (const quasi of nodo.quasis) {
                const crudo = quasi.value && quasi.value.cooked;
                if (typeof crudo !== 'string' || crudo.indexOf('<') === -1) continue;
                // Se exige una ETIQUETA de verdad delante, no un `>` cualquiera. Sin
                // eso, la prosa de un comentario que contenga `>` y `<` —el bloque
                // `<style>` del dashboard, sin ir más lejos— entra como copy y el gate
                // se pone rojo por un texto que ningún usuario lee. Dos falsos
                // positivos en la primera versión, los dos de la misma forma.
                // La forma del copy REAL es `<tag>texto</tag>`: abierto por una etiqueta
                // y CERRADO por una. Sin exigir el cierre, la prosa de un comentario de
                // CSS dentro de un `<style>{`...`}` entra como copy —dos falsos
                // positivos en las dos primeras versiones de esta regla, los dos ahí—
                // y el gate se pone rojo por texto que ningún usuario lee.
                for (const m of crudo.matchAll(/<[a-zA-Z][^<>]*>([^<>{}]{6,})<\//g)) {
                    const texto = m[1].replace(/\s+/g, ' ').trim();
                    if (!texto || texto.length < 6) continue;
                    anotar({ type: 'StringLiteral', value: texto, loc: nodo.loc },
                           'html-en-plantilla', true);
                }
            }
            // [P3-I18N-GATE-HTML-CIEGO-A-LA-PROSA-PEGADA-A-INTERPOLACION · 2026-08-23] La
            // regla de arriba mira cada `quasi` POR SEPARADO, y la forma que los PDF usan
            // en casi todas sus líneas es `<td>${qty} unidades de ${name}</td>`: el trozo
            // « unidades de » no tiene etiqueta a ningún lado y `<td>` y `</td>` viven en
            // otros quasis. Se reconstruye el ESQUELETO del template —cada `${…}` pasa a
            // un marcador— y se aplica la misma regla sobre él. El marcador no cuenta
            // como letra: hacen falta 6 caracteres de prosa además de las interpolaciones.
            if (nodo.quasis.length > 1) {
                const esqueleto = nodo.quasis
                    .map((q) => (q.value && typeof q.value.cooked === 'string') ? q.value.cooked : '')
                    .join('\u0000');
                if (esqueleto.indexOf('<') !== -1) {
                    for (const m of esqueleto.matchAll(/<[a-zA-Z][^<>]*>([^<>{}]{6,})<\//g)) {
                        if (m[1].indexOf('\u0000') === -1) continue;   // sin interpolación: ya lo vio el bucle de arriba
                        const texto = m[1].replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
                        if (!texto || texto.length < 6) continue;
                        anotar({ type: 'StringLiteral', value: texto, loc: nodo.loc },
                               'html-en-plantilla', true);
                    }
                }
            }
        }

        // `{'texto'}` / `{cond ? 'a' : 'b'}` / `{x || 'a'}` como HIJO de JSX. El contenedor
        // es un nodo intermedio que el recorrido cruzaba sin mirar su expresión.
        if (nodo.type === 'JSXExpressionContainer' && nodo.expression) {
            const e = nodo.expression;
            if (e.type === 'StringLiteral' && !yaTraducidos.has(e)) anotar(e, 'jsx-expr');
            if (e.type === 'ConditionalExpression') {
                if (!yaTraducidos.has(e.consequent)) anotar(e.consequent, 'jsx-expr');
                if (!yaTraducidos.has(e.alternate)) anotar(e.alternate, 'jsx-expr');
            }
            if (e.type === 'LogicalExpression' && !yaTraducidos.has(e.right)) {
                anotar(e.right, 'jsx-expr');
            }
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
    for (const sentencia of ast.program.body || []) {
        lineaSentencia = sentencia.loc ? sentencia.loc.start.line : 0;
        visitar(sentencia);
    }

    hallazgos.sort((a, b) => a.linea - b.linea);
    return hallazgos;
}

export function detectarEnArchivo(ruta) {
    return detectarEnFuente(readFileSync(ruta, 'utf8'));
}

export { NODOS_FUNCION };
