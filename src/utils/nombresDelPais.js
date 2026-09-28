// [P1-PLAN-LOTE-649 · 2026-09-27] El nombre local del alimento, entre paréntesis, para quien lee en español fuera de RD.
//
// El identificador de cada alimento es el canónico dominicano en los seis países —con él resuelven la Nevera, el guard
// de coherencia y el backstop de alergias— y el plan lo copia: en España salía «1 guineo mediano». No se sustituye
// (rompería el motor y la concordancia: «la batata asada» → «la boniato asada»); se GLOSA la primera vez que aparece en
// cada texto: «1 guineo (plátano) mediano». La tabla es espejo de `backend/data/food_names_i18n.json`
// (`nombre_por_pais`, SSOT); `backend/tests/test_p1_plan_lote_649.py` los compara.
import NOMBRES_POR_PAIS from '../data/nombresPorPais.json';

let _pais = null;

/** El país con que se lee (el del perfil). Solo cuenta si tiene tabla: RD y EE. UU. no la tienen. */
export function setPaisDeLectura(pais) {
    const p = typeof pais === 'string' ? pais.trim().toUpperCase() : '';
    _pais = NOMBRES_POR_PAIS[p] ? p : null;
}

export const getPaisDeLectura = () => _pais;

/** Cómo llaman al alimento `canonico` en el país de lectura, o '' (sin país o si allí se llama igual). */
export function nombreLocal(canonico, pais = _pais) {
    const tabla = NOMBRES_POR_PAIS[typeof pais === 'string' ? pais.toUpperCase() : ''];
    return (tabla && typeof canonico === 'string' && tabla[canonico.trim()]) || '';
}

const _escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Los patrones por país, del nombre más largo al más corto («guineo verde» antes que «guineo»).
const _patrones = {};
function _patronesDe(pais) {
    if (!_patrones[pais]) {
        _patrones[pais] = Object.entries(NOMBRES_POR_PAIS[pais] || {})
            .sort((a, b) => b[0].length - a[0].length)
            .map(([canon, local]) => ({
                local,
                re: new RegExp(`(?<![\\p{L}\\p{N}])${_escapar(canon)}(?![\\p{L}\\p{N}])`, 'giu'),
                yaGlosado: new RegExp(`^\\s*\\(${_escapar(local)}\\)`, 'iu'),
            }));
    }
    return _patrones[pais];
}

/** `texto` con el nombre local de `pais` tras la primera aparición de cada alimento; igual si no hay nada que glosar. */
export function glosarTexto(texto, pais = _pais) {
    const p = typeof pais === 'string' ? pais.toUpperCase() : '';
    if (typeof texto !== 'string' || !texto || !NOMBRES_POR_PAIS[p]) return texto;
    const ocupados = [];
    const inserciones = [];
    for (const { local, re, yaGlosado } of _patronesDe(p)) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(texto)) !== null) {
            const ini = m.index;
            const fin = ini + m[0].length;
            if (ocupados.some(([a, b]) => ini < b && fin > a)) continue;   // dentro de un nombre más largo
            ocupados.push([ini, fin]);
            if (!yaGlosado.test(texto.slice(fin))) inserciones.push([fin, ` (${local})`]);
            break;   // solo la primera vez en este texto
        }
    }
    if (!inserciones.length) return texto;
    let out = texto;
    for (const [pos, glosa] of inserciones.sort((a, b) => b[0] - a[0])) out = out.slice(0, pos) + glosa + out.slice(pos);
    return out;
}

/** Igual que `glosarTexto`, respetando la forma: un array se glosa elemento a elemento; lo demás, tal cual. */
export function glosarValor(valor, pais = _pais) {
    if (Array.isArray(valor)) {
        const nuevo = valor.map((v) => glosarTexto(v, pais));
        return nuevo.some((v, i) => v !== valor[i]) ? nuevo : valor;
    }
    return glosarTexto(valor, pais);
}
