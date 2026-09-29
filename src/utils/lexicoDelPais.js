// [P1-PLAN-LOTE-853 · 2026-09-29] La palabra de cada país al LEER el plan, sin tocar el plan.
//
// G24 (29-sep): «guineo», «lechosa», «auyama», «ají morrón», «queso blanco», «habichuelas» y «funda» salían en los
// platos y la lista de España, México, Colombia y EE. UU. Son NOMBRES DEL CATÁLOGO —el identificador con que resuelven
// la Nevera, el guard de coherencia y el backstop de alergias—: el plan no se toca, la palabra se cambia AL PINTAR,
// por país de mercado, con el léxico como DATA (`src/data/lexicoVistaPais.json`, espejo idéntico de
// `backend/data/lexico_vista_pais.json`; la implementación de referencia es `backend/lexico_vista_pais.py` y los
// `casos` del JSON los corren las dos).
//
//   - sustituye en todas las apariciones, con su caja («Ají Morrón» → «Pimiento Morrón»);
//   - si cambia el género (habichuelas→frijoles) concuerda el determinante de delante y los adjetivos de detrás; si la
//     cláusula vuelve sobre la palabra en femenino («májalas») o un vecino no sabe concordar, GLOSA, como el lote 649;
//   - «funda» solo como envase de la lista (en un paso es el verbo: «que el queso funda»);
//   - en la frase, lo que el léxico no cubre lo glosa el 649 en la MISMA pasada (nada se encadena).
//
// DISPLAY-ONLY: funciones puras que devuelven otra cadena. Ningún módulo que ESCRIBE el plan la importa (lo exige el
// contrato `lexicoDelPais.p1_plan_lote_853.test.js`). Knob `VITE_COUNTRY_DISPLAY_LEXICON` (encendido salvo
// '0'/'false'/'off'); el backend lleva `MEALFIT_COUNTRY_DISPLAY_LEXICON`. Doc: backend/docs/lexico_vista_pais.md.
import LEXICO from '../data/lexicoVistaPais.json';
import { glosasDelTexto } from './nombresDelPais';
import { getPaisDelUsuario } from './paisDelUsuario';

/** ¿Está encendida la capa? Se lee al llamar (no al cargar) para que el knob se pueda probar. */
export const lexicoDeVistaActivo = () => !['0', 'false', 'off'].includes(
    String(import.meta.env.VITE_COUNTRY_DISPLAY_LEXICON ?? '').trim().toLowerCase(),
);

const _ACENTO = /[áéíóú]/;
const _FIN_DE_CLAUSULA = /[.;:!?\n]/;

const _pais = (pais) => (typeof pais === 'string' ? pais.trim().toUpperCase() : '');

/** Las entradas del léxico de `pais` (vacío para RD, sin país o país desconocido). */
export const filasDelLexico = (pais) => {
    const t = LEXICO?.paises?.[_pais(pais)];
    return Array.isArray(t) ? t : [];
};

/** ¿`pais` tiene léxico de vista? (RD no). */
export const tieneLexico = (pais) => filasDelLexico(pais).length > 0;

const _escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const _patron = (forma) => new RegExp(`(?<![\\p{L}\\p{N}])${_escapar(forma)}(?![\\p{L}\\p{N}])`, 'giu');

const _cachePatrones = {};
function _patrones(pais, ambito) {
    const k = `${pais}|${ambito}`;
    if (!_cachePatrones[k]) {
        const out = [];
        for (const fila of filasDelLexico(pais)) {
            if ((fila.ambito || 'texto') !== ambito) continue;
            for (const n of [0, 1]) out.push([fila.de[n], n, fila]);
        }
        out.sort((a, b) => b[0].length - a[0].length);
        _cachePatrones[k] = out;
    }
    return _cachePatrones[k];
}

const _esMayus = (c) => c === c.toUpperCase() && c !== c.toLowerCase();

