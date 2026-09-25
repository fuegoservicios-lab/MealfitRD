// [P1-PLAN-LOTE-225 · 2026-09-24] El panel de micronutrientes, en el idioma del usuario.
//
// El backend compone en español el nombre de cada micronutriente, su nota («Refuerza con…»), las notas especiales
// (potasio con medicación, fibra con enfermedad renal, techo o piso estimados, sin fuente segura) y el consejo de
// suplemento (nombre, dosis, alimentos, precaución), y todo eso queda guardado en el plan. Se pintaba crudo: español en
// los cuatro idiomas, en el panel más mirado del Dashboard. Aquí se traduce AL PINTAR, sin tocar el dato: el nombre
// por la CLAVE del nutriente y los textos por coincidencia exacta con los literales del backend, que este archivo
// declara (`i18nKey`) y que `test_p1_plan_lote_225.py` compara con `micronutrients.py` y `micros_seguros.py`: si el
// backend cambia una coma, el test lo dice antes de que el panel vuelva al español sin que nadie lo note.
//
// Lo que no se reconoce se pinta tal cual (en español): nunca una clave ni un hueco. En es-DO todo sale byte-idéntico.
import { getLocale, i18nKey, formatPercent } from '../i18n';

/** Espejo de `micronutrients._LABELS`. */
export const ETIQUETAS_MICRO = {
    fiber_g: i18nKey("Fibra"),
    sodium_mg: i18nKey("Sodio"),
    free_sugars_g: i18nKey("Azúcares añadidos"),
    vit_d_mcg: i18nKey("Vitamina D"),
    calcium_mg: i18nKey("Calcio"),
    iron_mg: i18nKey("Hierro"),
    b12_mcg: i18nKey("Vitamina B12"),
    potassium_mg: i18nKey("Potasio"),
    magnesium_mg: i18nKey("Magnesio"),
    saturated_fat_g: i18nKey("Grasa saturada"),
    zinc_mg: i18nKey("Zinc"),
    folate_mcg: i18nKey("Folato"),
    vit_a_mcg: i18nKey("Vitamina A"),
    vit_c_mg: i18nKey("Vitamina C"),
    vit_e_mg: i18nKey("Vitamina E"),
    vit_k_mcg: i18nKey("Vitamina K"),
    selenium_mcg: i18nKey("Selenio"),
    omega3_g: i18nKey("Omega-3"),
};

/** Espejo de `micronutrients._SUPPLEMENT_NOTE` (la nota de cada nutriente sin filtrar). */
export const NOTAS_MICRO = {
    fiber_g: i18nKey("Aumenta vegetales, frutas con cáscara, legumbres (habichuelas) y granos integrales."),
    vit_d_mcg: i18nKey("Una dieta de alimentos enteros rara vez alcanza la vit D: añade pescado graso (salmón/sardina 1-2x/sem) o lácteo fortificado, o considera un suplemento de 600-800 UI."),
    calcium_mg: i18nKey("Refuerza con lácteos (yogur/queso) o vegetales de hoja verde y sésamo."),
    iron_mg: i18nKey("Refuerza con legumbres (habichuelas), carnes rojas magras y hígado; acompaña con vit C (naranja/limón) para mejorar la absorción."),
    b12_mcg: i18nKey("Asegura fuentes animales (huevo, lácteos, carne, pescado); si eres vegano, suplemento de B12."),
    potassium_mg: i18nKey("Aumenta frutas, vegetales y legumbres (habichuelas, guineo, batata, espinaca)."),
    sodium_mg: i18nKey("Reduce la sal añadida (≤1 g/día) y usa especias sin sodio (ajo, comino, orégano, limón)."),
    free_sugars_g: i18nKey("Reduce miel/azúcares añadidos; endulza con fruta o estevia."),
    magnesium_mg: i18nKey("Aumenta vegetales de hoja verde, legumbres, nueces/semillas y granos integrales (clave del patrón DASH)."),
    saturated_fat_g: i18nKey("Reduce frituras, piel de pollo, grasa visible de carnes, embutidos, mantequilla y lácteos enteros; usa cocción al horno/plancha/hervido y grasas insaturadas (aguacate, aceite de oliva)."),
    zinc_mg: i18nKey("Refuerza con carnes (res/cerdo), mariscos, huevo, legumbres, nueces/semillas (calabaza/ajonjolí)."),
    folate_mcg: i18nKey("Aumenta vegetales de hoja verde, legumbres (habichuelas/lentejas), aguacate, cítricos y granos fortificados."),
    vit_a_mcg: i18nKey("Aumenta vegetales naranja/verde oscuro (zanahoria, auyama, batata, espinaca), huevo y lácteos."),
    vit_c_mg: i18nKey("Aumenta cítricos (naranja/limón), guayaba, pimiento/ají, brócoli y frutas frescas; ayuda a absorber el hierro."),
    vit_e_mg: i18nKey("Refuerza con nueces/semillas (almendra, girasol), aceites vegetales, aguacate y hoja verde."),
    vit_k_mcg: i18nKey("Se obtiene de vegetales de hoja verde (espinaca, brócoli). IMPORTANTE: si tomas anticoagulante (warfarina), NO la aumentes de golpe — mantén una ingesta CONSISTENTE y coordina con tu médico."),
    selenium_mcg: i18nKey("Refuerza con pescado/mariscos, huevo, carnes y nuez de Brasil (1-2 al día bastan)."),
    omega3_g: i18nKey("Aumenta pescado graso (sardina/salmón), linaza/chía, nueces y aceite de canola."),
};

