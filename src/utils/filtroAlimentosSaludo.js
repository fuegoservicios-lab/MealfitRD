// frontend/src/utils/filtroAlimentosSaludo.js
// Filtro determinista y fail-secure de alimentos para el saludo automático del Coach.
// Garantiza que ningún saludo sugiera jamás un alimento incompatible con alergias,
// intolerancias, dieta (vegana/vegetariana/pescetariana), rechazos o condiciones delicadas.

const _SENTINELS = new Set([
    'ninguna', 'ninguno', 'none', 'no', 'n/a', 'na', 'nada', 'sin alergias', 'sin restricciones', 'ningun',
]);

const _CLASES_ALERGIA = [
    ['pescado', /\b(pescad\w*|fish\w*|atun\w*|tuna|salmon\w*|sardin\w*|bacalao|merluz\w*|truch\w*|tilapi\w*|dorad\w*|chillo|anchoa\w*|caball\w*|jurel|peixe\w*|poisson\w*|pesc[ei]\w*)\b/],
    ['mariscos', /\b(marisc\w*|camaron\w*|gamb\w*|shrimp\w*|langost\w*|cangrej\w*|pulpo|calamar\w*|mejillon\w*|almej\w*|ostr\w*|shellfish|crustac\w*|frutos del mar|seafood)\b/],
    ['pollo', /\b(pollo\w*|pechug\w*|chicken|frango|poulet|ave|aves|poultry|gallin\w*)\b/],
    ['pavo', /\b(pavo\w*|turkey|peru|dinde|tacchin\w*|ave|aves|poultry)\b/],
    ['res', /\b(res|carne\w*|terner\w*|beef|vaca|buey|bife|steak|cerdo|puerco|pork|chulet\w*|tocin\w*|jamon\w*)\b/],
    ['huevo', /\b(huevo\w*|clara\w*|yema\w*|egg\w*|ovo\w*|oeuf\w*|uov\w*|omelet\w*|revoltill\w*)\b/],
    ['lacteos', /\b(lacte\w*|lactos\w*|leche\w*|yogur\w*|queso\w*|cottag\w*|suero|whey|casein\w*|dair\w*|milk|chees\w*|crema\w*|mantequill\w*|aplv|plv|cmpa|kefir|ricott\w*)\b/],
    ['soya', /\b(soya|soja|soy\w*|tofu|edamam\w*|tempeh|miso|tamari)\b/],
    ['legumbres', /\b(habichuel\w*|lentej\w*|garbanz\w*|frijol\w*|porot\w*|guandul\w*|legumbr\w*|bean\w*|lentil\w*|chickpea\w*|guisant\w*)\b/],
    ['gluten', /\b(gluten|trig\w*|avena\w*|pan|pastas?|cebad\w*|centen\w*|wheat|oat\w*|celiac\w*)\b/],
    ['mani_nueces', /\b(mani\w*|cacahuat\w*|peanut\w*|nuez|nueces|almendr\w*|frutos?\s+secos?|pistach\w*|avellan\w*|cashew\w*|cajuil\w*|sesam\w*|ajonjoli\w*|nut\w*)\b/],
    ['fruta', /\b(frut\w*|guineo\w*|platan\w*|banan\w*|manzan\w*|apple\w*|fres\w*|strawberr\w*|lechos\w*|papay\w*|pina\w*|mango\w*|citric\w*|naranj\w*|kiwi\w*|melon\w*|sandi\w*)\b/],
];

const _CONDICIONES_DELICADAS_RX = /\b(bariatric\w*|renal\w*|rinon\w*|kidney|dialis\w*|embaraz\w*|pregnan\w*|lactanc\w*|breastfeed\w*|otra\s+condicion|other\s+condition|fenilcetonur\w*|crohn|colitis|ulcer\w*|gastrit\w*)\b/;
const _DIABETES_RX = /\b(diabet\w*|insulin\w*|glucem\w*|prediabet\w*)\b/;

