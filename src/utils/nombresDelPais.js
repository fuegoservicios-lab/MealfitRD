// [P1-PLAN-LOTE-649 · 2026-09-27] El nombre local del alimento, entre paréntesis, para quien lee en español fuera de RD.
//
// El identificador de cada alimento es el canónico dominicano en los seis países —con él resuelven la Nevera, el guard
// de coherencia y el backstop de alergias— y el plan lo copia: en España salía «1 guineo mediano». No se sustituye
// (rompería el motor y la concordancia: «la batata asada» → «la boniato asada»); se GLOSA la primera vez que aparece en
// cada texto: «1 guineo (plátano) mediano». La tabla es espejo de `backend/data/food_names_i18n.json`
// (`nombre_por_pais`, SSOT); `backend/tests/test_p1_plan_lote_649.py` los compara.
import NOMBRES_POR_PAIS from '../data/nombresPorPais.json';
import { getLocale } from '../i18n';
import { formatRegionFor, getPaisDelUsuario, setPaisDeLectura } from './paisDelUsuario';

// [P1-PLAN-LOTE-702] El estado vive en `paisDelUsuario.js` (el arranque lo fija sin cargar esta tabla).
export { getPaisDelUsuario, setPaisDeLectura };

/** El país del perfil si tiene tabla de nombres (RD y EE. UU. no la tienen), o null. Para los °F cuenta US y PR. */
export const getPaisDeLectura = () => {
    const p = getPaisDelUsuario();
    return p && NOMBRES_POR_PAIS[p] ? p : null;
};

/** Cómo llaman al alimento `canonico` en el país de lectura, o '' (sin país o si allí se llama igual). */
export function nombreLocal(canonico, pais = getPaisDeLectura()) {
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
export function glosarTexto(texto, pais = getPaisDeLectura()) {
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
export function glosarValor(valor, pais = getPaisDeLectura()) {
    if (Array.isArray(valor)) {
        const nuevo = valor.map((v) => glosarTexto(v, pais));
        return nuevo.some((v, i) => v !== valor[i]) ? nuevo : valor;
    }
    return glosarTexto(valor, pais);
}

// [P1-PLAN-LOTE-650 · 2026-09-27] (G84) En EE. UU. y Puerto Rico el horno y el termómetro marcan °F: se añade la
// conversión entre paréntesis, redondeada a 5 («180°C (355 °F)»). Va con el PAÍS, en cualquier idioma.
const PAISES_FAHRENHEIT = new Set(['US', 'PR']);
const _GRADOS_C = /(\d{2,3})(\s*[°º]\s*C)(?![A-Za-z])(?!\s*\(\s*\d{2,3}\s*°\s*F\))/g;

/** `texto` con los °F tras cada temperatura en °C, solo si `pais` es US o PR. */
export function conFahrenheit(texto, pais = getPaisDelUsuario()) {
    if (typeof texto !== 'string' || !texto || !PAISES_FAHRENHEIT.has(pais)) return texto;
    return texto.replace(_GRADOS_C, (todo, c, sufijo) => {
        const f = Math.round((Number(c) * 9 / 5 + 32) / 5) * 5;
        return `${c}${sufijo} (${f} °F)`;
    });
}

/** Igual que `conFahrenheit`, respetando la forma (array → elemento a elemento; mismo array si nada cambia). */
export function conFahrenheitValor(valor, pais = getPaisDelUsuario()) {
    if (Array.isArray(valor)) {
        const nuevo = valor.map((v) => conFahrenheit(v, pais));
        return nuevo.some((v, i) => v !== valor[i]) ? nuevo : valor;
    }
    return conFahrenheit(valor, pais);
}

// [P1-PLAN-LOTE-708 · 2026-09-28] (G84) En EE. UU. y Puerto Rico, las onzas al lado de los gramos y mililitros del plan
// («180 g (6.3 oz) de pollo»), como los °F: sólo al pintar, en cualquier idioma, sin tocar el dato ni ningún nombre.
// Las pizcas (<15 g/ml) no se convierten. El separador decimal es el del idioma con la región del país.
const _A_IMPERIAL = [
    [/^(kilogramos?|kg)$/iu, (n) => [n * 2.20462, 'lb']],
    [/^(gramos?|gr|g)$/iu, (n) => (n >= 15 ? [n / 28.3495, 'oz'] : null)],
    [/^(mililitros?|ml)$/iu, (n) => (n >= 15 ? [n / 29.5735, 'fl oz'] : null)],
    [/^(litros?|l)$/iu, (n) => [n * 1.05669, 'qt']],
];
const _CANTIDAD_METRICA = /(?<![\p{L}\p{N}.,/])(\d+(?:[.,]\d+)?)(\s*)(kilogramos?|kg|gramos?|gr|g|mililitros?|ml|litros?|l)(?![\p{L}\p{N}])(?!\s*\(\s*[\d.,]+\s*(?:oz|lb|fl oz|qt)\))/giu;

/** `texto` con la medida imperial tras cada cantidad métrica, sólo si `pais` es US o PR. */
export function conOnzas(texto, pais = getPaisDelUsuario()) {
    if (typeof texto !== 'string' || !texto || !PAISES_FAHRENHEIT.has(pais)) return texto;
    let fmt;
    try {
        fmt = (d) => new Intl.NumberFormat(formatRegionFor(pais, getLocale()), { maximumFractionDigits: d });
    } catch {
        return texto;
    }
    return texto.replace(_CANTIDAD_METRICA, (todo, num, esp, unidad) => {
        const n = Number(num.replace(',', '.'));
        const regla = _A_IMPERIAL.find(([re]) => re.test(unidad));
        const conv = regla && Number.isFinite(n) ? regla[1](n) : null;
        if (!conv) return todo;
        const [v, u] = conv;
        try {
            return `${num}${esp}${unidad} (${fmt(v < 10 ? 1 : 0).format(v)} ${u})`;
        } catch {
            return todo;
        }
    });
}

/** Igual que `conOnzas`, respetando la forma (array → elemento a elemento; mismo array si nada cambia). */
export function conOnzasValor(valor, pais = getPaisDelUsuario()) {
    if (Array.isArray(valor)) {
        const nuevo = valor.map((v) => conOnzas(v, pais));
        return nuevo.some((v, i) => v !== valor[i]) ? nuevo : valor;
    }
    return conOnzas(valor, pais);
}