/** Las notas que sustituyen a la de arriba según el perfil (espejo de micronutrients / micros_seguros). */
export const NOTAS_ESPECIALES = {
    potasio_medicacion: i18nKey("Mantén el potasio en porciones MODERADAS y parejas (no lo maximices): tu medicación puede elevar el potasio en sangre (riesgo de hiperkalemia). El balance fino lo define tu médico con análisis."),  // _POTASSIUM_RESTRICTED_NOTE
    fibra_renal: i18nKey("Aumenta la fibra con vegetales y frutas bajos en potasio (ej. manzana, pera, repollo, zanahoria, pepino) y avena; MODERA las leguminosas y granos muy altos en potasio/fósforo si tienes enfermedad renal — el balance fino lo define tu nefrólogo."),  // _FIBER_RENAL_NOTE
    techo_estimado: i18nKey("Estimado: algunos ingredientes no tienen dato de este nutriente en el catálogo, por lo que el total mostrado puede estar SUBESTIMADO y el valor real superar el techo. Verifícalo con tu nutricionista, especialmente si tienes una condición cardiometabólica."),  // _CEILING_ESTIMADO_NOTE
    sin_fuente_segura: i18nKey("Pide a tu nutricionista fuentes compatibles con tu alergia; aquí no hay una segura que sugerirte."),  // micros_seguros.SIN_FUENTE_SEGURA
};

/** La coletilla del piso incierto (`micronutrients._FLOOR_ESTIMADO_SUFIJO`), que se añade tras un espacio. */
export const SUFIJO_PISO_ESTIMADO = i18nKey("(Dato estimado: algunos ingredientes de tu plan no tienen este nutriente medido en el catálogo — el valor real puede ser mayor.)");

/** Espejo de `micros_seguros._NOTAS` + `_EXTRAS`: la nota que se recompone cuando las alergias quitan opciones.
 *  `plantilla` = prefijo + «{alimentos}» + sufijo; `opciones` = todas las que pueden aparecer en la lista. */
