// [P2-I18N-PDF-NOTA-CLINICA · 2026-08-22] La advertencia clínica del PDF, en el idioma
// del usuario.
//
// ═══════════════════════════════════════════════════════════════════════════
// QUÉ PASABA
// ═══════════════════════════════════════════════════════════════════════════
//
// El titular del recuadro SÍ pasaba por `t()` («⚕️ Consulta a tu profesional de salud»),
// y el CUERPO —que es la advertencia de verdad— entraba crudo desde el backend:
//
//     ${escapeHtml(String(_rpr.note))}
//
// O sea: la frase más crítica del documento, en español, debajo de un titular traducido.
// Un usuario renal en Francia leía en francés que consultara a su profesional, y en
// español POR QUÉ. Es el mismo patrón que `P1-I18N-SERVER-COPY-GANA` cerró en los toasts,
// donde más caro sale.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUÉ SE GLOSA Y NO SE REESTRUCTURA LA GENERACIÓN
// ═══════════════════════════════════════════════════════════════════════════
//
// La nota la COMPONE `graph_orchestrator` concatenando fragmentos fijos con dos datos
// interpolados (la lista de condiciones declaradas y el tope renal de proteína en g/día).
// Emitir `note_key` + `note_vars` sería más limpio en abstracto y significaría reescribir
// generación de texto CLÍNICO en cinco sitios — el tipo de código donde un refactor
// «equivalente» que no lo es se paga en una advertencia médica mal formada.
//
// Glosar al renderizar no toca nada persistido: `requires_professional_review.note` sigue
// intacto en `plan_data`, y con él la trazabilidad de qué se le advirtió a quién.
//
// LO QUE NO SE TRADUCE, a propósito:
//   · Los NOMBRES de las condiciones declaradas («Enfermedad Renal», «Diabetes T2»). Son
//     los chips exactos de QMedical, y el backend los compara por igualdad de string para
//     decidir el gate clínico. Aparecen entre paréntesis y siguen en español, igual que el
//     nombre canónico del alimento en la lista bilingüe: es el identificador.
//   · Las cifras (tope de proteína, g/kg). Son datos.
//
// Si un fragmento no está en el catálogo, se queda en español. Media advertencia en cada
// idioma sería peor que una entera en español — pero el gate exige el catálogo completo,
// así que ese caso sólo aparece si alguien cambia el texto del backend sin actualizar
// aquí, y `test_p2_i18n_pdf_nota_clinica.py` lo convierte en rojo.

import { i18nKey } from '../i18n';

/**
 * Los diez fragmentos FIJOS de la advertencia. La clave es el texto español, igual que
 * en el resto del motor. Se ordenan de más largo a más corto al sustituir: un fragmento
 * corto que sea subcadena de otro rompería al que lo contiene.
 */
const _FRAGMENTOS = (t) => [
    t('⚕️ Declaraste condición(es) de salud ('),
    t('). Este plan las considera de forma general pero NO sustituye la evaluación de tu médico o nutricionista. Consúltalo antes de seguir este plan, especialmente para ajustar porciones, sodio, azúcares o restricciones específicas.'),
    t('🫘 CONDICIÓN RENAL DETECTADA — IMPORTANTE: la nutrición en enfermedad renal depende de tu estadio (G1–G5) y de si estás en diálisis, y DEBE ser supervisada por tu nefrólogo o nutricionista renal.'),
    t(' Este plan NO es una prescripción renal: el potasio y el fósforo (críticos en ERC) no se ajustan aquí.'),
    t(' NO sigas este plan sin la validación de tu profesional de salud.'),
    t(' Tienes diabetes y enfermedad renal a la vez: las recomendaciones de fibra/leguminosas (diabetes) y de potasio/fósforo/proteína (renal) deben balancearse caso por caso — esto SOLO lo define tu nefrólogo/nutricionista.'),
    t(' Tienes diabetes y enfermedad renal a la vez: el balance fibra/leguminosas vs potasio/fósforo/proteína SOLO lo define tu nefrólogo/nutricionista.'),
    t('⚠️ OBJETIVO CALÓRICO MUY BAJO: tu meta calculada cayó por debajo del mínimo clínico seguro y fue elevada a un piso de seguridad. Un déficit tan agresivo puede ser riesgoso (pérdida de masa muscular, déficit de micronutrientes, fatiga). Consulta a un médico o nutricionista antes de seguir un plan tan hipocalórico.'),
    t('🧒 PERFIL DE MENOR DE EDAD: las necesidades nutricionales de niños y adolescentes difieren de las de un adulto (crecimiento, desarrollo) y este plan usa cálculos calibrados para adultos. NO se aplicó déficit calórico por seguridad. Consulta a un pediatra o nutricionista infantil antes de seguir este plan.'),
    t('🤰 EMBARAZO / LACTANCIA: tus necesidades de energía y micronutrientes (folato, hierro, calcio, B12) son mayores y el déficit calórico está contraindicado — este plan usa al menos mantenimiento. Requiere control prenatal: consulta a tu obstetra o nutricionista antes de seguirlo, y evita alimentos de riesgo de listeria (lácteos no pasteurizados, pescado/carne crudos, embutidos).'),
];

