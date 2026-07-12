import { useAssessment } from '../context/AssessmentContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { ChefHat } from 'lucide-react';
import { toast } from 'sonner';
import { useRef, useState, useEffect } from 'react';
// [P2-LAZY-PDF · 2026-05-13] html2pdf.js (976 KB) importado dinámico
// dentro del handler `handleDownloadPDF` — ver `await import('html2pdf.js')`
// más abajo. Mismo patrón que Dashboard.jsx para evitar eager load del
// chunk a usuarios que solo navegan recetas sin descargar PDF.
//
// [P-RECIPES-COOK-REMOVED · 2026-07-12] El flujo "Cocinar" completo se retiró
// del producto: botón en las vistas, CookingModeOverlay (modo cocina paso a
// paso), expansión LLM vía `/api/plans/recipe/expand` y registro de consumo.
// La única acción de la página es descargar el PDF de la receta. Con ello se
// fueron: fetchWithAuth, framer-motion, invalidateCachesForPlan,
// safeLocalStorageSet y useModalAccessibility (solo los usaba ese flujo).
// Se preserva el guard [P1-HIST-CLOSE-1 · 2026-05-10]: Recipes.jsx NO usa
// `restorePlan` ni ningún write client-side de plan_data — el server-side
// persist siempre fue el SSOT y ahora no queda ningún write path aquí.
//
// [P-RECIPES-CHUNK-WINDOW] Helpers chunk-aware extraídos a utils para
// reutilizar desde otras páginas (Plan.jsx, Dashboard.jsx) y testear
// independientemente. Sincronizados con `split_with_absorb` del backend.
import { parseStartLocal, findChunkContaining } from '../utils/chunkWindow';
// [P2-AUDIT-2 · 2026-05-15] Helper SSOT para escapar texto del LLM antes de
// interpolarlo en `generateRecipeHTML`. html2pdf renderiza el htmlString en
// un iframe detached vía html2canvas — sin escape, prompt injection
// adversarial via meal.name/desc/recipe podría inyectar `<script>` que
// ejecuta en ese contexto y exfiltra tokens de localStorage. Defense-in-depth
// análoga al test blanket que cubre Dashboard.jsx (P1-PDF-XSS-AUDITED).
// Anchor: P2-AUDIT-2.
import { escapeHtml } from '../utils/escapeHtml';
// [P3-AUDIT-1 · 2026-05-15] Telemetría success/failure del PDF de recetas
// individual, análoga a la que P3-SHOPPING-4 instrumentó en Dashboard.jsx
// para el PDF de lista de compras. Antes este handler no emitía ningún
// event — operador no podía distinguir "feature no usado" de "feature
// roto" (ambos producen 0 success events). Anchor: P3-AUDIT-1.
import { trackEvent } from '../utils/analytics';
import EmptyState from '../components/common/EmptyState';
// [P3-RECIPES-REDESIGN · 2026-06-24] Vista rediseñada (riel de comidas + detalle
// con dona de macros, checklist y timeline). Recipes.jsx conserva la lógica
// (PDF, ventana de días) y le pasa datos.
import { RecipesView } from '../components/recipes/RecipesView';
import { MobileRecipes } from '../components/recipes/MobileRecipes';
// [P2-14 · 2026-07-09] Hook SSOT de viewport (antes useState + resize listener ×2).
import { useIsMobile } from '../hooks/useMediaQuery';
// [P3-AJI-MORRON-DISPLAY · 2026-06-22] Terminología RD: pimiento dulce → "ají morrón"
// en el texto del ingrediente mostrado (conservador; no toca cubanela/pimienta/paprika).
import { displayAjiMorron } from '../utils/ingredientDisplay';

// [P2-RECIPE-DISCLAIMER-LIST · 2026-05-30] Coerción defensiva de `recipe` a
// array de pasos. El contrato es `List[str]` (MealModel.recipe) y todo el
// render hace `recipe.map(...)`, pero paths backend legacy podían persistir
// un `recipe` string (macro-balancing disclaimer pre-fix; planes viejos).
// Un string llegaba como `.length>0` truthy y reventaba `.map` (no existe en
// String) → crash capturado por GlobalErrorBoundary. Coercemos: array→tal cual,
// string no-blank→[string], cualquier otra cosa→[]. Defensa-en-profundidad del
// fix backend P2-RECIPE-DISCLAIMER-LIST.
const toRecipeSteps = (r) =>
    Array.isArray(r) ? r : (typeof r === 'string' && r.trim() ? [r] : []);