export const NOTAS_COMPUESTAS = {
    calcium_mg: {
        plantilla: i18nKey("Refuerza con {alimentos}."),
        // [I18N-EXEMPT: ancla para RECONOCER la nota del backend; lo que se pinta es `plantilla`, traducida]
        prefijo: "Refuerza con ",
        sufijo: ".",
        opciones: [i18nKey("lácteos (yogur/queso)"), i18nKey("vegetales de hoja verde"), i18nKey("sésamo"), i18nKey("bebidas vegetales fortificadas con calcio"), i18nKey("tofu cuajado con calcio")],
    },
    vit_d_mcg: {
        plantilla: i18nKey("Una dieta de alimentos enteros rara vez alcanza la vit D: añade {alimentos}, o considera un suplemento de 600-800 UI."),
        // [I18N-EXEMPT: ancla para RECONOCER la nota del backend; lo que se pinta es `plantilla`, traducida]
        prefijo: "Una dieta de alimentos enteros rara vez alcanza la vit D: añade ",
        sufijo: ", o considera un suplemento de 600-800 UI.",
        opciones: [i18nKey("pescado graso (salmón/sardina 1-2x/sem)"), i18nKey("lácteo fortificado"), i18nKey("bebidas vegetales fortificadas"), i18nKey("yema de huevo")],
    },
    b12_mcg: {
        plantilla: i18nKey("Asegura fuentes animales ({alimentos}); si eres vegano, suplemento de B12."),
        // [I18N-EXEMPT: ancla para RECONOCER la nota del backend; lo que se pinta es `plantilla`, traducida]
        prefijo: "Asegura fuentes animales (",
        sufijo: "); si eres vegano, suplemento de B12.",
        opciones: [i18nKey("huevo"), i18nKey("lácteos"), i18nKey("carne"), i18nKey("pescado")],
    },
    zinc_mg: {
        plantilla: i18nKey("Refuerza con {alimentos}."),
        // [I18N-EXEMPT: ancla para RECONOCER la nota del backend; lo que se pinta es `plantilla`, traducida]
        prefijo: "Refuerza con ",
        sufijo: ".",
        opciones: [i18nKey("carnes (res/cerdo)"), i18nKey("mariscos"), i18nKey("huevo"), i18nKey("legumbres"), i18nKey("nueces/semillas (calabaza/ajonjolí)")],
    },
    selenium_mcg: {
        plantilla: i18nKey("Refuerza con {alimentos}."),
        // [I18N-EXEMPT: ancla para RECONOCER la nota del backend; lo que se pinta es `plantilla`, traducida]
        prefijo: "Refuerza con ",
        sufijo: ".",
        opciones: [i18nKey("pescado/mariscos"), i18nKey("huevo"), i18nKey("carnes"), i18nKey("nuez de Brasil (1-2 al día bastan)")],
    },
    omega3_g: {
        plantilla: i18nKey("Aumenta {alimentos}."),
        // [I18N-EXEMPT: ancla para RECONOCER la nota del backend; lo que se pinta es `plantilla`, traducida]
        prefijo: "Aumenta ",
        sufijo: ".",
        opciones: [i18nKey("pescado graso (sardina/salmón)"), i18nKey("linaza/chía"), i18nKey("nueces"), i18nKey("aceite de canola")],
    },
    vit_e_mg: {
        plantilla: i18nKey("Refuerza con {alimentos}."),
        // [I18N-EXEMPT: ancla para RECONOCER la nota del backend; lo que se pinta es `plantilla`, traducida]
        prefijo: "Refuerza con ",
        sufijo: ".",
        opciones: [i18nKey("nueces/semillas (almendra, girasol)"), i18nKey("aceites vegetales"), i18nKey("aguacate"), i18nKey("hoja verde")],
    },
    magnesium_mg: {
        plantilla: i18nKey("Aumenta {alimentos} (clave del patrón DASH)."),
        // [I18N-EXEMPT: ancla para RECONOCER la nota del backend; lo que se pinta es `plantilla`, traducida]
        prefijo: "Aumenta ",
        sufijo: " (clave del patrón DASH).",
        opciones: [i18nKey("vegetales de hoja verde"), i18nKey("legumbres"), i18nKey("nueces/semillas"), i18nKey("granos integrales")],
    },
    vit_a_mcg: {
        plantilla: i18nKey("Aumenta {alimentos}."),
        // [I18N-EXEMPT: ancla para RECONOCER la nota del backend; lo que se pinta es `plantilla`, traducida]
        prefijo: "Aumenta ",
        sufijo: ".",
        opciones: [i18nKey("vegetales naranja/verde oscuro (zanahoria, auyama, batata, espinaca)"), i18nKey("huevo"), i18nKey("lácteos")],
    },
};

