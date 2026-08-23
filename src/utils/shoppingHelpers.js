import { formatNumber, i18nKey } from '../i18n';

// ============================================================
// [P0-2] Parser robusto de `market_qty` para items del shopping list.
// ------------------------------------------------------------
// El backend (`apply_smart_market_units` en `shopping_calculator.py`) puede
// asignar a `market_qty` un string fraccional ("1 1/2", "3/4", "1/2") cuando
// el bloque de pesos dominicanos (BLOQUE 3) o el bloque de unidades híbridas
// (BLOQUE 2 con `is_native_weighable`) producen fracciones de libra.
//
// El consumer original hacía `parseFloat(item.market_qty)`, que en JS:
//   parseFloat("1 1/2") → 1   (pierde la fracción)
//   parseFloat("1/2")   → 0   (cae a "Al gusto" por <=0)
//   parseFloat("3/4")   → 3   (catastrófico — multiplica el delta por ~4)
//
// Resultado: el delta lista↔nevera quedaba subdimensionado y el usuario
// compraba MENOS de lo necesario (riesgo: faltante de comida con plan ya
// pagado), o el item desaparecía completamente.
//
// FIX (P0-2): el backend ahora expone también `market_qty_numeric: float`
// con el valor real post-MARKET_MINIMUMS. Este helper:
//   1. Prefiere `market_qty_numeric` cuando está presente (planes nuevos).
//   2. Si solo hay `market_qty` legacy (planes pre-fix persistidos), parsea
//      fracciones tipo "a", "a/b", "a b/c" antes de degradar a 0.
//   3. Acepta `null`/`undefined`/objetos no-numéricos sin lanzar.
//
// Es la versión espejo del `_parse_market_qty` interno del backend, para
// que la deducción de inventario tenga semántica idéntica en ambos lados.
// ============================================================

/**
 * Convierte `market_qty` (numérico o fraccional como string) a float.
 * Equivalente al `_parse_market_qty` interno de `apply_smart_market_units`.
 * @param {number|string|null|undefined} mq
 * @returns {number} 0 si no se puede parsear (NUNCA NaN ni Infinity).
 */
