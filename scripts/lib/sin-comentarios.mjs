/** [P3-I18N-CLAVE-MUERTA-QUE-EL-GATE-DECLARA-VIVA · 2026-08-23] La fuente SIN comentarios,
 *  para extraer claves. Misma máquina de estados que `scanAt` (cadenas, templates, `//`,
 *  slash-asterisco), pero devolviendo el texto: los comentarios se sustituyen por blancos
 *  del mismo largo para que los offsets no se muevan (los usa `isModuleScopeCode`).
 *
 *  El extractor leía la fuente CRUDA, así que una clave citada SOLO en un comentario
 *  («antes aquí decía t('Guardar cambios')») contaba como viva, su traducción seguía en
 *  los cuatro catálogos y el gate cantaba «0 huérfanas». Comentario-vence-guard, instancia
 *  nº 12 — y esta vez al revés de las once anteriores: el comentario no ponía rojo un
 *  guard, mantenía VERDE una clave muerta. La nota de `scanAt` («vaciar comentarios antes
 *  de extraer la volvería huérfana y rompería el gate») describía el defecto como si fuera
 *  una propiedad. Medido al cerrarlo: ver el commit. */
export function sinComentarios(src) {
    const out = src.split('');
    let inStr = null, inLine = false, inBlock = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i], n = src[i + 1];
        if (inLine) { if (c === '\n') inLine = false; else out[i] = ' '; continue; }
        if (inBlock) {
            if (c !== '\n') out[i] = ' ';
            if (c === '*' && n === '/') { inBlock = false; out[i + 1] = ' '; i++; }
            continue;
        }
        if (inStr) {
            if (c === '\\') { i++; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '/' && n === '/') { inLine = true; out[i] = ' '; out[i + 1] = ' '; i++; continue; }
        if (c === '/' && n === '*') { inBlock = true; out[i] = ' '; out[i + 1] = ' '; i++; continue; }
        if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    }
    return out.join('');
}