/**
 * El tope renal de proteína es la única pieza de la nota con datos DENTRO de la frase:
 *
 *     " Se aplicó un límite conservador de proteína a ~62g/día (≈0.8 g/kg) como medida de seguridad."
 *
 * Partirla en tres trozos fijos alrededor de los números pondría la cifra donde el español
 * la pone, y en francés o italiano ese no es su sitio. Va como PLANTILLA con dos
 * `{placeholders}`, declarada con `i18nKey` porque el extractor es TEXTUAL y no ve el
 * literal a través de una constante. Los placeholders son además lo único que `i18n-check`
 * sabe comparar: una traducción
 * que pierda `{proteina}` borraría la cifra de una advertencia clínica, y ahora sale roja.
 *
 * El regex captura sin ser goloso y NO valida el formato del número: si el backend pasara a
 * emitir un rango o una unidad distinta, simplemente no casa y la frase se queda en español.
 */
const _TOPE_PROTEINA_RE = / Se aplicó un límite conservador de proteína a ~([^~]*?)g\/día \(≈(.*?) g\/kg\) como medida de seguridad\./;
const _TOPE_PROTEINA_CLAVE = i18nKey(
    ' Se aplicó un límite conservador de proteína a ~{proteina}g/día (≈{gkg} g/kg) como medida de seguridad.',
);

/** Las claves españolas, para el guard. Mismo orden que arriba. */
export const CLAVES_NOTA_CLINICA = _FRAGMENTOS((s) => s);

/** Inventario COMPLETO para el guard: los fragmentos fijos + la plantilla del tope. */
export const CLAVES_NOTA_CLINICA_TODAS = [...CLAVES_NOTA_CLINICA, _TOPE_PROTEINA_CLAVE];

/**
 * `glossClinicalNote(note, t)` -> string
 *
 * DISPLAY-ONLY. No muta el plan ni se persiste. Sin `t`, con una entrada que no sea texto,
 * o con una `t` que lanza: devuelve la nota TAL CUAL — una advertencia en español es una
 * degradación; una advertencia que no sale es un fallo.
 */
export const glossClinicalNote = (note, t) => {
    if (typeof note !== 'string' || !note.trim()) return note;
    if (typeof t !== 'function') return note;

    let traducidos;
    try {
        traducidos = _FRAGMENTOS(t);
    } catch {
        return note;
    }

    // De más largo a más corto: un fragmento corto que sea subcadena de otro rompería al
    // que lo contiene si se sustituyera primero.
    const pares = CLAVES_NOTA_CLINICA
        .map((es, i) => [es, traducidos[i]])
        .filter(([es, tr]) => tr && tr !== es)
        .sort((a, b) => b[0].length - a[0].length);

    let out = note;
    for (const [es, tr] of pares) {
        if (out.includes(es)) out = out.split(es).join(tr);
    }

    // El tope de proteína, con sus dos cifras en su sitio.
    //
    // Este paso NO puede llevar el filtro `tr !== es` de los fragmentos fijos: en es-DO la
    // clave y el valor SON el mismo texto y aun así hay que pasar por `t`, porque es quien
    // rellena `{proteina}` y `{gkg}`. Lo que sí se comprueba es el resultado: si vuelve con
    // un placeholder sin rellenar --catálogo raro, `t` que ignore sus `vars`-- se devuelve la
    // frase original. Un «~62g/día» en español es una degradación; un «~{proteina}g/día» en
    // una advertencia renal es basura impresa en el documento que el usuario se lleva.
    try {
        out = out.replace(_TOPE_PROTEINA_RE, (entera, proteina, gkg) => {
            const tr = t(_TOPE_PROTEINA_CLAVE, { proteina, gkg });
            if (typeof tr !== 'string' || !tr) return entera;
            if (tr.includes('{proteina}') || tr.includes('{gkg}')) return entera;
            return tr;
        });
    } catch {
        // se queda el español
    }

    return out;
};