/** `destino` con la caja de `original`: MAYÚSCULAS, Título De Cada Palabra, Inicial o minúsculas. */
function _conCaja(original, destino) {
    const letras = [...original].filter((c) => c.toUpperCase() !== c.toLowerCase());
    if (letras.length > 1 && letras.every(_esMayus)) return destino.toUpperCase();
    const palabras = original.split(/\s+/).filter(Boolean);
    if (palabras.length > 1 && palabras.every((p) => _esMayus(p[0]))) {
        return destino.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    if (original && _esMayus(original[0])) return destino.charAt(0).toUpperCase() + destino.slice(1);
    return destino;
}

const _solapa = (ini, fin, ocupados) => ocupados.some(([a, b]) => ini < b && fin > a);

function _palabraPrevia(texto, hasta) {
    const m = /(\p{L}+)(\s+)$/u.exec(texto.slice(0, hasta));
    return m ? [m[1], m.index, m.index + m[1].length] : null;
}

function _palabraSiguiente(texto, desde) {
    const m = /^(\s+)(\p{L}+)/u.exec(texto.slice(desde));
    if (!m) return null;
    const ini = desde + m[1].length;
    return [m[2], ini, ini + m[2].length];
}

function _adjetivoConcordado(palabra, num, c) {
    const w = palabra.toLowerCase();
    const fijo = c?.adjetivos?.[num]?.[w];
    if (fijo) return _conCaja(palabra, fijo);
    for (const [suf, nuevo] of c?.sufijos?.[num] || []) {
        if (w.length > suf.length + 1 && w.endsWith(suf)) return _conCaja(palabra, w.slice(0, -suf.length) + nuevo);
    }
    return null;
}

function _femenina(palabra, num, c) {
    const w = palabra.toLowerCase();
    if ((c?.neutras || []).includes(w)) return false;
    return num === 'pl' ? w.endsWith('as') : w.endsWith('a');
}

/** ¿La cláusula que sigue vuelve sobre la palabra en femenino? («májalas», «ellas», «hasta que estén blandas») */
function _clausulaInsegura(resto, num, c) {
    const corte = _FIN_DE_CLAUSULA.exec(resto);
    const clausula = corte ? resto.slice(0, corte.index) : resto;
    const toks = clausula.match(/\p{L}+/gu) || [];
    const sufijo = num === 'pl' ? 'las' : 'la';
    const encl = new Set(c?.encliticos?.[num] || []);
    const copulas = new Set(c?.copulas || []);
    const adverbios = new Set(c?.adverbios || []);
    for (let i = 0; i < toks.length; i++) {
        const w = toks[i].toLowerCase();
        if (encl.has(w) || (w.length >= 5 && w.endsWith(sufijo) && _ACENTO.test(w))) return true;
        if (copulas.has(w)) {
            for (const sig of toks.slice(i + 1, i + 4)) {
                if (adverbios.has(sig.toLowerCase())) continue;
                if (_femenina(sig, num, c)) return true;
                break;
            }
        }
    }
    return false;
}

/** Las ediciones de concordancia para sustituir [ini, fin) por un nombre de otro género, o null si no es seguro. */
function _concordar(texto, ini, fin, n, fila, ocupados) {
    const c = LEXICO?.concordancia?.[`${fila.genero[0]}>${fila.genero[1]}`];
    if (!c) return null;
    const num = n ? 'pl' : 'sg';
    const dets = c?.determinantes?.[num] || {};
    const ediciones = [];
    const prev = _palabraPrevia(texto, ini);
    if (prev) {
        const [palabra, pIni, pFin] = prev;
        const nuevo = dets[palabra.toLowerCase()];
        if (nuevo) {
            const antes = _palabraPrevia(texto, pIni);
            const contr = antes && num === 'sg' && palabra.toLowerCase() === 'la'
                ? c?.contracciones?.[antes[0].toLowerCase()] : null;
            if (contr) {
                ediciones.push([antes[1], pFin, _conCaja(antes[0], contr)]);
            } else {
                ediciones.push([pIni, pFin, _conCaja(palabra, nuevo)]);
                if (antes && dets[antes[0].toLowerCase()]) {
                    ediciones.push([antes[1], antes[2], _conCaja(antes[0], dets[antes[0].toLowerCase()])]);
                }
            }
        } else if (_femenina(palabra, num, c)) {
            return null;
        }
    }
    const adjetivos = [];
    let pos = fin;
    for (let k = 0; k < 4; k++) {
        // «habichuelas negras (frijoles negros) cocidas»: la glosa que ya traía el texto sobra y se sigue concordando
        const ya = _glosaYaEscrita(texto, pos, [fila.a[n], ...adjetivos.map((a) => a.toLowerCase())].join(' '));
        if (ya) {
            ediciones.push([pos, pos + ya, '']);
            pos += ya;
        }
        const sig = _palabraSiguiente(texto, pos);
        if (!sig) break;
        const nuevo = _adjetivoConcordado(sig[0], num, c);
        if (!nuevo) {
            if (_femenina(sig[0], num, c)) return null;
            break;
        }
        ediciones.push([sig[1], sig[2], nuevo]);
        adjetivos.push(nuevo);
        pos = sig[2];
    }
    if (ediciones.some(([a, b]) => _solapa(a, b, ocupados))) return null;
    if (_clausulaInsegura(texto.slice(pos), num, c)) return ['glosa', adjetivos, pos];
    return [ediciones, adjetivos, pos];
}

/** Largo de « (destino)» justo en `desde` (0 si no está): el texto ya traía la glosa de lo que se sustituye. */
function _glosaYaEscrita(texto, desde, destino) {
    const g = new RegExp(`^\\s*\\(${_escapar(destino)}\\)`, 'iu').exec(texto.slice(desde));
    return g ? g[0].length : 0;
}

function _ediciones(texto, pais, ambito = 'texto') {
    const ediciones = [];
    const inserciones = [];
    const ocupados = [];
    const glosadas = new Set();
    for (const [forma, n, fila] of _patrones(pais, ambito)) {
        const re = _patron(forma);
        let m;
        while ((m = re.exec(texto)) !== null) {
            const ini = m.index;
            const fin = ini + m[0].length;
            if (_solapa(ini, fin, ocupados)) continue;
            const destino = fila.a[n];
            if (fila.genero[0] === fila.genero[1]) {
                // «ají morrón (pimiento)» → «pimiento»: la glosa que ya traía el texto sobra
                let finTotal = fin + _glosaYaEscrita(texto, fin, destino);
                // «queso blanco fresco» → «queso fresco», no «queso fresco fresco»
                const sig = _palabraSiguiente(texto, finTotal);
                const ultima = destino.split(' ').pop().toLowerCase();
                if (sig && destino.includes(' ') && sig[0].toLowerCase() === ultima) finTotal = sig[2];
                ediciones.push([ini, finTotal, _conCaja(m[0], destino)]);
                ocupados.push([ini, finTotal]);
                continue;
            }
            const r = _concordar(texto, ini, fin, n, fila, ocupados);
            if (r === null || r[0] === 'glosa') {
                // no es seguro sustituir: se glosa la primera vez, tras el sintagma («habichuelas negras (frijoles negros)»)
                ocupados.push([ini, fin]);
                const [adjetivos, posGlosa] = r !== null ? [r[1], r[2]] : [[], fin];
                if (!glosadas.has(fila.de[n])) {
                    glosadas.add(fila.de[n]);
                    const glosa = [destino, ...adjetivos.map((a) => a.toLowerCase())].join(' ');
                    const ya = new RegExp(`^\\s*\\(${_escapar(glosa)}\\)`, 'iu');
                    if (!ya.test(texto.slice(posGlosa))) inserciones.push([posGlosa, ` (${glosa})`]);
                }
                continue;
            }
            const [eds, , pos] = r;
            ediciones.push([ini, fin, _conCaja(m[0], destino)], ...eds);
            ocupados.push([Math.min(ini, ...eds.map((e) => e[0])), Math.max(pos, ...eds.map((e) => e[1]))]);
        }
    }
    return [ediciones, inserciones, ocupados];
}

function _aplicar(texto, ediciones, inserciones) {
    // Del final al principio; a igual posición, la sustitución antes que la inserción (la glosa queda delante).
    const ops = [
        ...ediciones.map(([a, b, s]) => [a, 1, b, s]),
        ...inserciones.map(([p, s]) => [p, 0, p, s]),
    ];
    ops.sort((x, y) => (y[0] - x[0]) || (y[1] - x[1]));
    let out = texto;
    for (const [a, , b, s] of ops) out = out.slice(0, a) + s + out.slice(b);
    return out;
}

/** Solo el léxico del país (sin la glosa del 649). */
export function localizarTexto(texto, pais = getPaisDelUsuario()) {
    if (typeof texto !== 'string' || !texto || !lexicoDeVistaActivo()) return texto;
    const [ediciones, inserciones] = _ediciones(texto, _pais(pais));
    if (!ediciones.length && !inserciones.length) return texto;
    return _aplicar(texto, ediciones, inserciones);
}

/**
 * El texto de un plato (nombre, descripción, ingrediente o paso) como lo lee un hispanohablante de `pais`: el léxico
 * del país y, en la MISMA pasada, la glosa del 649 para lo que el léxico no cubre. Knob apagado ⇒ solo la glosa.
 */
export function textoParaLeer(texto, pais = getPaisDelUsuario()) {
    if (typeof texto !== 'string' || !texto) return texto;
    const p = _pais(pais);
    const [ediciones, inserciones, ocupados] = lexicoDeVistaActivo() ? _ediciones(texto, p) : [[], [], []];
    const todas = [...inserciones, ...glosasDelTexto(texto, p, [...ocupados])];
    if (!ediciones.length && !todas.length) return texto;
    return _aplicar(texto, ediciones, todas);
}

/** Igual que `textoParaLeer`, respetando la forma: un array elemento a elemento (el MISMO array si nada cambia). */
export function textoParaLeerValor(valor, pais = getPaisDelUsuario()) {
    if (Array.isArray(valor)) {
        const nuevo = valor.map((v) => textoParaLeer(v, pais));
        return nuevo.some((v, i) => v !== valor[i]) ? nuevo : valor;
    }
    return textoParaLeer(valor, pais);
}

/** El nombre de un alimento de la lista de compras (sin glosa: la lista lleva la suya). */
export function nombreDeListaParaLeer(nombre, pais = getPaisDelUsuario()) {
    if (typeof nombre !== 'string' || !nombre || !lexicoDeVistaActivo()) return nombre;
    const [ediciones] = _ediciones(nombre, _pais(pais));
    return ediciones.length ? _aplicar(nombre, ediciones, []) : nombre;
}

const _CANTIDAD_Y_ENVASE = /^(\s*\d+(?:[.,]\d+)?(?:\s*[½¼¾⅓⅔])?\s+|\s*[½¼¾⅓⅔]\s+)(\p{L}+)/u;

/** La cantidad de la lista con el envase del país («1 funda (1 Lb)» → «1 bolsa (1 Lb)»); nunca dentro del paréntesis. */
export function envaseParaLeer(cantidad, pais = getPaisDelUsuario()) {
    if (typeof cantidad !== 'string' || !cantidad || !lexicoDeVistaActivo()) return cantidad;
    const envases = {};
    for (const fila of filasDelLexico(pais)) {
        if (fila.ambito === 'envase') for (const n of [0, 1]) envases[fila.de[n].toLowerCase()] = fila.a[n];
    }
    const m = _CANTIDAD_Y_ENVASE.exec(cantidad);
    const destino = m && envases[m[2].toLowerCase()];
    if (!destino) return cantidad;
    return m[1] + _conCaja(m[2], destino) + cantidad.slice(m[0].length);
}
