// [P1-I18N-BACKEND-DETAIL · 2026-08-21] El `detail` español del servidor ganaba sobre el
// fallback traducido.
//
// El patrón era `toast.error(data?.detail || t('…'))`. El `||` hace que el texto ESPAÑOL
// del servidor se pinte **siempre que exista**, y el fallback traducido sólo se vea
// cuando el backend NO explica qué pasó. O sea: la traducción estaba escrita, estaba
// verificada, y era exactamente el caso que no llegaba nunca.
//
// Y el gate lo daba verde: la clave existe y está traducida en los cuatro idiomas. Nadie
// medía cuál de las dos ramas del `||` gana. Medido: 22 usos de `?.detail ||` en el
// frontend, de los cuales 5 en posición inequívoca de copy.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUÉ NO BASTA CON INVERTIR EL `||`
// ═══════════════════════════════════════════════════════════════════════════
//
// `t('…') || data.detail` pintaría siempre el fallback y perdería la información concreta
// —«te faltan 3 ingredientes» degradado a «inténtalo de nuevo»—. El servidor SÍ sabe cosas
// que el cliente no. Lo que hay que hacer es traducir lo que el servidor sabe, no tirarlo:
// por eso el canal es el CÓDIGO, no la prosa. El backend ya emite ocho `error_code`
// canónicos; esos se traducen. El resto cae a un fallback traducido, y el `detail` crudo
// se manda a la consola en vez de a la cara del usuario.
//
// LO QUE ESTO NO TOCA, y por qué no es un olvido: los 10 `throw new Error(detail || …)`.
// Ahí el string viaja a un `catch` cuyo destino varía —unos lo pintan, otros lo registran,
// otros sólo miran `err.code`—, así que migrarlos a ciegas cambiaría comportamiento que
// nadie ha medido. Quedan documentados en el guard como deuda con nombre.

/**
 * Los códigos que el backend emite hoy, con su copy traducible.
 *
 * La clave es el código, no el texto: es lo único estable entre las dos puntas. Y el
 * valor es una FUNCIÓN de `t` y no una cadena, porque un `t('…')` evaluado aquí, en
 * ámbito de módulo, se congelaría en el idioma de arranque — la trampa que este repo ya
 * ha pagado varias veces y que `i18n-check.mjs` vigila.
 */
const COPY_POR_CODIGO = {
    ai_unavailable: (t) => t('La IA no está disponible ahora mismo. Inténtalo en unos minutos.'),
    ai_exhausted_retries: (t) => t('La IA lo intentó varias veces y no lo consiguió. Vuelve a probar en un momento.'),
    swap_ai_unavailable: (t) => t('No pudimos cambiar el plato ahora mismo. Inténtalo en unos minutos.'),
    swap_llm_retries_exhausted: (t) => t('No encontramos un plato de recambio que cuadre. Prueba con otro.'),
    swap_clinical_violation: (t) => t('El plato de recambio chocaba con tus restricciones, así que no lo aplicamos.'),
    swap_strict_pantry_no_inventory: (t) => t('No hay nada en tu Nevera con lo que armar el recambio.'),
    pantry_insufficient_for_goal: (t) => t('Lo que hay en tu Nevera no alcanza para tus metas.'),
    budget_insufficient: (t) => t('El presupuesto no alcanza para el plan que pediste.'),
    budget_below_goal_floor: (t) => t('Ese presupuesto queda por debajo de lo que tus metas necesitan.'),
};

/** El código que trae una respuesta de error, mire donde mire el backend. */
function _codigoDe(data) {
    if (!data || typeof data !== 'object') return null;
    // Tres sitios porque el backend usa los tres: `error_code` de nivel superior (el
    // patrón soft-fail, P3-SWAP-SOFT-FAIL-200), `detail.code` cuando el detail es un
    // dict, y `code` pelado en algunos errores ya normalizados por el cliente.
    const candidatos = [
        data.error_code,
        typeof data.detail === 'object' && data.detail ? data.detail.code : null,
        data.code,
    ];
    return candidatos.find((c) => typeof c === 'string' && c) || null;
}

/**
 * El texto que se le enseña al usuario cuando una petición falla.
 *
 * @param {unknown} data     el cuerpo de la respuesta (o el error ya parseado)
 * @param {string} fallback  copy YA traducido por el llamante — `t('…')` en el call site,
 *                           no una clave: así el extractor del gate lo ve.
 * @param {(k: string) => string} t
 * @returns {string} siempre en el idioma del usuario
 */
export function mensajeDeError(data, fallback, t) {
    const codigo = _codigoDe(data);
    const copy = codigo ? COPY_POR_CODIGO[codigo] : null;

    // El `detail` crudo NO se pierde: va a la consola, que es donde sirve. Antes iba a la
    // cara del usuario, que es donde no.
    if (data && typeof data === 'object') {
        const crudo = typeof data.detail === 'string' ? data.detail : null;
        if (crudo && !copy) {
            // `console.error` y no `warn`: los guards del repo preservan `error` en
            // producción a propósito (Sentry lo recoge) y dropean `warn`.
            console.error('[P1-I18N-BACKEND-DETAIL] detail sin código traducible:', crudo);
        }
    }

    if (copy) return copy(t);
    return fallback;
}

/** Los códigos con copy, para que un test pueda cotejarlos contra el backend. */
export const CODIGOS_CON_COPY = Object.keys(COPY_POR_CODIGO);
