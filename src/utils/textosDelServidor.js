// [P1-PLAN-LOTE-225 · 2026-09-24] Las frases FIJAS que el servidor guarda en el plan o manda por endpoint para explicar
// que un plan necesita al usuario: el aviso «Acción requerida» (`plan_data._user_action_required`, escrito por
// `cron_tasks.py`) y el detalle por bloque de `/blocked-reasons` (`routers/plans.py`, `reason_to_text`).
//
// Llegan en español y el Historial y la pantalla del plan los pintaban tal cual: el único aviso que pide al usuario
// que HAGA algo, en un idioma que quizá no lee. Se traducen AL PINTAR por coincidencia exacta con estas frases, que
// son claves del catálogo. `test_p1_plan_lote_225.py` las extrae del backend con `ast` y exige que estén TODAS
// aquí: si alguien cambia una coma allá, el test lo dice antes de que el aviso vuelva al español sin que se note.
//
// Lo que no se reconoce se pinta tal cual. En es-DO, siempre tal cual.
import { getLocale, i18nKey } from '../i18n';
import { BRAND } from '../data/routeMeta';

export const TEXTOS_FIJOS_DEL_SERVIDOR = [
    // El nombre del plan mientras el servidor lo genera (`generation_lifecycle.py`, placeholder).
    i18nKey("Plan en preparación"),
    // El nombre de una comida del diario sin alimentos con nombre (`food_search.derive_meal_name`).
    i18nKey("Comida registrada"),
    i18nKey("No pudimos generar tu plan"),
    i18nKey("Hubo un problema y tu plan no llegó a generarse. Abre {app} y vuelve a generarlo con tu nevera actual."),
    i18nKey("Generar plan"),
    i18nKey("Tu plan necesita una revisión"),
    i18nKey("Detectamos un problema al continuar tu plan. Ábrelo para regenerarlo con tu nevera actual."),
    i18nKey("Regenerar plan"),
    i18nKey("Tu plan necesita regenerarse"),
    i18nKey("Detectamos un problema técnico con tu plan que impide continuar generando los próximos días. Tócalo para regenerarlo con tu nevera actual."),
    i18nKey("Detectamos datos inválidos en la fecha de inicio de tu plan. Tócalo para regenerarlo con tu nevera actual."),
    i18nKey("Tu plan se pausó porque no pudimos reconstruir el historial de aprendizaje de los días previos. Tócalo para regenerarlo con tu nevera actual."),
    i18nKey("No pudimos confirmar tu zona horaria, así que tu plan se pausó para no generar días desfasados. Tócalo para regenerarlo con tu nevera actual."),
    i18nKey("Un día programado de tu plan quedó fuera del rango actual. Tócalo para regenerarlo con tu nevera actual."),
    i18nKey("Tu plan necesita atención"),
    i18nKey("No pudimos completar parte de tu plan automáticamente. Abre {app} y regenera tu plan para que volvamos a generarlo con tu nevera actual."),
    i18nKey("Registra tus comidas para continuar tu plan"),
    i18nKey("Necesitamos saber qué comiste para generar el siguiente bloque adaptado a ti."),
    i18nKey("Ir al diario"),
    i18nKey("Validando tu inventario"),
    i18nKey("Estamos refrescando tu nevera. El plan continuará en breve."),
    i18nKey("Actualiza tu nevera para continuar"),
    i18nKey("No pudimos validar tu inventario en vivo. Abre la app para refrescar y continuar el plan."),
    i18nKey("Abrir nevera"),
    i18nKey("Tu nevera está vacía"),
    i18nKey("Añade ingredientes a 'Mi Nevera' para que generemos el siguiente bloque del plan."),
    i18nKey("Actualizar nevera"),
    i18nKey("Tu primera compra está pendiente"),
    i18nKey("Te dimos la lista de compras y aún no marcaste nada como comprado. Márcalo en la Nevera — o espera, y seguiremos solos con la mejor información disponible."),
    i18nKey("Ir a la Nevera"),
    i18nKey("Confirmando tu zona horaria"),
    i18nKey("Aún no pudimos resolver tu zona horaria para programar el siguiente bloque. Abre la app desde tu dispositivo principal."),
    i18nKey("Abrir {app}"),
    i18nKey("Reconstruyendo el aprendizaje del plan"),
    i18nKey("El sistema está intentando recuperar el aprendizaje de los días previos. Si persiste, regenera el plan."),
    i18nKey("Tu plan necesita una fecha de inicio"),
    i18nKey("No pudimos determinar cuándo comienza el plan. Reactívalo o regéneralo desde el Dashboard."),
    i18nKey("Ir al Dashboard"),
    i18nKey("No pudimos completar parte de tu plan automáticamente. Reactívalo o regéneralo para continuar."),
    i18nKey("Detectamos un problema técnico con la fecha de inicio del plan. Tócalo para regenerarlo con tu nevera actual."),
    i18nKey("Detectamos datos inválidos en la fecha de inicio. Regenera el plan con tu nevera actual."),
    i18nKey("No pudimos reconstruir el historial de aprendizaje de los días previos. Regenera el plan."),
    i18nKey("Chunk cancelado por restore"),
    i18nKey("Este chunk fue cancelado al reactivar otro plan archivado. No requiere acción."),
    i18nKey("Chunk cancelado al archivar"),
    i18nKey("Este chunk fue cancelado cuando el plan se reactivó como archivado. No requiere acción."),
    i18nKey("Tu plan está tardando más de lo habitual"),
    i18nKey("Un bloque del plan lleva tiempo procesándose. Suele resolverse solo, pero puedes regenerar el plan si prefieres no esperar."),
    i18nKey("Reanudando un bloque del plan"),
    i18nKey("Un bloque del plan quedó marcado para reanudar tras una interrupción del worker. El cron lo retomará automáticamente."),
    i18nKey("Continuar sin registrar"),
    i18nKey("El plan continuará usando tu inventario como señal de actividad."),
    i18nKey("Bloqueo sin clasificar"),
    i18nKey("El sistema marcó este chunk como bloqueado pero no logramos identificar la causa. Si persiste, contacta soporte."),
];

const _CONOCIDOS = new Set(TEXTOS_FIJOS_DEL_SERVIDOR);

/**
 * Un texto del servidor en el idioma activo: su traducción si es una de las frases fijas; si no, tal cual.
 *
 * El servidor escribe la marca («Abre Bioboros…»); el catálogo no la hornea (P3-I18N-MARCA-HORNEADA): la clave lleva
 * `{app}` y aquí se reconoce el texto con la marca en su sitio.
 */
export function textoDelServidor(texto, t, locale = getLocale()) {
    if (typeof texto !== 'string' || !locale || locale === 'es-DO' || typeof t !== 'function') return texto;
    const clave = texto.trim().split(BRAND).join('{app}');
    return _CONOCIDOS.has(clave) ? t(clave, { app: BRAND }) : texto;
}