// [P1-PDF-ONE-PAGE · 2026-07-12] El PDF de receta cabe SIEMPRE en una sola
// página carta. Cómo: html2pdf renderiza el htmlString en un contenedor de
// ancho `pageSize.inner.width` en mm CSS (worker.js:111 `containerCSS.width`)
// y pagina con `nPages = ceil(canvasH / floor(canvasW × inner.ratio))`
// (worker.js:184-186). Replicamos ese entorno en un probe offscreen con el
// MISMO ancho en mm y buscamos (búsqueda binaria) el font-size raíz más
// grande cuyo scrollHeight quepa en la altura útil de UNA página. Como todo
// `generateRecipeHTML` está en `em`, un solo font-size escala el documento
// completo con reflow real (el texto se recompone, no se aplasta como
// imagen). Pre-fix: 26pt de título + 13pt de pasos desbordaban a 2-3 páginas
// con cortes de html2canvas a mitad de línea — el "se ve raro".
const PDF_PAGE_MM = { width: 215.9, height: 279.4, margin: 10 }; // carta + margen de opt.margin
const PDF_FONT_MAX_PX = 15;  // receta corta → tipografía cómoda de imprimir
const PDF_FONT_MIN_PX = 8.5; // piso legible; por debajo aceptamos 2da página (nunca visto en recetas reales)

const fitRecipeBaseFontPx = (htmlString) => {
    const innerWmm = PDF_PAGE_MM.width - 2 * PDF_PAGE_MM.margin;
    const innerHmm = PDF_PAGE_MM.height - 2 * PDF_PAGE_MM.margin;
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute; left:-10000px; top:0; width:${innerWmm}mm; background:#ffffff;`;
    // innerHTML seguro aquí: `htmlString` viene de generateRecipeHTML, donde
    // TODO texto del LLM ya pasó por escapeHtml (contrato P2-AUDIT-2). Es el
    // mismo string que html2pdf inyecta a su propio contenedor en el DOM.
    probe.innerHTML = htmlString;
    document.body.appendChild(probe);
    try {
        const root = probe.firstElementChild;
        if (!root) return PDF_FONT_MAX_PX;
        // 0.985: colchón para el floor() de html2pdf en pxPageHeight y el
        // redondeo del canvas de html2canvas — evita la "2da página sliver".
        const availHpx = probe.getBoundingClientRect().width * (innerHmm / innerWmm) * 0.985;
        const fits = (px) => { root.style.fontSize = `${px}px`; return probe.scrollHeight <= availHpx; };
        if (fits(PDF_FONT_MAX_PX)) return PDF_FONT_MAX_PX;
        let lo = PDF_FONT_MIN_PX;
        let hi = PDF_FONT_MAX_PX;
        let best = PDF_FONT_MIN_PX;
        for (let i = 0; i < 8; i++) {
            const mid = (lo + hi) / 2;
            if (fits(mid)) { best = mid; lo = mid; } else { hi = mid; }
        }
        // Floor a cuartos de px: conservador (nunca por encima de `best`).
        return Math.max(PDF_FONT_MIN_PX, Math.floor(best * 4) / 4);
    } finally {
        probe.remove();
    }
};

// [P2-DESIGN-CONSISTENCY · 2026-07-07] AmbientBackground eliminado (blobs difuminados
// que velaban el recuadro de Recetas con un halo/sombra) — recuadro limpio.