/** Espejo de `micronutrients._SUPPLEMENT_TEMPLATES`: nombre, dosis (todas las variantes) y precaución. */
export const TEXTOS_SUPLEMENTO = [
    i18nKey("Vitamina D3"),  // vit_d_mcg.nombre
    i18nKey("600–800 UI/día (15–20 mcg)"),  // vit_d_mcg.dosis
    i18nKey("no exceder 4000 UI/día sin control médico (UL)."),  // vit_d_mcg.precaucion
    i18nKey("Calcio (citrato o carbonato)"),  // calcium_mg.nombre
    i18nKey("500 mg/día solo si no alcanzas con la dieta"),  // calcium_mg.dosis
    i18nKey("tómalo separado del hierro (compiten); no exceder 2500 mg/día totales."),  // calcium_mg.precaucion
    i18nKey("Hierro (bisglicinato, mejor tolerado)"),  // iron_mg.nombre
    i18nKey("8 mg/día solo si hay déficit confirmado"),  // iron_mg.dosis_m
    i18nKey("18 mg/día (especialmente si menstrúas)"),  // iron_mg.dosis_f
    i18nKey("8 mg/día solo si hay déficit confirmado (post-menopausia)"),  // iron_mg.dosis_f_post
    i18nKey("27 mg/día (embarazo/lactancia) — bajo control prenatal/médico"),  // iron_mg.dosis_f_preg
    i18nKey("separado de lácteos/café/té; confirma déficit con análisis (ferritina) antes de suplementar dosis altas."),  // iron_mg.precaucion
    i18nKey("Vitamina B12 (cianocobalamina)"),  // b12_mcg.nombre
    i18nKey("2.4 mcg/día (o 250–500 mcg/sem si suplementas)"),  // b12_mcg.dosis
    i18nKey("ESENCIAL si tu dieta es vegana/vegetariana estricta — no es opcional en ese caso."),  // b12_mcg.precaucion
    i18nKey("Zinc (citrato o gluconato)"),  // zinc_mg.nombre
    i18nKey("8–11 mg/día solo si no alcanzas con la dieta"),  // zinc_mg.dosis
    i18nKey("no exceder 40 mg/día (UL); el exceso compite con el cobre."),  // zinc_mg.precaucion
    i18nKey("Ácido fólico / Folato"),  // folate_mcg.nombre
    i18nKey("400 mcg/día (600 mcg en embarazo, bajo control prenatal)"),  // folate_mcg.dosis
    i18nKey("en embarazo es ESENCIAL (tubo neural); confírmalo con tu médico antes/durante la gestación."),  // folate_mcg.precaucion
    i18nKey("Vitamina C (ácido ascórbico)"),  // vit_c_mg.nombre
    i18nKey("75–90 mg/día solo si no alcanzas con fruta/vegetales"),  // vit_c_mg.dosis
    i18nKey("no exceder 2000 mg/día (UL); dosis altas pueden causar molestias digestivas."),  // vit_c_mg.precaucion
    i18nKey("Omega-3 (aceite de pescado EPA/DHA o de algas)"),  // omega3_g.nombre
    i18nKey("250–500 mg/día de EPA+DHA (o linaza/chía para ALA)"),  // omega3_g.dosis
    i18nKey("si tomas anticoagulante, consulta a tu médico (puede afectar la coagulación)."),  // omega3_g.precaucion
    i18nKey("Magnesio (glicinato o citrato)"),  // magnesium_mg.nombre
    i18nKey("200–350 mg/día solo si no alcanzas con la dieta (glicinato = mejor tolerado)"),  // magnesium_mg.dosis
    i18nKey("no exceder 350 mg/día en forma suplementaria (UL); el exceso es laxante. Precaución en enfermedad renal."),  // magnesium_mg.precaucion
    i18nKey("Vitamina E (d-alfa-tocoferol)"),  // vit_e_mg.nombre
    i18nKey("comida primero; ~15 mg/día solo si no alcanzas (evita dosis altas de rutina)"),  // vit_e_mg.dosis
    i18nKey("no exceder 1000 mg/día (UL); dosis altas + anticoagulante aumentan riesgo de sangrado."),  // vit_e_mg.precaucion
    i18nKey("Fibra (psyllium / cáscara de plántago)"),  // fiber_g.nombre
    i18nKey("comida primero; 5–10 g/día de psyllium si no alcanzas (sube gradual + agua)"),  // fiber_g.dosis
    i18nKey("aumenta gradual y con suficiente agua; sepáralo de medicamentos (puede reducir su absorción)."),  // fiber_g.precaucion
];