export function normalizarTextoFiltro(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function _aListaCruda(valor) {
    if (!valor) return [];
    if (Array.isArray(valor)) return valor.flatMap(_aListaCruda);
    if (typeof valor === 'string') {
        return valor
            .split(/[;,/\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);
    }
    return [];
}

function _limpiarLista(valores) {
    const vistos = new Set();
    const out = [];
    for (const item of _aListaCruda(valores)) {
        const norm = normalizarTextoFiltro(item);
        if (!norm || _SENTINELS.has(norm) || vistos.has(norm)) continue;
        vistos.add(norm);
        out.push(norm);
    }
    return out;
}

function _normalizarDieta(raw) {
    const d = normalizarTextoFiltro(raw);
    if (!d) return 'balanced';
    if (d.includes('vegan')) return 'vegan';
    if (d.includes('vegetar')) return 'vegetarian';
    if (d.includes('pescet') || d.includes('pescat')) return 'pescatarian';
    return 'balanced';
}

function _clasesEnTexto(textoNorm) {
    const encontradas = [];
    for (const [clase, rx] of _CLASES_ALERGIA) {
        if (rx.test(textoNorm)) encontradas.push(clase);
    }
    return encontradas;
}

/**
 * Extrae alergias, intolerancias, dieta, rechazos y condiciones médicas desde
 * `userProfile` y `formData` (mezclados de forma conservadora: si cualquiera
 * declara una restricción, se respeta siempre).
 */
export function extraerPerfilAlimentario(userProfile = null, formData = null) {
    const hp = (userProfile && typeof userProfile.health_profile === 'object' && userProfile.health_profile) || {};
    const fd = formData && typeof formData === 'object' ? formData : {};
    const up = userProfile && typeof userProfile === 'object' ? userProfile : {};

    const alergias = _limpiarLista([
        hp.allergies,
        hp.otherAllergies,
        up.allergies,
        up.otherAllergies,
        fd.allergies,
        fd.otherAllergies,
    ]);
    const rechazos = _limpiarLista([
        hp.dislikes,
        hp.otherDislikes,
        up.dislikes,
        up.otherDislikes,
        fd.dislikes,
        fd.otherDislikes,
    ]);
    const condiciones = _limpiarLista([
        hp.medicalConditions,
        hp.otherConditions,
        up.medicalConditions,
        up.otherConditions,
        fd.medicalConditions,
        fd.otherConditions,
    ]);

    const dieta = _normalizarDieta(
        fd.dietType || hp.dietType || up.dietType || (Array.isArray(hp.dietTypes) ? hp.dietTypes[0] : ''),
    );

    const bloqueado = new Set();
    let tieneAlergiaDesconocida = false;

    for (const item of alergias) {
        const clases = _clasesEnTexto(item);
        if (clases.length === 0) {
            tieneAlergiaDesconocida = true;
        } else {
            for (const c of clases) bloqueado.add(c);
        }
    }

    for (const item of rechazos) {
        for (const c of _clasesEnTexto(item)) bloqueado.add(c);
    }

    if (dieta === 'vegan') {
        ['pollo', 'pavo', 'res', 'pescado', 'mariscos', 'huevo', 'lacteos'].forEach((c) => bloqueado.add(c));
    } else if (dieta === 'vegetarian') {
        ['pollo', 'pavo', 'res', 'pescado', 'mariscos'].forEach((c) => bloqueado.add(c));
    } else if (dieta === 'pescatarian') {
        ['pollo', 'pavo', 'res'].forEach((c) => bloqueado.add(c));
    }

    const condicionesTexto = condiciones.join(' ');
    const tieneCondicionDelicada = _CONDICIONES_DELICADAS_RX.test(condicionesTexto);
    const tieneDiabetes = _DIABETES_RX.test(condicionesTexto);

    return {
        dieta,
        alergias,
        rechazos,
        condiciones,
        bloqueado,
        tieneAlergiaDesconocida,
        tieneCondicionDelicada,
        tieneDiabetes,
        restringido: alergias.length > 0 || rechazos.length > 0 || dieta !== 'balanced' || condiciones.length > 0,
    };
}

function _hash(s) {
    let h = 2166136261;
    for (const ch of String(s)) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function _coincideTextoProhibido(textoNorm, listaProhibida) {
    for (const entrada of listaProhibida || []) {
        const tokens = entrada.match(/[a-z]{4,}/g) || [];
        for (const tok of tokens) {
            const raiz = tok.endsWith('s') ? tok.slice(0, -1) : tok;
            if (raiz.length >= 4 && textoNorm.includes(raiz)) return true;
        }
    }
    return false;
}

function _candidatosPorTipo(tipo, t) {
    if (tipo === 'fuerte') {
        return [
            { id: 'pollo', tags: ['pollo'], texto: t('pechuga de pollo'), comidoRx: /pollo|pechug/ },
            { id: 'pavo', tags: ['pavo'], texto: t('pavo a la plancha'), comidoRx: /pavo/ },
            { id: 'res', tags: ['res'], texto: t('carne magra de res'), comidoRx: /\bres\b|carne|bistec|filete/ },
            { id: 'pescado', tags: ['pescado'], texto: t('filete de pescado'), comidoRx: /pescad|salmon|tilapi|merluz|bacalao/ },
            { id: 'atun', tags: ['pescado'], texto: t('atún al natural'), comidoRx: /atun/ },
            { id: 'huevos', tags: ['huevo'], texto: t('huevos con claras'), comidoRx: /huevo|clara|omelet|revoltill/ },
            { id: 'griego', tags: ['lacteos'], texto: t('yogur griego o queso cottage'), comidoRx: /yogur|cottag|queso/ },
            { id: 'tofu', tags: ['soya'], texto: t('tofu firme o tempeh'), comidoRx: /tofu|tempeh|soya|soja/ },
            { id: 'legumbres', tags: ['legumbres'], texto: t('lentejas o garbanzos'), comidoRx: /lentej|garbanz|habichuel/ },
        ];
    }
    if (tipo === 'ligera') {
        return [
            { id: 'huevos', tags: ['huevo'], texto: t('un par de huevos'), comidoRx: /huevo|clara|omelet|revoltill/ },
            { id: 'griego', tags: ['lacteos'], texto: t('un yogur griego'), comidoRx: /yogur/ },
            { id: 'pavo', tags: ['pavo'], texto: t('unas lonjas de pavo'), comidoRx: /pavo/ },
            { id: 'pollo', tags: ['pollo'], texto: t('algo de pechuga de pollo'), comidoRx: /pollo|pechug/ },
            { id: 'atun', tags: ['pescado'], texto: t('una lata de atún'), comidoRx: /atun|pescad/ },
            { id: 'edamame', tags: ['soya'], texto: t('edamame o tofu'), comidoRx: /edamam|tofu|soya|soja/ },
            { id: 'legumbres', tags: ['legumbres'], texto: t('unas lentejas o garbanzos'), comidoRx: /lentej|garbanz|habichuel/ },
        ];
    }
    // tipo === 'madrugada'
    return [
        { id: 'yogur', tags: ['lacteos'], texto: t('un yogur natural') },
        { id: 'fruta', tags: ['fruta'], texto: t('una fruta'), evitarEnDiabetes: true },
        { id: 'huevo', tags: ['huevo'], texto: t('un huevo hervido') },
        { id: 'edamame', tags: ['soya'], texto: t('un puñado de edamame') },
    ];
}

/**
 * Elige 1-2 alimentos 100 % compatibles con el perfil alimentario del usuario.
 * Si el perfil tiene alergias desconocidas o condiciones delicadas (o no hay
 * opciones válidas), devuelve `''` (fail-secure: el saludo no nombra comida).
 */
export function elegirOpcionesSeguras({ perfil = null, tipo = 'fuerte', yaComidoHoy = [], semilla = '', t }) {
    const p = perfil && typeof perfil === 'object' ? perfil : extraerPerfilAlimentario();
    if (p.tieneAlergiaDesconocida || p.tieneCondicionDelicada) return '';

    const bloqueado = p.bloqueado instanceof Set ? p.bloqueado : new Set();
    const prohibidas = [...(p.alergias || []), ...(p.rechazos || [])];
    const comidoNorm = normalizarTextoFiltro((Array.isArray(yaComidoHoy) ? yaComidoHoy : []).join(' '));

    const seguros = _candidatosPorTipo(tipo, t).filter((cand) => {
        if (cand.tags.some((tag) => bloqueado.has(tag))) return false;
        if (cand.evitarEnDiabetes && p.tieneDiabetes) return false;
        if (_coincideTextoProhibido(normalizarTextoFiltro(cand.texto), prohibidas)) return false;
        return true;
    });

    if (seguros.length === 0) return '';

    const frescos = comidoNorm
        ? seguros.filter((cand) => !cand.comidoRx || !cand.comidoRx.test(comidoNorm))
        : seguros;
    const pool = frescos.length > 0 ? frescos : seguros;

    const idx1 = _hash(`${semilla}|opt1|${tipo}`) % pool.length;
    const primero = pool[idx1];
    if (pool.length === 1) return primero.texto;

    const resto = pool.filter((c) => c.id !== primero.id);
    const idx2 = _hash(`${semilla}|opt2|${tipo}`) % resto.length;
    const segundo = resto[idx2];

    return t('{a} o {b}', { a: primero.texto, b: segundo.texto });
}