export const parseMarketQty = (mq) => {
    if (mq === null || mq === undefined) return 0;
    if (typeof mq === 'number') {
        return Number.isFinite(mq) ? mq : 0;
    }
    if (typeof mq !== 'string') {
        const n = Number(mq);
        return Number.isFinite(n) ? n : 0;
    }
    const trimmed = mq.trim();
    if (!trimmed) return 0;
    if (trimmed.includes('/')) {
        const parts = trimmed.split(/\s+/);
        try {
            if (parts.length === 2 && parts[1].includes('/')) {
                const [n, d] = parts[1].split('/');
                const whole = parseFloat(parts[0]);
                const num = parseFloat(n);
                const den = parseFloat(d);
                if (!Number.isFinite(whole) || !Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
                return whole + num / den;
            }
            if (parts.length === 1 && parts[0].includes('/')) {
                const [n, d] = parts[0].split('/');
                const num = parseFloat(n);
                const den = parseFloat(d);
                if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
                return num / den;
            }
        } catch {
            return 0;
        }
    }
    const f = parseFloat(trimmed);
    return Number.isFinite(f) ? f : 0;
};

/**
 * Selecciona el valor numérico autoritativo de un item de shopping list,
 * prefiriendo el `market_qty_numeric` poblado por el backend (P0-2) y
 * cayendo a un parseo robusto del `market_qty` legacy.
 * @param {{market_qty_numeric?: number, market_qty?: number|string, quantity?: number|string}} item
 * @returns {number}
 */
export const resolveShopQty = (item) => {
    if (!item || typeof item !== 'object') return 0;
    const numeric = item.market_qty_numeric;
    if (typeof numeric === 'number' && Number.isFinite(numeric)) return numeric;
    const parsed = parseMarketQty(item.market_qty);
    if (parsed > 0) return parsed;
    if (item.quantity !== undefined && item.quantity !== null) {
        const q = parseMarketQty(item.quantity);
        if (q > 0) return q;
    }
    return 0;
};

// ============================================================
// [P1-1] Helper de escape HTML para valores interpolados en el PDF de la
// lista de compras.
// ------------------------------------------------------------
// El generador de PDF del Dashboard construye un `htmlContent` template-
// literal y lo asigna a `element.innerHTML` antes de pasar a `html2pdf`.
// Los valores dinámicos vienen de tres fuentes NO-confiables:
//   1. LLM (Gemini): nombres de ingredientes, descripciones, categorías.
//   2. Usuario (formulario): `_pantry_supplement_required` (urgent_items),
//      `otherAllergies`, `otherDislikes`, etc.
//   3. el backend anterior: `ingredient_name` de `user_inventory` (el usuario los tipeó
//      al hacer Restock manual o el LLM los persistió).
//
// Antes del fix P1-1, las interpolaciones eran directas (`${cat}`,
// `${display}`, `${displayQty}`, `${item._inventoryNote}`). Un valor como
// `</li><img src=x onerror=...>` o cualquier markup desbalanceado:
//   - NO ejecuta JS (html2canvas serializa, no eval), pero
//   - Rompe la estructura del DOM del PDF (categorías/items duplicados,
//     listado truncado).
//   - El header/footer se desfasan.
//   - La descarga puede fallar o producir un PDF malformado.
//
// Este helper escapa los 5 metacaracteres HTML (`& < > " '`) — suficiente
// para neutralizar inyección dentro de cualquier contexto HTML de texto.
// `&` se escapa PRIMERO para no doble-escapar entidades introducidas por
// los reemplazos posteriores.
//
// Convenciones:
//   - Acepta `null`/`undefined`/non-string sin lanzar (retorna '' o
//     `String(value)` escapado).
//   - Mantiene caracteres Unicode (ej. "¼", "½", "🥩") intactos — no son
//     metacaracteres HTML y son legítimos en nombres dominicanos.
//   - Es una función pura para fácil testeo.
// ============================================================

/**
 * Escapa los 5 metacaracteres HTML para prevenir markup roto en el PDF.
 * @param {string|number|null|undefined} value
 * @returns {string} Texto seguro para interpolar dentro de innerHTML.
 */
export const escapeHtml = (value) => {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'string' ? value : String(value);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// ============================================================
// [P1-PLAN-DISPLAY-I18N · Task 5 · 2026-08-19] Gloss bilingüe de la lista
// de compras del PDF — fase 1b de
// docs/superpowers/specs/2026-08-19-plan-display-i18n-design.md, regla de
// oro: "el usuario cocina en su idioma pero COMPRA en español" — los
// ingredientes de la lista son SIEMPRE bilingües cuando el gloss existe,
// JAMÁS inglés puro. `display_name_en` es un campo ESTÁTICO del catálogo
// (backend/shopping_calculator.py::_display_name_en_for_item, poblado por
// `scripts/fill_catalog_name_en.py`), no traducido por-locale como
// `meal._display` — por eso el gloss es siempre "English (Español)" para
// CUALQUIER locale distinto de es-DO (pt-BR/fr-FR/it-IT incluidos: no hay
// glosses en portugués/francés/italiano, la fase 1b solo cubre inglés).
// Fallback silencioso: sin `displayNameEn` o en es-DO, se muestra el
// nombre español tal cual — nunca se lanza ni se rompe el PDF.
// ============================================================

/**
 * `glossShoppingItemName(name, displayNameEn, locale)` -> string
 *
 * - es-DO (o `locale` ausente/falsy): siempre el nombre español, tal cual.
 * - `displayNameEn` ausente/vacío: el nombre español, tal cual (fallback
 *   silencioso — display_name_en aún no fue poblado para ese ítem).
 * - En cualquier otro caso: "`displayNameEn` (`name`)", p.ej.
 *   "Black beans (Habichuelas negras)".
 */
/**
 * Índice `nombre español → gloss inglés` construido desde el catálogo.
 *
 * [P3-I18N-PDF-GLOSS-PLANES-VIEJOS · 2026-08-23] El gloss leía SÓLO
 * `item.item_ref.display_name_en`, un campo que el backend embebe en la lista al generarla.
 *
 * MEDIDO contra Neon: de los **49 planes vivos con lista, CERO** lo traen. No son «9 planes»
 * como estimaba el gap: son todos. O sea que hoy, en los cuatro idiomas no-base, la lista de
 * la compra del PDF sale ÍNTEGRA en español para cualquier usuario — el código del gloss
 * existe y está inerte en producción, igual que le pasaba a la capa `_display`.
 *
 * El catálogo tiene `name_en` al 347/347 y ya viaja al cliente con caché de 24 h, así que el
 * respaldo no cuesta ni una petición. Se indexa sin acentos y en minúsculas porque el nombre
 * que trae la lista y el del catálogo son la misma palabra escrita por dos caminos.
 *
 * Lo que NO cambia: gana siempre el campo embebido si está. El catálogo es respaldo, no
 * sustituto — un plan que traiga su propio gloss puede tener un nombre que el catálogo ya no
 * conozca.
 */
export const buildGlossIndex = (masterList) => {
    const idx = new Map();
    if (!Array.isArray(masterList)) return idx;
    for (const m of masterList) {
        const es = m && typeof m.name === 'string' ? m.name : '';
        const en = m && typeof m.name_en === 'string' ? m.name_en : '';
        if (es && en) idx.set(_sinAcentos(es), en.trim());
    }
    return idx;
};

export const glossShoppingItemName = (name, displayNameEn, locale, glossIndex = null) => {
    const spanishName = typeof name === 'string' ? name : (name == null ? '' : String(name));
    if (!locale || locale === 'es-DO') return spanishName;
    // El campo embebido manda; el catálogo es el respaldo para los planes que nacieron
    // antes de que existiera (hoy, todos).
    let _fuente = typeof displayNameEn === 'string' ? displayNameEn.trim() : '';
    if (!_fuente && glossIndex && typeof glossIndex.get === 'function') {
        _fuente = glossIndex.get(_sinAcentos(spanishName)) || '';
    }
    if (!_fuente) return spanishName;
    const englishGloss = _fuente;
    if (!spanishName) return englishGloss;
    // [P3-I18N-PDF-GLOSS-TAUTOLOGICO · 2026-08-22] «Cilantro (Cilantro)».
    //
    // El gloss existe para decir en inglés lo que el nombre español no dice. Cuando son la
    // MISMA palabra no añade nada y encima le quita sitio a la línea, que en el PDF compite
    // con la cantidad. MEDIDO sobre `master_ingredients`: 23 de 347 filas (6,6 %).
    //
    // La comparación va sin acentos y sin caja a propósito: **17 de esas 23 sólo se
    // diferencian en una tilde** --Salmón/Salmon, Melón/Melon, Kétchup/Ketchup,
    // Jícama/Jicama, Kéfir/Kefir--, que es justo lo que un `===` no habría visto. Gana el
    // nombre ESPAÑOL, que es el que el motor usa como identificador de punta a punta.
    if (_sinAcentos(englishGloss) === _sinAcentos(spanishName)) return spanishName;
    return `${englishGloss} (${spanishName})`;
};

/** Minúsculas sin diacríticos, para comparar dos grafías de la misma palabra. */
const _sinAcentos = (s) =>
    String(s ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .toLowerCase();

// ============================================================
// [P2-I18N-PDF-CATEGORIAS · 2026-08-22] Los rótulos de sección del PDF.
//
// Las cabeceras de la lista --PROTEÍNAS, VEGETALES, DESPENSA-- salían en español crudo justo
// debajo de banners que sí se traducen. Vienen de `display_category`, que compone el backend.
//
// SE TRADUCE AL IMPRIMIR, NUNCA EN EL DATO, y esa distinción es lo único que hace el arreglo
// seguro: `cat` no es sólo un rótulo, es la CLAVE con la que se agrupan los ítems en
// `perishables`/`stables`, la que ordena las secciones, y la que consultan dos comparaciones
// literales (`'CATÁLOGO SIN PRECIO'` y el heurístico de subcadena `PERISHABLE_PREFIXES`, que
// decide si un alimento va a la sección de 7 días o a la de despensa). Traducirla en el
// `consData` habría mandado la carne a la sección equivocada del documento con el que alguien
// hace la compra, y sólo para quien NO habla español.
//
// (Medido: `is_perishable` viene como bool en los 3.558 ítems de los 43 planes vivos, así que
// ese heurístico hoy es inalcanzable. Da igual: sigue en el código, y una defensa que depende
// de que un dato nunca falte no es una defensa.)
//
// Vocabulario CERRADO, espejo de `DISPLAY_CATEGORY_MAP` + `_get_display_category` en
// `backend/shopping_calculator.py`. Se resuelve sin acentos ni caja porque conviven las dos
// grafías en producción (`VEGETALES` en 750 ítems y `Vegetales` en 2, de las filas beta).
// La cabecera lleva `text-transform: uppercase`, así que la caja de la traducción da igual.
// ============================================================

const _CATEGORIAS_DE_LISTA = {
    proteinas: i18nKey('PROTEÍNAS'),
    lacteos: i18nKey('LÁCTEOS'),
    frutas: i18nKey('FRUTAS'),
    vegetales: i18nKey('VEGETALES'),
    viveres: i18nKey('VÍVERES'),
    despensa: i18nKey('DESPENSA'),
    especias: i18nKey('ESPECIAS'),
    suplementos: i18nKey('SUPLEMENTOS'),
    otros: i18nKey('OTROS'),
    '🛒 otros': i18nKey('🛒 OTROS'),
    '🚨 compra urgente': i18nKey('🚨 Compra Urgente'),
    'catalogo sin precio': i18nKey('CATÁLOGO SIN PRECIO'),
    '🌍 de tu pais': i18nKey('🌍 De tu país'),
};

/** Las claves del vocabulario, para el guard de paridad con el backend. */
export const CATEGORIAS_DE_LISTA_CLAVES = Object.values(_CATEGORIAS_DE_LISTA);

/**
 * `glossShoppingCategory(categoria, t)` -> string
 *
 * DISPLAY-ONLY. Una categoría desconocida --un pasillo nuevo del backend-- pasa TAL CUAL:
 * una sección en español es una degradación; una sección sin título es un documento roto.
 */
export const glossShoppingCategory = (categoria, t) => {
    if (typeof categoria !== 'string' || !categoria.trim()) return categoria;
    if (typeof t !== 'function') return categoria;
    const clave = _CATEGORIAS_DE_LISTA[_sinAcentos(categoria)];
    if (!clave) return categoria;
    try {
        const trad = t(clave);
        return typeof trad === 'string' && trad ? trad : categoria;
    } catch {
        return categoria;
    }
};

// ============================================================
// [P1-I18N-CANTIDAD-LISTA · 2026-08-22] …y la CANTIDAD, que se quedó atrás.
//
// El contrato bilingüe resolvió el NOMBRE y dejó en español todo lo que lo rodea. MEDIDO
// sobre las listas reales de 24 planes de producción: **811 de 898 ítems (90,3 %)** llevan
// sustantivo de envase o prosa española en `display_qty`. Lo que lee un francés en el PDF
// que se lleva al súper:
//
//     Black beans (Habichuelas rojas) — 1 paquete (800gr · Genérico) · alcanza ~6 de 7 días — recompra
//
// Sabe QUÉ comprar y no CUÁNTO, en qué presentación, ni para cuántos días — que es
// exactamente lo que el documento existe para decirle.
//
// POR QUÉ SE GLOSA AL RENDERIZAR Y NO SE REESTRUCTURA EL BACKEND. Parecía más limpio emitir
// campos (`container_key`, `coverage_note`) y componer aquí. Se descarta porque `display_qty`
// vive al lado de `market_unit` y `market_qty_numeric`, que son DATO: los usa `/restock` para
// construir las filas de `user_inventory`. El propio backend lo tiene escrito —«convertir el
// DATO metería gramos donde la deducción espera libras: la Nevera descontaría mal y en
// silencio»— y hay UN camino por el que el display sí toca el dato: `Dashboard.jsx` cae a
// `parseMarketQty(ing.display_qty)` cuando `resolveShopQty(ing)` devuelve 0.
//
// Glosar al RENDERIZAR no persiste nada. Y hay red doble: `parseMarketQty` lee el número
// INICIAL de la cadena, y esta función no lo toca jamás.
//
// LA REGLA QUE LO HACE SEGURO: sólo se traduce el sustantivo de envase que va INMEDIATAMENTE
// tras la cantidad, y las dos cláusulas de cobertura. **Nunca dentro del paréntesis**, porque
// ahí viven marcas y tamaños reales — «2 funda (Selecto 1 Lb · Wala c/u)». Traducir «Lb» ahí
// falsificaría la etiqueta y el usuario no encontraría el producto en el estante, y
// «Selecto»/«Wala» son nombres propios. Es la frontera de siempre aplicada a una cadena: se
// traduce lo que se lee como idioma, no lo que identifica un producto en el mundo.
// ============================================================

// Vocabulario CERRADO de envases, espejo de `PLURALS` en `backend/shopping_calculator.py`.
// Singular y plural van separados: el plural español no siempre lo es en el idioma destino.
const _ENVASES_TRADUCIBLES = (t) => ({
    paquete: t('paquete'), paquetes: t('paquetes'),
    funda: t('funda'), fundas: t('fundas'),
    fundita: t('fundita'), funditas: t('funditas'),
    pote: t('pote'), potes: t('potes'),
    lata: t('lata'), latas: t('latas'),
    frasco: t('frasco'), frascos: t('frascos'),
    botella: t('botella'), botellas: t('botellas'),
    tarro: t('tarro'), tarros: t('tarros'),
    sobre: t('sobre'), sobres: t('sobres'),
    sobrecito: t('sobrecito'), sobrecitos: t('sobrecitos'),
    envase: t('envase'), envases: t('envases'),
    cabeza: t('cabeza'), cabezas: t('cabezas'),
    mazo: t('mazo'), mazos: t('mazos'),
    hoja: t('hoja'), hojas: t('hojas'),
    rebanada: t('rebanada'), rebanadas: t('rebanadas'),
    barrita: t('barrita'), barritas: t('barritas'),
    unidad: t('unidad'), unidades: t('unidades'),
    'cartón': t('cartón'), carton: t('cartón'), cartones: t('cartones'),
    // [P2-I18N-PDF-LEYENDA-UD · 2026-08-22] Los cuatro que el primer espejo se dejó, medidos
    // sobre los 43 planes vivos: `diente(s)` y `taza(s)` están en el `PLURALS` del backend, y
    // `malla`/`bandeja` llegan desde las presentaciones de `supermarket_products`.
    diente: t('diente'), dientes: t('dientes'),
    taza: t('taza'), tazas: t('tazas'),
    malla: t('malla'), mallas: t('mallas'),
    bandeja: t('bandeja'), bandejas: t('bandejas'),
    cda: t('cda'), cdas: t('cdas'),
    cdta: t('cdta'), cdtas: t('cdtas'),
});

// Abreviaturas de unidad: van con PUNTO, así que no las alcanza el barrido de sustantivos
// --su regex captura sólo letras-- y se quedaban en español las cuatro veces que aparecen.
// `Ud.`/`Uds.` es la TERCERA forma más frecuente de la flota: 524 de 3.558 ítems.
const _ABREVIATURAS_DE_UNIDAD = (t) => ({
    'ud.': t('Ud.'),
    'uds.': t('Uds.'),
});

// Símbolos internacionales: NO se traducen. «lbs» es lo que dice el estante en RD, y
// traducir «g»/«ml»/«oz» sería inventar una unidad que el envase no lleva.
const _UNIDADES_NO_TRADUCIBLES = new Set(['lb', 'lbs', 'kg', 'g', 'gr', 'ml', 'l', 'oz']);

/**
 * `glossShoppingQty(displayQty, t)` -> string
 *
 * La cantidad de un ítem de la lista, en el idioma del usuario. DISPLAY-ONLY: no muta el
 * ítem y nunca debe alimentar `/restock` ni la resolución de la Nevera.
 *
 * Sin `t`, con una entrada que no sea texto, o sin traducción disponible: devuelve la
 * entrada TAL CUAL. Una cantidad en español es una degradación; una vacía es un fallo.
 */
/**
 * El separador decimal del idioma activo, preguntado a `Intl`.
 *
 * [P3-I18N-METRICA-COMA-CLAVADA · 2026-08-22] Se PREGUNTA en vez de tabularse: una
 * tabla `locale -> separador` escrita a mano sería la enésima de este repo y drifearía
 * igual que las tres que `P1-DIET-CANON-SSOT` tuvo que fusionar. `formatNumber` ya
 * enruta al locale activo, así que formatear `1.1` y quedarse con el carácter de en
 * medio da la respuesta sin duplicar el estado.
 *
 * Devuelve `null` si no puede resolverlo — y entonces la cantidad se deja EXACTAMENTE
 * como vino. Una cifra con el separador del idioma equivocado se lee; una cifra
 * corrompida por un reemplazo a ciegas, no.
 */
const _separadorDecimal = () => {
    try {
        const m = /1(.)1/u.exec(formatNumber(1.1));
        return m && m[1] !== '1' ? m[1] : null;
    } catch {
        return null;
    }
};

/**
 * [P2-I18N-UNIDADES-DE-ENVASE-CRUDAS-EN-NEVERA-Y-DIARIO · 2026-08-23] Una unidad de envase
 * suelta («funda», «paquete», «Ud.»), traducida para PINTAR.
 *
 * La tabla de envases ya existía aquí para la lista del PDF; la Nevera y el diario pintaban
 * `item.unit` / `market_container` crudos, con la traducción escrita al lado. El DATO no se
 * toca: `unit` es vocabulario cerrado que el backend compara literal (`PLURALS` en
 * `shopping_calculator.py`), así que se traduce sólo en el punto donde se muestra.
 *
 * Devuelve la palabra tal cual si no es un envase conocido (g, ml, kg… no se traducen).
 */
export const glossUnitWord = (unit, t) => {
    if (typeof unit !== 'string' || !unit.trim() || typeof t !== 'function') return unit;
    const clave = unit.trim().toLowerCase();
    if (_UNIDADES_NO_TRADUCIBLES.has(clave)) return unit;
    let envases, abreviaturas;
    try {
        envases = _ENVASES_TRADUCIBLES(t);
        abreviaturas = _ABREVIATURAS_DE_UNIDAD(t);
    } catch {
        return unit;
    }
    const trad = envases[clave] || abreviaturas[clave];
    if (!trad || trad === clave) return unit;
    return unit[0] === unit[0].toUpperCase() ? trad.charAt(0).toUpperCase() + trad.slice(1) : trad;
};

export const glossShoppingQty = (displayQty, t) => {
    if (typeof displayQty !== 'string' || !displayQty.trim()) return displayQty;
    if (typeof t !== 'function') return displayQty;

    let out = displayQty;
    let envases;
    try {
        envases = _ENVASES_TRADUCIBLES(t);
    } catch {
        return displayQty;  // una `t` rota no puede dejar la lista sin cantidades
    }

    // 0. La abreviatura de unidad, que lleva punto. Va ANTES del barrido de sustantivos
    //    porque aquél captura sólo letras y dejaría `Ud.` intacto. Misma ancla al principio.
    let abreviaturas;
    try {
        abreviaturas = _ABREVIATURAS_DE_UNIDAD(t);
    } catch {
        abreviaturas = {};
    }
    out = out.replace(
        /^(\s*[\d]+(?:[.,][\d]+)?\s+)(Uds?\.)/u,
        (todo, cantidad, abrev) => {
            const trad = abreviaturas[abrev.toLowerCase()];
            if (!trad || trad === abrev) return todo;
            return cantidad + trad;
        },
    );

    // 1. El sustantivo de envase que sigue a la cantidad. Anclado al PRINCIPIO, así que no
    //    puede alcanzar nada de dentro del paréntesis.
    out = out.replace(
        /^(\s*[\d]+(?:[.,][\d]+)?(?:\s*[½¼¾⅓⅔])?\s+|\s*[½¼¾⅓⅔]\s+)([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/u,
        (todo, cantidad, palabra) => {
            const clave = palabra.toLowerCase();
            if (_UNIDADES_NO_TRADUCIBLES.has(clave)) return todo;
            const trad = envases[clave];
            if (!trad || trad === clave) return todo;
            // Se preserva la mayúscula inicial del original: «1 Mazo» → «1 Bunch».
            const conCaja = palabra[0] === palabra[0].toUpperCase()
                ? trad.charAt(0).toUpperCase() + trad.slice(1)
                : trad;
            return cantidad + conCaja;
        },
    );

    // 2. Las dos cláusulas de cobertura, ENTERAS. Se traducen como frase y no por partes:
    //    el orden de «alcanza para N de M días» no es el mismo en francés ni en portugués.
    out = out.replace(
        /alcanza\s*~(\d+)\s*de\s*(\d+)\s*días\s*—\s*recompra/u,
        (_m, n, m) => t('alcanza ~{n} de {m} días — recompra', { n, m }),
    );
    out = out.replace(
        /alcanza\s*~(\d+)\s*días\s*—\s*no recompres cada semana/u,
        (_m, n) => t('alcanza ~{n} días — no recompres cada semana', { n }),
    );

    // 3. «c/u» va DENTRO del paréntesis pero no es marca ni tamaño: es la aclaración de que
    //    el tamaño es POR envase, y sin ella «9 potes (16 oz)» se lee como el total.
    out = out.replace(/\bc\/u\b/gu, () => t('c/u'));

    // 3b. «Genérico» — la marca que NO es una marca. [P2-I18N-GENERICO-SE-IMPRIME-EN-ESPANOL
    //     · 2026-08-23] La regla de no tocar el paréntesis existe para los nombres propios
    //     («Wala», «La Sanjuanera»). «Genérico» es el placeholder que los dos lados escriben
    //     en el DATO cuando no hay marca: 259 de 1.658 ítems de listas vivas lo llevan, y
    //     salía en español bajo un encabezado traducido. Se glosa al imprimir, como `c/u`.
    out = out.replace(/\bGenérico\b/gu, () => t('Genérico'));

    // 4. El separador decimal. El backend lo escribe con COMA a mano
    //    (`_etiqueta_metrica` en `shopping_calculator.py`: «1,4 kg»), y su comentario
    //    dice «Coma decimal: la lista se lee en español».
    //
    //    Medido: `Intl` en **es-DO** devuelve `1.4`, con PUNTO. La República Dominicana
    //    escribe el decimal como Estados Unidos, no como España — así que la coma
    //    clavada no era sólo un descuido con los otros cuatro idiomas: estaba mal
    //    también en el idioma BASE de la app. El comentario del backend confundió
    //    «español» con «España».
    //
    //    Se toca ÚNICAMENTE el separador, nunca la agrupación de millares: reagrupar
    //    convertiría «1250 g» en «1.250 g», y en una lista de la compra eso se puede
    //    leer como mil doscientos cincuenta veces más. Lo que este gap dice es
    //    «separador».
    //
    //    Y se glosa al RENDERIZAR, jamás en el dato: `parseMarketQty(ing.display_qty)`
    //    lee el campo CRUDO en el camino de `/restock`, así que reescribir el número
    //    aquí no puede desviar ni un gramo de lo que se descuenta de la nevera.
    const _sep = _separadorDecimal();
    if (_sep) {
        out = out.replace(/(\d)[.,](\d)/gu, (_m, a, b) => `${a}${_sep}${b}`);
    }

    return out;
};

export const getActiveShoppingList = (planData, duration) => {
    if (!planData || !duration) return null;
    // [P3-NEW-1 · 2026-05-10] Defense-in-depth contra
    // `_shopping_coherence_block` no consumido. Contrato del backend
    // (`review_plan_node` en graph_orchestrator.py:7704): si el guard
    // de coherencia recetas↔lista bloqueó el plan, el flag debe estar
    // POPED post-review (degrade) o el plan debe estar rechazado (no
    // llegar al frontend con la lista). Si el flag aún viene en planData
    // al render time, es una violación del contrato — log defensivo +
    // SEGUIR renderizando (no degradamos UX por un flag posiblemente
    // stale; el backend es source-of-truth de qué planes son visibles).
    if (Array.isArray(planData._shopping_coherence_block) && planData._shopping_coherence_block.length > 0) {
        try {
            console.warn(
                '[P3-NEW-1/PDF-RENDER] Plan llegó al frontend con ' +
                '`_shopping_coherence_block` no vacío — contrato roto entre ' +
                'backend (review_plan_node debió popearlo) y persistencia. ' +
                `Entries: ${planData._shopping_coherence_block.length}. Render continúa.`
            );
        } catch { /* console.warn falló — best-effort */ }
        // [P3-PDF-OBS-FU-A · 2026-05-14] Telemetría complementaria al
        // `console.warn` previo, que en producción se elimina por esbuild
        // (`pure: ['console.warn']` en vite.config.js). Sin esto, una
        // regresión en `review_plan_node` (backend) que dejase de popear
        // `_shopping_coherence_block` pasaría inadvertida en prod: el plan
        // se renderiza igual (defense-in-depth correcto) pero operadores
        // no saben que el contrato está roto. Lazy import del trackEvent
        // (dynamic) para mantener `shoppingHelpers.js` libre de carga
        // estática del módulo de analytics — usuarios cuyo plan NO viola
        // el contrato no pagan el costo del fetch.
        try {
            import('./analytics.js')
                .then(({ trackEvent }) => {
                    try {
                        trackEvent('pdf_render_coherence_block_leak', {
                            plan_id: planData?.id,
                            entries_count: planData._shopping_coherence_block.length,
                        });
                    } catch { /* analytics SDK best-effort */ }
                })
                .catch(() => { /* import falló — no romper render */ });
        } catch { /* dynamic import sync-error — no-op defensivo */ }
    }
    const keyMap = {
        'weekly': 'aggregated_shopping_list_weekly',
        'biweekly': 'aggregated_shopping_list_biweekly',
        'monthly': 'aggregated_shopping_list_monthly'
    };
    const key = keyMap[duration];
    if (key && Array.isArray(planData[key]) && planData[key].length > 0) return planData[key];
    if (Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0) return planData.aggregated_shopping_list;
    // [P5-EMPTY-ACTIVE-LIST-FALLBACK · 2026-06-23] Las listas de ciclo (biweekly/monthly) y la
    // canónica pueden quedar VACÍAS cuando el usuario está restocked: `_build_hybrid` (RIESGO-1)
    // SUPRIME los perecederos comprados dentro del ciclo. Eso NO es un plan roto — la lista
    // SEMANAL canónica (`aggregated_shopping_list_weekly`, nunca restock-deducida) SÍ existe.
    // Caer a ella evita el falso "tu plan no tiene lista de compras todavía" y desbloquea el
    // PDF/restock; la deducción real contra la Nevera se hace at-render-time en
    // buildDeltaShoppingList (si está todo restocked, el delta saldrá vacío = "ya tienes todo").
    if (Array.isArray(planData.aggregated_shopping_list_weekly) && planData.aggregated_shopping_list_weekly.length > 0) return planData.aggregated_shopping_list_weekly;
    return null;
};

// [P5-PRESENCE-SHOPPING-LIST · 2026-06-23] Set CANÓNICO COMPLETO de ingredientes del plan
// (membresía). La lista `weekly` es la ÚNICA nunca restock-suprimida (las de ciclo
// biweekly/monthly pueden quedar recortadas por `_build_hybrid` cuando el usuario está restocked
// → un ítem agotado que solo vive en `weekly` jamás se chequearía). Esta es la fuente de
// MEMBRESÍA para el delta de presencia; las CANTIDADES siguen viniendo de la lista del ciclo.
export const getCanonicalIngredientSet = (planData) => {
    if (!planData) return null;
    if (Array.isArray(planData.aggregated_shopping_list_weekly) && planData.aggregated_shopping_list_weekly.length > 0) return planData.aggregated_shopping_list_weekly;
    if (Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0) return planData.aggregated_shopping_list;
    return null;
};

const _deltaKey = (it) => (typeof it === 'object' && it ? (it.name || '') : String(it || '')).toLowerCase().split('(')[0].trim();

// [P5-PRESENCE-SHOPPING-LIST · 2026-06-23] Fuente del delta de la lista: parte de la lista del
// CICLO (cantidades ya escaladas → planes nuevos quedan correctos) y UNE los ingredientes del set
// canónico que el ciclo recortó (restock-supresión) pero que SIGUEN siendo del plan. Así un
// perecedero agotado que el backend quitó de la lista de ciclo se vuelve a chequear contra la
// Nevera y reaparece si está ausente. Dedupe por nombre normalizado (sin duplicar filas en
// PDF/restock). Para un plan NUEVO (ciclo no recortado) la unión no agrega nada → idéntico al previo.
export const getDeltaSourceList = (planData, duration) => {
    // Preserva `null` (no `[]`) cuando NO hay lista — el guard del PDF lo usa para detectar
    // "plan sin lista de compras".
    const durationList = getActiveShoppingList(planData, duration);
    const canonical = getCanonicalIngredientSet(planData);
    if (!Array.isArray(canonical) || canonical.length === 0) return durationList;
    const base = Array.isArray(durationList) ? durationList : [];
    const present = new Set(base.map(_deltaKey).filter(Boolean));
    const recovered = canonical.filter((it) => {
        const k = _deltaKey(it);
        return k && !present.has(k);
    });
    if (recovered.length === 0) return durationList;
    return [...base, ...recovered];
};

export const calculateAllPlanIngredients = (planData, isPlanExpired, liveInventory) => {
    if (!planData || isPlanExpired) return [];

    const currentIngredientsMap = new Map();

    // 1. Agregar Inventario Físico (user_inventory) - Lo que ya tiene en casa
    if (liveInventory && Array.isArray(liveInventory) && liveInventory.length > 0) {
        liveInventory.forEach(item => {
            const qty = parseFloat(item.quantity) || 0;
            const unit = item.unit || 'unidad';
            const name = item.ingredient_name || item.master_ingredients?.name || 'Ingrediente';
            const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1).replace(/\.0$/, '');

            let displayQty = '';
            if (qty > 0) {
                if (unit === 'unidad') {
                    displayQty = qty === 1 ? '1 Ud.' : `${qtyStr} Uds.`;
                } else {
                    displayQty = `${qtyStr} ${unit}`;
                }
            }

            // id_string compatible con backend _parse_quantity
            const idString = unit === 'unidad'
                ? `${qtyStr} ${name}`
                : `${qtyStr} ${unit} de ${name}`;

            currentIngredientsMap.set(name.toLowerCase().trim(), {
                id_string: idString,
                quantity: displayQty,
                name: name
            });
        });
    }

    // 2. Agregar Lista de Compras (lo nuevo) - Debe sobreescribir para reflejar cantidades escaladas
    if (planData.aggregated_shopping_list && Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0) {
        planData.aggregated_shopping_list.forEach(ing => {
            if (typeof ing === 'object' && ing !== null) {
                const idString = ing.display_string || ing.name || String(ing);
                const qty = ing.display_qty || '';
                const name = ing.name || ing.display_name || ing.display_string || 'Ingrediente';

                // Siempre sobreescribimos para asegurar que el UI refleje el nuevo tamaño del hogar
                currentIngredientsMap.set(name.toLowerCase().trim(), {
                    id_string: idString,
                    quantity: qty,
                    name: name
                });
                
                return;
            }

            // Fallback directo sin Regex para strings legacy
            const str_ing = String(ing).trim();
            currentIngredientsMap.set(str_ing.toLowerCase(), {
                id_string: str_ing,
                quantity: 'Al gusto',
                name: str_ing
            });
        });
    } else {
        // 3. Fallback Legacy si no hay aggregated_shopping_list
        const planDaysToCheck = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
        planDaysToCheck.forEach(day => {
            // [P2-CALC-INGREDIENTS-MEALS-GUARD · 2026-05-30] Guard simétrico al
            // backend (graph_orchestrator: `if not isinstance(day_meals, list):
            // continue`). Este fallback legacy corre cuando aggregated_shopping_list
            // está vacío/ausente — exactamente el estado de un plan parcial/chunked
            // (graph_orchestrator setea aggregated_shopping_list=[] en el except
            // dejando days poblado). Un día sin `meals` array hacía
            // `day.meals.forEach` lanzar TypeError → el useMemo del Dashboard
            // reventaba el render entero (recuperable vía ErrorBoundary, pero
            // loop crash-on-load hasta que el plan rote). Lista de compras
            // display-only: un fallo de cálculo no debe tumbar el Dashboard.
            const _meals = (day && Array.isArray(day.meals)) ? day.meals : [];
            _meals.forEach(meal => {
                if (meal && meal.ingredients && Array.isArray(meal.ingredients)) {
                    meal.ingredients.forEach(ing => {
                        let qty = 'Al gusto';
                        let name = 'Desconocido';
                        let id_string = '';

                        if (typeof ing === 'object' && ing !== null) {
                            name = ing.name || ing.display_name || ing.display_string || String(ing);
                            qty = ing.display_qty || (ing.market_qty && ing.market_unit ? `${ing.market_qty} ${ing.market_unit}` : 'Al gusto');
                            id_string = ing.display_string || name;
                        } else {
                            name = String(ing).trim();
                            id_string = name;
                        }

                        if (name.length > 2 && !currentIngredientsMap.has(name.toLowerCase().trim())) {
                            currentIngredientsMap.set(name.toLowerCase().trim(), { id_string: id_string, quantity: qty, name: name });
                        }
                    });
                }
            });
        });
    }

    return Array.from(currentIngredientsMap.values()).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
};

// ============================================================
// [P1-PDF-1] Fetch de inventario fresco con timeout para el PDF
// ------------------------------------------------------------
// El generador de lista de compras del Dashboard necesita inventario LIVE
// (no `liveInventory` cacheado en estado) para calcular el delta antes de
// renderizar el PDF — sin esto, un restock previo cuyo response falló pero
// que sí persistió en BD genera una lista con items duplicados.
//
// Antes el código hacía un `await (cliente anterior).select(...)`
// envuelto en `try/catch` con fallback silencioso. Si el backend anterior tardaba o
// fallaba, `liveInventory` (potencialmente stale) se usaba para el delta sin
// señalización al usuario → items que ya están en la nevera reaparecían en el
// PDF → usuario compra duplicado.
//
// Este helper:
//   1. Carrera (`Promise.race`) entre el fetch y un timeout configurable
//      (default 2000ms — más allá de eso es mejor degradar a caché que dejar
//      al usuario esperando un PDF).
//   2. Devuelve `{ data, stale, reason }` con semántica explícita:
//      - `stale=false` → fetch retornó datos válidos.
//      - `stale=true` con `reason ∈ {timeout, error, empty_response}` → caller
//        debe usar `liveInventory` cacheado Y mostrar banner "lista basada
//        en datos en caché".
//   3. NUNCA lanza — todo fallo se traduce a `{stale: true, reason}` para
//      simplificar el call site (un solo path de éxito + un solo path de
//      degradación, sin try/catch redundante).
//
// `timeoutMs` puede subirse si el SLA del producto exige delta-fresh
// garantizado (e.g., 5000); bajarse si la latencia tail es prioridad.
// ============================================================

/**
 * @param {() => Promise<{data: any, error?: any}>} fetchFn — closure que dispara
 *   el query de el backend anterior. Se invoca dentro del race; si timeout gana, el query
 *   sigue corriendo en background pero su resultado se descarta.
 * @param {number} [timeoutMs=2000] — cap blando antes de degradar a caché.
 * @returns {Promise<{data: any[]|null, stale: boolean, reason: string|null}>}
 */
// ============================================================
// [P2-PDF-INV-TIMEOUT-KNOB · 2026-05-14] Knob para el timeout de
// `fetchFreshInventoryWithTimeout`.
// ------------------------------------------------------------
// Antes del P-fix, los 4 callsites de Dashboard.jsx (mount, focus,
// PDF download, restock) pasaban literal `2000` ms al helper. Si
// el backend anterior entra en degradación tail-latency (incidente regional,
// pool exhausted, network blip), no había forma de subir el timeout
// sin redeploy del frontend (rebuild). El cron P2-SHOPPING-3
// (`_alert_pdf_stale_inventory_fallback_burst`) detectaría el burst
// pero la mitigación requería rebuild.
//
// Este helper lee `VITE_INVENTORY_FETCH_TIMEOUT_MS` desde el env
// (sustituido en build-time por Vite/esbuild) con clamp defensivo:
//   - Default: 2000ms (comportamiento pre-knob preservado).
//   - Mínimo: 500ms (debajo de eso casi todos los fetches caerían
//     a stale fallback — peor UX que esperar 500ms).
//   - Máximo: 10000ms (sobre 10s el usuario asume que el PDF/restock
//     se colgó; html2pdf render timeout es 60s pero el inventory
//     fetch es solo un prefetch — sobre 10s es worse-than-stale).
//   - Valores no-numéricos (NaN, undefined, string vacío): fallback al
//     default 2000.
//
// Symmetric counterpart to `VITE_PDF_RENDER_TIMEOUT_MS` (P2-PDF-OBS-2)
// que cubre el timeout del render html2pdf. Ambos knobs permiten al
// SRE bumpearlos sin redeploy si el backend anterior/render latencia tail crece.
// ============================================================

/**
 * Retorna el timeout (ms) para `fetchFreshInventoryWithTimeout` leído
 * desde el env knob con clamp defensivo.
 * @returns {number} clamp [500, 10000], default 2000.
 */
export const getInventoryFetchTimeoutMs = () => {
    const raw = parseInt(import.meta.env?.VITE_INVENTORY_FETCH_TIMEOUT_MS, 10);
    let ms = Number.isFinite(raw) ? raw : 2000;
    if (ms < 500) ms = 500;
    if (ms > 10000) ms = 10000;
    return ms;
};

export const fetchFreshInventoryWithTimeout = async (fetchFn, timeoutMs = 2000) => {
    if (typeof fetchFn !== 'function') {
        return { data: null, stale: true, reason: 'invalid_fetch_fn' };
    }

    const TIMEOUT_SENTINEL = Symbol('timeout');
    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutMs);
    });

    try {
        const result = await Promise.race([fetchFn(), timeoutPromise]);
        clearTimeout(timeoutId);

        if (result === TIMEOUT_SENTINEL) {
            return { data: null, stale: true, reason: 'timeout' };
        }

        // el backend anterior responses: `{ data, error }`. Si error está poblado, se
        // trata como fallo de red/permiso → stale.
        if (result && result.error) {
            return { data: null, stale: true, reason: 'error' };
        }

        const data = result?.data;
        if (!Array.isArray(data)) {
            // null/undefined data sin error explícito (caso patológico de
            // el backend anterior con RLS denegando silenciosamente) → degradar a caché.
            return { data: null, stale: true, reason: 'empty_response' };
        }

        return { data, stale: false, reason: null };
    } catch {
        clearTimeout(timeoutId);
        return { data: null, stale: true, reason: 'error' };
    }
};

// ============================================================
// [P1-PDF-3] Decisión de densidad y layout para el PDF de la lista de compras
// ------------------------------------------------------------
// ANTES, `Dashboard.jsx` aplicaba la heurística inline:
//     const isUltraDense = totalItems >= 38;
//     const isDense = totalItems >= 26 || isUltraDense;
// Con `pagebreak: { mode: ['avoid-all'] }` html2pdf evita romper DENTRO de
// elementos pero ENTRE elementos sí permite saltos. Para listas mensuales
// con 60+ items + `_inventoryNote` + 3 columnas, el contenido podía:
//   1. Cortarse a media tarjeta de categoría (avoid-all evita esto a costa
//      de comprimir todo).
//   2. Empujar un footer fantasma a una segunda página por margen residual.
//   3. Renderizar items con font/padding ya inviables tras `isUltraDense`.
//
// AHORA esta función pura decide:
//   - `isDense` / `isUltraDense`: comportamiento existente preservado.
//   - `isHyperDense`: nuevo nivel para 60+ items (4 columnas, padding 1px,
//     font ~6.5px, oculta `_inventoryNote` para liberar verticales).
//   - `multiPage`: a partir de 80 items, deja que html2pdf paginee
//     formalmente (cambia el `pagebreak.mode` en el caller). Sin esto, el
//     contenido seguía el path "avoid-all + ultra-dense" y a veces se
//     desbordaba con tipografía no leible.
//   - `columnCount`: 3 hasta hyper-dense, 4 a partir de ahí.
//   - `showInventoryNotes`: false en hyper-dense (gana espacio vertical).
//   - `density`: tier discreto para telemetría/tests.
//
// Thresholds elegidos a partir del análisis del audit P1-PDF-3:
//   * 26 (isDense): comprimir padding sin reducir font drásticamente.
//   * 38 (isUltraDense): font 9px, padding 2px — última oportunidad 1-página.
//   * 60 (isHyperDense): NUEVO — 4 cols + ocultar notas mantienen 1 página
//     viable hasta ~75 items.
//   * 80 (multiPage): NUEVO — más allá de aquí ningún ajuste de densidad
//     mantiene legibilidad. Mejor paginear y ofrecer pages 2,3 que un
//     PDF ilegible.
//
// El caller debe usar `multiPage` para flipear `pagebreak.mode` de
// `avoid-all` a la combinación CSS+legacy que respeta `page-break-after`.
// ============================================================

export const PDF_LAYOUT_THRESHOLDS = Object.freeze({
    DENSE: 26,
    ULTRA_DENSE: 38,
    HYPER_DENSE: 60,
    MULTI_PAGE: 80,
});

/**
 * Decide la densidad y estrategia de paginación del PDF de la lista de
 * compras según la cantidad total de items (perecederos + estables).
 *
 * Función pura — sin side effects, fácil de testear.
 *
 * @param {number} totalItems — count agregado de items renderizados.
 * @returns {{
 *   totalItems: number,
 *   density: 'normal'|'dense'|'ultra'|'hyper',
 *   isDense: boolean,
 *   isUltraDense: boolean,
 *   isHyperDense: boolean,
 *   multiPage: boolean,
 *   columnCount: 3|4,
 *   showInventoryNotes: boolean,
 * }}
 */
export const computePdfLayoutDensity = (totalItems) => {
    const n = Number.isFinite(totalItems) && totalItems >= 0 ? Math.floor(totalItems) : 0;
    const isHyperDense = n >= PDF_LAYOUT_THRESHOLDS.HYPER_DENSE;
    const isUltraDense = n >= PDF_LAYOUT_THRESHOLDS.ULTRA_DENSE;
    const isDense = n >= PDF_LAYOUT_THRESHOLDS.DENSE;
    const multiPage = n >= PDF_LAYOUT_THRESHOLDS.MULTI_PAGE;

    let density = 'normal';
    if (isHyperDense) density = 'hyper';
    else if (isUltraDense) density = 'ultra';
    else if (isDense) density = 'dense';

    return {
        totalItems: n,
        density,
        isDense,
        isUltraDense,
        isHyperDense,
        multiPage,
        // 4 columnas en hyper-dense para empacar más items por página vertical.
        columnCount: isHyperDense ? 4 : 3,
        // En hyper-dense ocultamos `_inventoryNote` para liberar 1 línea por
        // item (~10-12px) — el inventario se ve en el banner global del PDF
        // y en el modal de Restock; no perdemos información crítica.
        showInventoryNotes: !isHyperDense,
    };
};