/** Los alimentos de cada suplemento, troceados como los trocea `micros_seguros._partes` (el filtro de alergias
 *  puede quitar cualquiera, así que se traducen de uno en uno). */
export const ALIMENTOS_SUPLEMENTO = [
    i18nKey("pescado graso (salmón/sardina enlatada 1–2x/sem)"),
    i18nKey("yema de huevo"),
    i18nKey("lácteo fortificado"),
    i18nKey("exposición solar 10–15 min"),
    i18nKey("yogur/queso"),
    i18nKey("sardina con espina"),
    i18nKey("vegetales de hoja verde"),
    i18nKey("sésamo/ajonjolí"),
    i18nKey("tofu"),
    i18nKey("habichuelas/lentejas"),
    i18nKey("carnes rojas magras"),
    i18nKey("hígado"),
    i18nKey("espinaca; acompaña con vit C (naranja/limón)"),
    i18nKey("huevo"),
    i18nKey("lácteos"),
    i18nKey("carne"),
    i18nKey("pescado"),
    i18nKey("carnes"),
    i18nKey("mariscos"),
    i18nKey("legumbres"),
    i18nKey("semillas de calabaza/ajonjolí"),
    i18nKey("hoja verde"),
    i18nKey("aguacate"),
    i18nKey("cítricos"),
    i18nKey("naranja/limón"),
    i18nKey("guayaba"),
    i18nKey("pimiento/ají"),
    i18nKey("brócoli"),
    i18nKey("pescado graso (sardina/salmón)"),
    i18nKey("linaza"),
    i18nKey("chía"),
    i18nKey("nueces"),
    i18nKey("nueces/semillas (calabaza/ajonjolí)"),
    i18nKey("avena"),
    i18nKey("cacao"),
    i18nKey("almendras/avellanas"),
    i18nKey("semillas de girasol"),
    i18nKey("aceites vegetales"),
    i18nKey("frutas con cáscara"),
    i18nKey("vegetales"),
    i18nKey("granos integrales"),
    i18nKey("linaza/chía"),
];

/** El aviso del consejo de suplementos (`build_supplement_recommendations`). */
export const AVISO_SUPLEMENTOS = i18nKey("Orientativo, no es una prescripción. Cubre los gaps con comida primero y consulta a tu médico antes de tomar suplementos (la dosis depende de tu análisis y tu caso).");

/** El aviso del informe (`analyze_micronutrients` → `disclaimer`) lleva la cobertura: se recompone con el número. */
export const AVISO_INFORME = i18nKey("Estimado desde el catálogo nutricional (cobertura {porcentaje}); NO incluye la sal añadida 'al gusto'. Orientativo, no sustituye evaluación de un nutricionista.");

const _esBase = (locale) => !locale || locale === 'es-DO';

const _lista = (items, locale) => {
    try {
        return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
    } catch {
        return items.join(', ');
    }
};