const Recipes = () => {
    // [P1-HIST-CLOSE-1 · 2026-05-10] `restorePlan` NO se importa aquí — el
    // persist server-side siempre fue el SSOT y el write client-side
    // duplicado producía drift (mismo bug que P0-HIST-2 cerró en Historial).
    // [P-RECIPES-COOK-REMOVED · 2026-07-12] Con el retiro del flujo "Cocinar"
    // (expansión LLM vía /api/plans/recipe/expand + modo cocina + registro),
    // esta página ya no tiene NINGÚN write path de plan_data: es read-only
    // sobre el plan + generación local del PDF.
    const { planData } = useAssessment();
    const navigate = useNavigate();
    const contentRef = useRef(null);
    const [activeDayIndex, setActiveDayIndex] = useState(0);
    // [P2-14 · 2026-07-09] Hook SSOT (antes useState + resize listener local).
    const isMobile = useIsMobile();
    const [checkedIngredients, setCheckedIngredients] = useState({});
    const [activeMealIndex, setActiveMealIndex] = useState(0);

    // Scroll to top on mount (cuando se navega desde BottomTabBar o sidebar)
    useEffect(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, []);

    // [P-RECIPES-CHUNK-WINDOW] Ventana del chunk que contiene "hoy".
    // ─────────────────────────────────────────────────────────────────────
    // Estos valores DEBEN computarse antes del `useEffect` que los consume
    // (el clamp de abajo) para evitar TDZ. También antes del early-return
    // `if (!planData)` porque las Reglas de Hooks prohíben llamar useEffect
    // condicionalmente — todos los hooks quedan arriba del Navigate.
    // Acceso null-safe via `planData?.…`: si planData es null la primera
    // pasada, los defaults (totalDays=0, chunkStart=0) hacen que el
    // useEffect no escriba state y el componente termine en el Navigate.
    const _planDaysAll = planData?.days || [];
    const _totalDays = _planDaysAll.length;
    const _todayMid = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
    const _startMid = parseStartLocal(planData?.grocery_start_date || planData?.created_at);
    const _daysSinceCreation = Math.max(0, Math.round((_todayMid - _startMid) / 86400000));
    const todayPlanDayIndex = _totalDays > 0
        ? Math.max(0, Math.min(_daysSinceCreation, _totalDays - 1))
        : 0;
    const { start: chunkStart, size: chunkSize } = _totalDays > 0
        ? findChunkContaining(_totalDays, todayPlanDayIndex)
        : { start: 0, size: 0 };
    const chunkDays = _planDaysAll.slice(chunkStart, chunkStart + chunkSize);

    // [P-RECIPES-CHUNK-WINDOW] Clampa `activeDayIndex` (que es GLOBAL en
    // planData.days) al window del chunk activo. Si el usuario llegó a esta
    // página con un index pre-existente fuera del chunk (deeplink, refresh,
    // navegación cruzada), default a `todayPlanDayIndex`.
    useEffect(() => {
        if (!planData?.days || planData.days.length === 0) return;
        const windowEnd = chunkStart + chunkSize;
        if (activeDayIndex < chunkStart || activeDayIndex >= windowEnd) {
            setActiveDayIndex(todayPlanDayIndex);
            // [P3-RECIPE-CHECKED-RESET · 2026-05-30] Reset selección de meal +
            // ingredientes tachados al re-clampear de día (medianoche / re-index
            // del chunk / deeplink). Sin esto, los índices posicionales de
            // `checkedIngredients` quedaban tachando ingredientes de OTRO día.
            setActiveMealIndex(0);
            setCheckedIngredients({});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planData?.days, chunkStart, chunkSize, todayPlanDayIndex]);

    const toggleIngredient = (idx) => {
        setCheckedIngredients(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    // Protección de Ruta. La computación del chunk se movió arriba del
    // useEffect de clamp (P-RECIPES-CHUNK-WINDOW); la guard sigue funcionando
    // igual porque chunkStart/Size/Days tienen defaults seguros para planData=null.
    if (!planData) {
        // [RECIPES-NO-PLAN-TO-ASSESSMENT · 2026-06-18] Antes mandaba a '/' (landing):
        // un usuario autenticado-SIN-plan que refrescaba /dashboard/recipes se sentía
        // "expulsado al landing". Ahora va a /assessment (onboarding), consistente con
        // Dashboard.jsx y ProtectedRoute (autenticado-sin-plan → /assessment).
        return <Navigate to="/assessment" replace />;
    }

    const generateRecipeHTML = (meal, basePx = PDF_FONT_MAX_PX) => {
        // [P2-AUDIT-2 · 2026-05-15] `escapeHtml` aplicado a TODAS las
        // interpolaciones de texto proveniente del LLM (meal.name, meal.desc,
        // meal.meal, meal.cals, prep_time, difficulty, recipe steps,
        // ingredients). `parseBoldEscaped` post-escape convierte el patrón
        // **bold** del LLM en `<strong>` — hacer el bold DESPUÉS del escape
        // garantiza que `<strong>` legítimo queda intacto pero cualquier
        // `<script>` adversarial ya fue escapado a `&lt;script&gt;`. `color`
        // (sectionTitle determinístico de mapping local) NO escapado
        // intencionalmente; los demás `${...}` pasan por `escapeHtml`.
        //
        // [P1-PDF-ONE-PAGE · 2026-07-12] TODAS las medidas tipográficas van
        // en `em` relativas al `font-size:${basePx}px` del wrapper raíz: así
        // `_fitRecipeBaseFontPx` puede escalar el documento completo con un
        // solo knob hasta que quepa en UNA página carta (sin cortes feos de
        // html2pdf a mitad de paso, que era el "se ve raro" original).
        //
        // [P1-PDF-CSS-ISOLATION · 2026-07-12] SOLO <div>/<span> con estilos
        // 100% inline — NADA de h1/h3/p/ul/li/strong desnudos. html2pdf
        // inserta este HTML en el DOM VIVO de la página (worker.js:125
        // `document.body.appendChild(overlay)`), así que el CSS global del
        // app aplica: `index.css` estila h1..h6 con `color: var(--text-main)`
        // (≈ blanco en dark theme) → título fantasma sobre el fondo blanco
        // del PDF (bug observado en prod 2026-07-12). Una regla dirigida a
        // etiqueta SIEMPRE gana sobre el color heredado del wrapper; los
        // divs/spans genéricos no tienen reglas globales dirigidas.
        const _recipeSteps = toRecipeSteps(meal.recipe);
        const parseBoldEscaped = (raw) => escapeHtml(raw).replace(
            /\*\*(.*?)\*\*/g,
            '<span style="font-weight: 800; color: #0F172A;">$1</span>',
        );

        const stepsHTML = _recipeSteps.length ? _recipeSteps.map((step, i) => {
            let sectionTitle = "";
            let color = "#4F46E5";
            let content = step;
            const lowerT = (typeof step === 'string' ? step : '').toLowerCase();
            if (lowerT.startsWith("mise en place:")) { sectionTitle = "Mise en place"; color = "#00B4D8"; }
            if (lowerT.startsWith("el toque de fuego:") || lowerT.startsWith("toque de fuego:")) { sectionTitle = "El Toque de Fuego"; color = "#F97316"; }
            if (lowerT.startsWith("montaje:")) { sectionTitle = "Montaje"; color = "#8B5CF6"; }

            if (sectionTitle) {
                const prefixRegex = sectionTitle.toLowerCase() === "toque de fuego" || sectionTitle.toLowerCase() === "el toque de fuego"
                    ? /(el )?toque de fuego:\s*/i : new RegExp(`${sectionTitle}:\\s*`, 'i');
                content = content.replace(prefixRegex, '');
            }

            return `
                <div style="display: flex; gap: 0.6em; margin-bottom: 0.7em;">
                    <div style="flex: none; width: 1.5em; height: 1.5em; border-radius: 50%; background: ${color}; color: #ffffff; font-size: 0.72em; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: 0.1em;">${i + 1}</div>
                    <div style="flex: 1; min-width: 0;">
                        ${sectionTitle ? `<div style="color: ${color}; font-size: 0.62em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.2em;">${escapeHtml(sectionTitle)}</div>` : ''}
                        <div style="font-size: 0.74em; line-height: 1.5; color: #334155;">${parseBoldEscaped(String(content).replace(/^\d+[.)]\s*/, ''))}</div>
                    </div>
                </div>
            `;
        }).join('') : '';

        // [P2-PDF-FINISH-ROW · 2026-07-12] Cierre "¡Listo para disfrutar!" —
        // mismo remate que el timeline de la vista (nodo verde + texto), para
        // que el lector sepa que la preparación termina ahí. Solo si hay pasos.
        const finishHTML = _recipeSteps.length ? `
            <div style="display: flex; gap: 0.6em; align-items: center; margin-top: 0.15em;">
                <div style="flex: none; width: 1.5em; height: 1.5em; border-radius: 50%; background: #10B981; color: #ffffff; font-size: 0.72em; font-weight: 800; display: flex; align-items: center; justify-content: center;">&#10003;</div>
                <div style="font-size: 0.78em; font-weight: 800; color: #10B981;">¡Listo para disfrutar!</div>
            </div>
        ` : '';

        const ingredientsHTML = meal.ingredients ? meal.ingredients.map(ing => `
            <div style="display: flex; align-items: flex-start; gap: 0.45em; margin-bottom: 0.5em; font-size: 0.72em; line-height: 1.4; color: #334155;">
                <span style="flex: none; width: 0.5em; height: 0.5em; border-radius: 50%; background: #10B981; margin-top: 0.42em;"></span>
                <span>${escapeHtml(displayAjiMorron(ing))}</span>
            </div>
        `).join('') : '';

        // Chips de metadata (tiempo/dificultad opcionales — mismos datos que
        // los chips de la vista).
        const _chip = (label) => `<span style="display: inline-block; background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 2em; padding: 0.28em 0.85em; font-size: 0.68em; font-weight: 700; color: #334155; white-space: nowrap;">${label}</span>`;
        const metaChips = [
            _chip(`🔥 ${escapeHtml(meal.cals)} kcal`),
            meal.prep_time ? _chip(`⏱ ${escapeHtml(meal.prep_time)}`) : '',
            meal.difficulty ? _chip(escapeHtml(meal.difficulty)) : '',
        ].filter(Boolean).join('');

        // [P2-PDF-RECIPE-MACROS · 2026-06-22] P/C/G con guards de presencia
        // (pre-fix solo se imprimía kcal — 3 de 4 macros perdidos).
        const _macro = (dotColor, label, value) => `
            <div style="display: flex; align-items: center; gap: 0.4em;">
                <span style="width: 0.6em; height: 0.6em; border-radius: 0.2em; background: ${dotColor};"></span>
                <span style="font-size: 0.68em; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.04em;">${label}</span>
                <span style="font-size: 0.8em; font-weight: 800; color: #0F172A;">${value}g</span>
            </div>`;
        const macrosHTML = [
            (meal.protein != null && meal.protein !== '') ? _macro('#10B981', 'Proteínas', escapeHtml(meal.protein)) : '',
            (meal.carbs != null && meal.carbs !== '') ? _macro('#8B5CF6', 'Carbos', escapeHtml(meal.carbs)) : '',
            (meal.fats != null && meal.fats !== '') ? _macro('#F43F5E', 'Grasas', escapeHtml(meal.fats)) : '',
        ].filter(Boolean).join('');

        return `
            <div style="width: 100%; box-sizing: border-box; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: ${basePx}px; line-height: 1.45; color: #0F172A; background: #ffffff;">
                <!-- HEADER -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 0.18em solid #4F46E5; padding-bottom: 0.55em; margin-bottom: 0.9em;">
                    <div style="font-size: 1.15em; font-weight: 900; letter-spacing: -0.02em; color: #0F172A;">
                        Mealfit<span style="color: #4F46E5;">R</span><span style="color: #F43F5E;">D</span>
                        <span style="font-size: 0.6em; font-weight: 600; color: #64748B;">&nbsp;·&nbsp;Receta&nbsp;·&nbsp;${escapeHtml(meal.meal)}</span>
                    </div>
                    <div style="display: flex; gap: 0.4em; align-items: center;">${metaChips}</div>
                </div>

                <!-- TITLE + DESC (divs, no h1/p — ver P1-PDF-CSS-ISOLATION) -->
                <div style="font-size: 1.55em; font-weight: 900; margin: 0 0 0.25em; line-height: 1.15; letter-spacing: -0.01em; color: #0F172A;">${escapeHtml(meal.name)}</div>
                ${meal.desc ? `<div style="font-size: 0.76em; font-style: italic; color: #64748B; margin: 0 0 1em; line-height: 1.5;">${escapeHtml(meal.desc)}</div>` : '<div style="height: 0.8em;"></div>'}

                <!-- MACROS -->
                ${macrosHTML ? `<div style="display: flex; gap: 1.4em; align-items: center; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 0.6em; padding: 0.55em 0.9em; margin-bottom: 1.1em;">${macrosHTML}</div>` : ''}

                <!-- COLUMNS -->
                <div style="display: flex; gap: 1.1em; align-items: flex-start;">
                    <div style="flex: 0 0 33%; box-sizing: border-box; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 0.6em; padding: 0.9em;">
                        <div style="font-size: 0.8em; font-weight: 800; margin: 0 0 0.7em; padding-bottom: 0.4em; border-bottom: 2px solid #E2E8F0; text-transform: uppercase; letter-spacing: 0.06em; color: #0F172A;">Ingredientes</div>
                        <div style="font-size: 0.62em; color: #94A3B8; line-height: 1.4; margin-bottom: 0.8em;">Porciones para 1 persona — si cocinas para tu hogar, multiplica cada cantidad.</div>
                        <div>${ingredientsHTML}</div>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.8em; font-weight: 800; margin: 0 0 0.7em; padding-bottom: 0.4em; border-bottom: 2px solid #E2E8F0; text-transform: uppercase; letter-spacing: 0.06em; color: #0F172A;">Preparación</div>
                        ${stepsHTML ? `${stepsHTML}${finishHTML}` : `<div style="font-size: 0.74em; color: #64748B;">Guíate de la descripción general del plato.</div>`}
                    </div>
                </div>

                <!-- FOOTER -->
                <div style="margin-top: 1.2em; padding-top: 0.6em; border-top: 1px solid #E2E8F0; text-align: center; color: #94A3B8; font-size: 0.62em;">
                    Disfruta de tu comida. Generado automáticamente por MealfitRD.
                </div>
            </div>
        `;
    };

    const handleDownloadPDF = async (meal) => {
        const toastId = toast.loading('Generando PDF de alta calidad...');
        try {
            // [P1-PDF-ONE-PAGE · 2026-07-12] Espera a que las fuentes de la
            // página estén listas antes de medir (una fuente que carga tarde
            // cambia el reflow y falsea el fit). Best-effort: a esta altura
            // de la sesión ya suelen estar cargadas.
            try {
                if (document.fonts?.ready) await document.fonts.ready;
            } catch { /* no-op: medición best-effort */ }
            // Fit a UNA página: medimos con la tipografía máxima; si no cabe,
            // la búsqueda binaria del helper encuentra el font-size raíz más
            // grande que sí cabe y regeneramos el HTML con él.
            const _htmlAtMax = generateRecipeHTML(meal, PDF_FONT_MAX_PX);
            let _fitPx = PDF_FONT_MAX_PX;
            try {
                _fitPx = fitRecipeBaseFontPx(_htmlAtMax);
            } catch { _fitPx = PDF_FONT_MAX_PX; /* sin fit: html2pdf pagina como fallback */ }
            const htmlString = _fitPx === PDF_FONT_MAX_PX
                ? _htmlAtMax
                : generateRecipeHTML(meal, _fitPx);
            // [P3-AUDIT-1 · 2026-05-15] Filename con discriminador único:
            // `Receta_<meal-name-slug>_<plan_id[:8]>_<YYYY-MM-DD>.pdf`.
            // Pre-fix `Receta-${meal.name}.pdf` colisionaba para 2 recetas
            // del mismo nombre en planes distintos (común: "Pollo guisado"
            // aparece en múltiples planes). Cada PDF descargado sobrescribía
            // al anterior en la carpeta Downloads del usuario. Mismo patrón
            // que P3-SHOPPING-1 (Dashboard PDF) — plan_id[:8] preserva
            // legibilidad sin exponer el UUID completo; fecha discrimina
            // re-descargas del mismo plan en días distintos.
            const _planIdPrefix = (planData?.id || '').toString().slice(0, 8) || 'noid';
            const _today = new Date().toISOString().slice(0, 10);
            const _mealSlug = String(meal?.name || 'receta').replace(/\s+/g, '-');
            const opt = {
                // [P1-PDF-ONE-PAGE] margin DEBE coincidir con PDF_PAGE_MM.margin
                // — el fit del probe se calcula contra esa área útil.
                margin: [PDF_PAGE_MM.margin, PDF_PAGE_MM.margin, PDF_PAGE_MM.margin, PDF_PAGE_MM.margin],
                filename: `Receta_${_mealSlug}_${_planIdPrefix}_${_today}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2.5, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' }
            };
            // [P2-LAZY-PDF · 2026-05-13] Dynamic import: ver nota en el
            // import section. Chunk html2pdf-*.js solo se fetch al click.
            //
            // [P3-RECIPES-CHUNK-LOAD-FAIL · 2026-05-15] Wrap dedicado para
            // `ChunkLoadError` (el CDN dropea el chunk en red intermitente,
            // o rotación de build invalida el hash mientras la pestaña vive).
            // Sin esto el outer try/catch muestra "Error al descargar PDF" —
            // mensaje genérico que confunde al usuario. Mensaje específico
            // sugiere refresh + retry, lo que arregla el caso.
            let html2pdf;
            try {
                html2pdf = (await import('html2pdf.js')).default;
            } catch (importErr) {
                toast.dismiss(toastId);
                const _msg = String(importErr?.message || '');
                if (
                    importErr?.name === 'ChunkLoadError' ||
                    /loading chunk|failed to fetch dynamically imported/i.test(_msg)
                ) {
                    toast.error('Error de red al cargar el PDF. Refresca la página e intenta de nuevo.');
                } else {
                    toast.error('No se pudo cargar el generador de PDF. Refresca la página e intenta de nuevo.');
                }
                return;
            }
            // [P1-AUDIT-2 · 2026-05-15] Timeout sobre html2pdf().save().
            // Patrón canónico replicado de Dashboard.jsx P2-PDF-OBS-2: el audit
            // 2026-05-14 cerró el hang en Dashboard pero olvidó este segundo
            // callsite. Bug observado (raro pero reproducible): html2canvas
            // cuelga indefinido en iOS Safari con recetas hyper-densas
            // (recipe con ≥20 pasos + ingredients largos) o si la pestaña
            // pierde foco durante un render largo. La promise nunca resuelve →
            // `toast.dismiss(toastId)` nunca corre → usuario no puede retry
            // sin refresh.
            //
            // Fix: Promise.race contra un timeout (default 60s, knob
            // `VITE_PDF_RENDER_TIMEOUT_MS` con clamp [15s, 180s]). Si dispara,
            // lanza `PdfRenderTimeout` que el catch existente captura. Mismo
            // knob que Dashboard — SRE puede subirlo sin redeploy si recetas
            // legítimas exceden 60s.
            const _rawTimeoutKnob = parseInt(import.meta.env.VITE_PDF_RENDER_TIMEOUT_MS, 10);
            let _pdfRenderTimeoutMs = Number.isFinite(_rawTimeoutKnob) ? _rawTimeoutKnob : 60000;
            if (_pdfRenderTimeoutMs < 15000) _pdfRenderTimeoutMs = 15000;
            if (_pdfRenderTimeoutMs > 180000) _pdfRenderTimeoutMs = 180000;
            let _pdfTimeoutHandle = null;
            const _pdfTimeoutPromise = new Promise((_resolve, reject) => {
                _pdfTimeoutHandle = setTimeout(() => {
                    const _timeoutErr = new Error(`html2pdf no completó en ${_pdfRenderTimeoutMs}ms`);
                    _timeoutErr.name = 'PdfRenderTimeout';
                    reject(_timeoutErr);
                }, _pdfRenderTimeoutMs);
            });
            try {
                await Promise.race([
                    html2pdf().set(opt).from(htmlString, 'string').save(),
                    _pdfTimeoutPromise,
                ]);
            } finally {
                if (_pdfTimeoutHandle) clearTimeout(_pdfTimeoutHandle);
            }
            toast.dismiss(toastId);
            toast.success('Receta descargada correctamente');
            // [P3-AUDIT-1 · 2026-05-15] Telemetría success. Análoga a
            // `pdf_download_success` en Dashboard (P3-SHOPPING-4) pero para
            // recetas individuales — permite calcular adoption rate del
            // feature recipe-PDF vs el shopping-list PDF. `recipe_steps` y
            // `ingredients_count` ayudan a discriminar bursts de recetas
            // hyper-densas que se acercan al timeout límite.
            try {
                trackEvent('recipe_pdf_download_success', {
                    plan_id: planData?.id,
                    meal_name: String(meal?.name || '').slice(0, 64),
                    meal_type: meal?.meal,
                    recipe_steps: Array.isArray(meal?.recipe) ? meal.recipe.length : 0,
                    ingredients_count: Array.isArray(meal?.ingredients) ? meal.ingredients.length : 0,
                    is_expanded: !!meal?.isExpanded,
                    // [P1-PDF-ONE-PAGE] Distribución del fit: si la mayoría
                    // de descargas cae cerca de PDF_FONT_MIN_PX, las recetas
                    // reales están más densas de lo previsto — revisar layout.
                    fit_font_px: _fitPx,
                });
            } catch (_telSuccessErr) {
                // No-op: telemetría best-effort.
            }
        } catch (error) {
            console.error(error);
            toast.dismiss(toastId);
            toast.error('Error al generar PDF');
            // [P3-AUDIT-1 · 2026-05-15] Telemetría failure. `error_name` y
            // `error_message` truncados a 64/200 chars para evitar payloads
            // gigantes en GA/PostHog (algunos backends cortan a 256). `name`
            // distingue timeouts (`PdfRenderTimeout` de P1-AUDIT-2) de
            // errores reales del render.
            try {
                const _errName = (error && error.name) ? String(error.name).slice(0, 64) : 'UnknownError';
                const _errMsg = (error && error.message) ? String(error.message).slice(0, 200) : '';
                trackEvent('recipe_pdf_download_failed', {
                    plan_id: planData?.id,
                    meal_name: String(meal?.name || '').slice(0, 64),
                    meal_type: meal?.meal,
                    error_name: _errName,
                    error_message: _errMsg,
                });
            } catch (_telFailErr) {
                // No-op: telemetría best-effort.
            }
        }
    };

    return (
        <div style={{ maxWidth: '1080px', margin: '0 auto', paddingBottom: isMobile ? 0 : '4rem', overflowX: 'hidden', width: '100%', boxSizing: 'border-box' }}>

                <div ref={contentRef} style={{ position: 'relative', zIndex: 1, paddingBottom: isMobile ? '0' : '2rem', overflow: 'hidden', maxWidth: '100%' }}>
                    {/* [P2-DESIGN-CONSISTENCY · 2026-07-07] AmbientBackground eliminado:
                        los blobs difuminados creaban un halo/sombra alrededor y DEBAJO
                        del recuadro de Recetas. Recuadro limpio sobre el fondo plano. */}
                    {(() => {
                        const planDays = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
                        // [P-RECIPES-CHUNK-WINDOW] Clamp al window del chunk.
                        const _windowEnd = chunkStart + chunkSize;
                        const _clampedIdx = Math.max(chunkStart, Math.min(activeDayIndex, _windowEnd - 1));
                        const currentDayIndex = Math.min(_clampedIdx, planDays.length - 1);
                        const dayObj = planDays[currentDayIndex];
                        const validMeals = (dayObj && dayObj.meals) || [];

                        if (!dayObj || validMeals.length === 0) {
                            return (
                                <EmptyState
                                    icon={ChefHat}
                                    title="Aún no hay recetas para este día"
                                    description="Cuando tu plan esté completo, encontrarás aquí las recetas paso a paso."
                                    cta={{ label: 'Volver al plan', onClick: () => navigate('/dashboard') }}
                                />
                            );
                        }

                        const currentMealIndex = Math.min(activeMealIndex, validMeals.length - 1);
                        const activeMeal = validMeals[currentMealIndex];
                        // [P2-RECIPE-DISCLAIMER-LIST] pasos coercidos a array (defensa).
                        const activeRecipeSteps = toRecipeSteps(activeMeal.recipe);
                        // [P3-RECIPES-DAY-GOAL · 2026-06-24] El header muestra la META
                        // calórica del día (objetivo del plan = mismo `planData.calories`
                        // que usa TrackingProgress), NO la suma de los platos — que puede
                        // quedar ~50 kcal corta por redondeo de porciones. Fallback a la
                        // suma si el plan no trae target.
                        const _mealsKcal = validMeals.reduce((s, m) => s + (m.cals || 0), 0);
                        const dayKcal = parseInt(planData?.calories) || _mealsKcal;

                        // Días del chunk → pestañas (nombre = grocery_start_date + globalIdx).
                        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                        const days = chunkDays.map((_d, localIdx) => {
                            const globalIdx = chunkStart + localIdx;
                            const dd = new Date(_startMid.getTime());
                            dd.setDate(dd.getDate() + globalIdx);
                            return { globalIdx, label: diasSemana[dd.getDay()] };
                        });

                        // [P3-RECIPES-MOBILE-DEDICATED] Mismos datos+handlers para
                        // ambas vistas; en móvil va la dedicada (MobileRecipes).
                        const viewProps = {
                            days,
                            activeDayGlobalIdx: activeDayIndex,
                            onSelectDay: (g) => { setActiveDayIndex(g); setActiveMealIndex(0); setCheckedIngredients({}); },
                            meals: validMeals,
                            activeMealIndex: currentMealIndex,
                            onSelectMeal: (i) => { setActiveMealIndex(i); setCheckedIngredients({}); },
                            meal: activeMeal,
                            steps: activeRecipeSteps,
                            dayKcal,
                            checkedIngredients,
                            onToggleIngredient: toggleIngredient,
                            onPDF: () => handleDownloadPDF(activeMeal),
                        };
                        return isMobile
                            ? <MobileRecipes {...viewProps} />
                            : <RecipesView {...viewProps} />;
                    })()}
                </div>
        </div>
    );
};

export default Recipes;