/** Port de `micros_seguros._partes`: «a, b (c, d), e» → [a, b (c, d), e], sin romper los paréntesis. */
export function partesDeLista(texto) {
    const out = [];
    let buf = '';
    let prof = 0;
    for (const ch of String(texto || '')) {
        if (ch === '(') prof += 1;
        else if (ch === ')') prof = Math.max(0, prof - 1);
        if (ch === ',' && prof === 0) {
            if (buf.trim()) out.push(buf.trim());
            buf = '';
            continue;
        }
        buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
}

/** Las opciones de `opciones` que forman `medio` («a, b y c», como lo une `micros_seguros._unir`), o null. */
function _opcionesEn(medio, opciones) {
    const orden = [...opciones].sort((a, b) => b.length - a.length);
    const out = [];
    let i = 0;
    while (i < medio.length) {
        const o = orden.find((x) => medio.startsWith(x, i));
        if (!o) return null;
        out.push(o);
        i += o.length;
        if (medio.startsWith(', ', i)) i += 2;
        else if (medio.startsWith(' y ', i)) i += 3;
        else if (i < medio.length) return null;
    }
    return out.length ? out : null;
}

const _NOTAS_EXACTAS = new Set([...Object.values(NOTAS_MICRO), ...Object.values(NOTAS_ESPECIALES)]);
const _TEXTOS_SUPLEMENTO = new Set(TEXTOS_SUPLEMENTO);
const _ALIMENTOS_SUPLEMENTO = new Set(ALIMENTOS_SUPLEMENTO);

/** El nombre del micronutriente en el idioma activo: por su clave; si no la trae, el texto tal cual. */
export function etiquetaMicro(entry, t, locale = getLocale()) {
    const nombre = typeof entry?.nutriente === 'string' ? entry.nutriente : '';
    if (_esBase(locale) || typeof t !== 'function') return nombre;
    const clave = ETIQUETAS_MICRO[entry?.key];
    if (clave) return t(clave);
    return Object.values(ETIQUETAS_MICRO).includes(nombre) ? t(nombre) : nombre;
}

/** La nota de un nutriente (panel, centro de avisos), en el idioma activo. */
export function notaMicro(nota, key, t, locale = getLocale()) {
    const texto = typeof nota === 'string' ? nota.trim() : '';
    if (!texto || _esBase(locale) || typeof t !== 'function') return nota;
    let base = texto;
    let sufijo = '';
    if (base.endsWith(SUFIJO_PISO_ESTIMADO)) {
        base = base.slice(0, -SUFIJO_PISO_ESTIMADO.length).trim();
        sufijo = ` ${t(SUFIJO_PISO_ESTIMADO)}`;
    }
    if (_NOTAS_EXACTAS.has(base)) return t(base) + sufijo;
    // La nota recompuesta porque las alergias quitaron opciones («Refuerza con vegetales de hoja verde y sésamo.»).
    const c = NOTAS_COMPUESTAS[key];
    if (c && base.startsWith(c.prefijo) && base.endsWith(c.sufijo) && base.length > c.prefijo.length + c.sufijo.length) {
        const halladas = _opcionesEn(base.slice(c.prefijo.length, base.length - c.sufijo.length), c.opciones);
        if (halladas) return t(c.plantilla, { alimentos: _lista(halladas.map((o) => t(o)), locale) }) + sufijo;
    }
    return nota;
}

/** Nombre, dosis o precaución de un consejo de suplemento. */
export function textoSuplemento(texto, t, locale = getLocale()) {
    if (typeof texto !== 'string' || _esBase(locale) || typeof t !== 'function') return texto;
    const s = texto.trim();
    return _TEXTOS_SUPLEMENTO.has(s) ? t(s) : texto;
}

/** «primero_alimentos» de un consejo de suplemento: cada alimento por separado (el filtro de alergias pudo quitar). */
export function alimentosSuplemento(texto, t, locale = getLocale()) {
    if (typeof texto !== 'string' || _esBase(locale) || typeof t !== 'function') return texto;
    const partes = partesDeLista(texto);
    if (!partes.length || !partes.every((p) => _ALIMENTOS_SUPLEMENTO.has(p))) return texto;
    return partes.map((p) => t(p)).join(', ');
}

/** Los avisos del panel: el de los suplementos (fijo) y el del informe (con su cobertura). */
export function avisoMicro(texto, t, locale = getLocale()) {
    if (typeof texto !== 'string' || _esBase(locale) || typeof t !== 'function') return texto;
    const s = texto.trim();
    if (s === AVISO_SUPLEMENTOS) return t(AVISO_SUPLEMENTOS);
    const m = /^Estimado desde el catálogo nutricional \(cobertura (\d+)%\)/.exec(s);
    if (m) return t(AVISO_INFORME, { porcentaje: formatPercent(Number(m[1])) });
    return texto;
}
