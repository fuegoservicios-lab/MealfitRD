// [P3-RECIPES-REDESIGN · 2026-06-24] Vista presentacional de Recetas (diseño
// MicronutrientGaps→RecipesView del owner). Recibe datos REALES del plan +
// handlers desde Recipes.jsx (que conserva: PDF y ventana de días del chunk;
// el modo cocina/expandir con IA se retiró — P-RECIPES-COOK-REMOVED
// 2026-07-12). Esta capa solo pinta.
import { useId, useMemo, useState } from 'react';
import { metaFor, STEP_ICONS, getMacros, ICONS, conicStops as _conicStops } from './recipesData';
import { displayAjiMorron } from '../../utils/ingredientDisplay';
import styles from './RecipesView.module.css';
// [P1-I18N-DASHBOARD · 2026-08-15] `metaFor(...)` se guardaba en una variable
// llamada `t`; ahora se llama `mt` para que `t` sea la traducción, como en el
// resto del dashboard. `formatNumber` reemplaza el `toLocaleString('es-DO')`
// fijo: un menú en francés con cifras en formato dominicano delata la
// traducción a medias.
import { useT, formatNumber } from '../../i18n';
import { mealSlotLabel, mealDifficultyLabel } from '../../utils/displayMeal';
// [P2-RECIPE-NOTES-NOT-STEPS · 2026-07-24] anotaciones sin número (ver util).
import { numberRecipeSteps } from '../../utils/recipeSteps';
// [P1-EATEN-SLOT-COPY · 2026-07-28] Texto del chip "ya registraste tu
// <slot>" — SSOT compartido con Dashboard.jsx/MobileRecipes.jsx. El detalle
// (qué se registró + kcal) llega precomputado en `meal._eatenClaim`
// (Recipes.jsx) — esta vista no re-decide esa frase, solo la pinta.
import { eatenChipLabel } from '../../utils/todayRemaining';

const Svg = ({ d, size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
       dangerouslySetInnerHTML={{ __html: d }} />
);

// Secciones especiales del paso (mismo contrato que generateRecipeHTML en
// Recipes.jsx): "Mise en place:", "El Toque de Fuego:", "Montaje:".
const SECTIONS = [
  { rx: /^mise en place:\s*/i, title: 'Mise en place' },
  { rx: /^(el\s+)?toque de fuego:\s*/i, title: 'El Toque de Fuego' },
  { rx: /^montaje:\s*/i, title: 'Montaje' },
];
function parseStep(raw) {
  const s = String(raw || '');
  for (const sec of SECTIONS) {
    if (sec.rx.test(s)) return { title: sec.title, body: s.replace(sec.rx, '') };
  }
  return { title: null, body: s };
}
// **negrita** → <strong>
function renderBold(text) {
  return String(text).split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part,
  );
}

export function RecipesView({
  days, activeDayGlobalIdx, onSelectDay,
  meals, activeMealIndex, onSelectMeal,
  meal, steps = [], dayKcal, activeDayLabel = '', activeDayEsHoy = false,
  checkedIngredients = {}, onToggleIngredient,
  onPDF,
}) {
  const t = useT();
  return (
    <section className={styles.app} aria-label={t('Recetas')}>
      <header className={styles.top}>
        {/* [P3-RECIPES-NO-TITLE · 2026-07-12] Título "Recetario"/"Recetas"
            eliminado a pedido del owner (sin sinónimo de reemplazo). El
            selector de días pasa a ser el ancla izquierda del header. */}
        {days.length > 1 ? (
          <div className={styles.days} role="tablist">
            {days.map((d) => (
              <button key={d.globalIdx} role="tab" aria-selected={d.globalIdx === activeDayGlobalIdx}
                      className={styles.day} onClick={() => onSelectDay(d.globalIdx)}>{d.label}</button>
            ))}
          </div>
        ) : (
          /* [P1-RECIPES-DAY-LABEL · 2026-08-14] Con UN solo día no hay nada que
             elegir, pero sigue habiendo algo que decir. Antes esta rama no
             existía y la pantalla se quedaba muda sobre el día —el owner:
             «¿por qué si hoy es viernes, en Recetas no lo dice?»— además de
             dejar el encabezado sin ancla izquierda. */
          <span className={styles.diaUnico}>
            {activeDayLabel}{activeDayEsHoy ? ` · ${t('hoy')}` : ''}
          </span>
        )}
        <span className={styles.sum}>{t('Meta del día')} · <b>{formatNumber(dayKcal || 0)}</b> kcal</span>
      </header>

      <div className={styles.layout}>
        <MealRail meals={meals} active={activeMealIndex} onSelect={onSelectMeal}
                  diaLabel={activeDayLabel} esHoy={activeDayEsHoy} />
        <RecipeDetail
          key={`${activeDayGlobalIdx}|${activeMealIndex}`}
          meal={meal}
          steps={steps}
          checkedIngredients={checkedIngredients}
          onToggleIngredient={onToggleIngredient}
          onPDF={onPDF}
        />
      </div>
    </section>
  );
}

function MealRail({ meals, active, onSelect, diaLabel = '', esHoy = false }) {
  const t = useT();
  // [P1-RECIPES-DAY-LABEL · 2026-08-14] «Comidas de hoy» solo cuando el día
  // activo ES hoy. Con un plan de varios días puedes mirar mañana desde las
  // pestañas, y el riel seguía llamándolo «hoy»: no era falta de información,
  // era una afirmación falsa.
  const titulo = esHoy
    ? t('Comidas de hoy')
    : (diaLabel ? t('Comidas del {dia}', { dia: diaLabel.toLowerCase() }) : t('Comidas del día'));
  return (
    <aside className={styles.rail} aria-label={t('Comidas del día')}>
      <div className={styles.railHead}>{titulo}</div>
      {meals.map((m, i) => {
        const mt = metaFor(m.meal);
        // [P1-EATEN-SLOT-RECIPES · 2026-07-28 · reversado parcialmente por
        // P1-EATEN-RECIPE-LOCK · 2026-07-28] Este RIEL sigue sin lock — sigue
        // siendo navegación pura, nunca la acción que el owner pidió
        // bloquear. El botón sigue 100% clickeable/navegable aunque el slot
        // ya se haya comido; solo se atenúa visualmente + suma el chip,
        // mismo lenguaje que "Tu Menú" del Dashboard (P1-TODAY-REMAINING).
        // Lo que SÍ se bloquea de verdad ahora — "Descargar PDF", los
        // checkboxes de ingredientes, el toggle de pasos — vive en el PANE
        // de detalle (RecipeDetail, abajo); ver el comentario largo ahí para
        // el mecanismo y por qué bloquear es seguro en esta página.
        const eaten = !!m._isEatenToday;
        return (
          <button key={i} className={eaten ? `${styles.meal} ${styles.eaten}` : styles.meal} aria-current={i === active}
                  style={{ '--tone': mt.tone }} onClick={() => onSelect(i)}
                  title={eaten ? m._eatenClaim : undefined}>
            <span className={styles.mealIco}><Svg d={mt.icon} size={20} /></span>
            <span className={styles.mealBody}>
              {/* [P1-RECIPES-SLOT-I18N · 2026-08-20] El slot iba CRUDO aquí mientras
                  Dashboard e Historial ya lo pasaban por `mealSlotLabel`: con la app en
                  inglés, Recetas era la única pantalla que seguía diciendo DESAYUNO. */}
              <span className={styles.mealType}>{mealSlotLabel(m.meal, t)}</span>
              <span className={styles.mealTitle}>{m.name}</span>
              <span className={styles.mealKcal}><Svg d={ICONS.flame} size={12} /> {m.cals} kcal</span>
              {eaten && (
                <span className={styles.eatenBadge}>
                  <Svg d={ICONS.check} size={11} /> {eatenChipLabel(m.meal)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </aside>
  );
}

function RecipeDetail({ meal, steps, checkedIngredients, onToggleIngredient, onPDF }) {
  const t = useT();
  const mt = metaFor(meal.meal);
  const [doneSteps, setDoneSteps] = useState(() => new Set());
  const toggleStep = (i) => setDoneSteps((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const hasMacros = Number(meal.protein) > 0 || Number(meal.carbs) > 0 || Number(meal.fats) > 0;

  // Dona de calorías: segmentos conic por aporte calórico de cada macro.
  const { gradient, macroRow } = useMemo(() => {
    const calc = getMacros().map((x) => ({ ...x, g: Number(meal[x.key]) || 0, kc: (Number(meal[x.key]) || 0) * x.kcal }));
    return { gradient: `conic-gradient(${_conicStops(calc).join(',')})`, macroRow: calc };
  }, [meal]);

  const ingredients = meal.ingredients || [];

  // [P1-EATEN-RECIPE-DONE · 2026-07-28] El owner: "se bloquea visualmente
  // solo una PARTE (el riel) — la receta completa de al lado se ve como
  // cualquier otra". `meal._isEatenToday` ya llega gateado a "el día
  // mostrado ES hoy" (Recipes.jsx:594-618, `_eatenIndices` es un Set VACÍO
  // cuando el día activo no es hoy) — una sola condición cubre ambos
  // requisitos (slot comido Y día=hoy), ver CSS module para el mecanismo
  // (filter grayscale, nunca opacity/hide/disable en el NODO RAÍZ).
  //
  // [P1-EATEN-RECIPE-LOCK · 2026-07-28] El owner, dos veces: "quiero un
  // bloqueo ABSOLUTO y no simplemente visual" sobre descargar el PDF y sobre
  // anotar/confirmar los alimentos — SUPERSEDE la decisión previa ("Recetas
  // es solo lectura, NUNCA lock"; ver CLAUDE.md, sección revertida). Mismo
  // flag (`isLocked`) alimenta los 3 controles que de verdad se inertizan
  // abajo: "Descargar PDF", los checkboxes de ingredientes y el toggle de
  // pasos. La RECETA (título/desc/ingredientes/pasos como TEXTO) sigue
  // legible sin gate — el match es por `meal_type`, nunca por nombre de
  // plato, así que puede estar mal emparejado, y leer es la única forma de
  // notarlo. El riel de navegación (arriba) tampoco se toca.
  //
  // Por qué bloquear es seguro acá: el usuario se desbloquea A SÍ MISMO en
  // un solo paso — borrar la comida registrada en "Progreso en Tiempo Real"
  // limpia `_isEatenToday` y los 3 controles se re-habilitan.
  // ⚠️ El mecanismo EXACTO importa: Recipes.jsx NO escucha
  // `mealfit:today-consumed-updated` (ese evento es solo Dashboard ↔
  // TrackingProgress). Acá el diario se pide UNA vez por montaje
  // (`_consumedFetchedRef`), así que el desbloqueo llega al volver a la
  // página (navegación SPA fuera y de vuelta = remonta = refetch), NO en
  // vivo mientras la página está montada — lo cual basta, porque borrar la
  // fila solo se puede hacer FUERA de esta página. Si algún día se le pone
  // keep-alive a esta ruta (como AgentPage), este escape hatch se rompe en
  // silencio: habría que suscribirse al evento antes de hacerlo.
  // Un lock con escape hatch visible es distinto de un callejón sin salida.
  const isLocked = !!meal._isEatenToday;
  const detailCls = isLocked ? `${styles.detail} ${styles.eaten}` : styles.detail;
  // [P1-EATEN-RECIPE-LOCK · 2026-07-28] Un `title` NO es accesible (no llega
  // al árbol de accesibilidad de forma confiable) — la razón del bloqueo
  // necesita `aria-describedby` apuntando a un nodo real. Un solo nodo
  // visualmente oculto por pane basta: los 3 controles comparten EXACTAMENTE
  // la misma razón (`meal._eatenClaim`, cta='unlock', SSOT en
  // todayRemaining.js). `useId()` da un id estable por instancia del
  // componente — no colisiona si React re-renderiza ni entre desktop/mobile
  // (nunca están montados a la vez).
  const lockReasonId = useId();

  return (
    <div className={detailCls} style={{ '--tone': mt.tone }}>
      {/* [P1-EATEN-RECIPE-LOCK · 2026-07-28] Texto SOLO para lectores de
          pantalla (ver `.srOnly` en el CSS module) — la razón + el escape
          hatch, referenciada por `aria-describedby` desde los 3 controles
          bloqueados abajo. */}
      {isLocked && (
        <p id={lockReasonId} className={styles.srOnly}>{meal._eatenClaim}</p>
      )}
      {/* Encabezado tipográfico (sin imagen) */}
      <div className={styles.head2}>
        <div className={styles.h2body}>
          <h2 className={styles.title}>{meal.name}</h2>
          <div className={styles.chips}>
            <span className={`${styles.chip} ${styles.kcal}`}><Svg d={ICONS.flame} size={13} /> {meal.cals} kcal</span>
            {meal.prep_time && <span className={styles.chip}><Svg d={ICONS.clock} size={13} /> {meal.prep_time}</span>}
            {meal.difficulty && <span className={styles.chip}><Svg d={ICONS.chef} size={13} /> {mealDifficultyLabel(meal.difficulty, t)}</span>}
            {/* [P1-EATEN-SLOT-RECIPES · 2026-07-28] Marcador quieto — misma fila
                de chips (kcal/tiempo/dificultad), mismo peso visual: NO es un
                banner, NO bloquea nada, NO oculta la receta, NO toca el botón
                de PDF.
                [P1-EATEN-SLOT-COPY · 2026-07-28] El chip visible ya NO lleva
                kcal — quedaba discutiendo con el chip `{meal.cals} kcal` de
                al lado (dos números distintos en la misma fila). El detalle
                (nombre real del diario + kcal, framing de estimado) vive en
                `meal._eatenClaim`, usado como `title`. */}
            {meal._isEatenToday && (
              <span className={`${styles.chip} ${styles.eatenChip}`}
                    title={meal._eatenClaim}>
                <Svg d={ICONS.check} size={13} /> {eatenChipLabel(meal.meal)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Macros: dona + leyenda */}
      {hasMacros && (
        <div className={styles.macros}>
          <div className={styles.donut} style={{ background: gradient }}>
            <div className={styles.donutHole}><b>{meal.cals}</b><span>kcal</span></div>
          </div>
          <div className={styles.macroRow}>
            {macroRow.map((x) => (
              <div key={x.key} className={styles.mac}>
                <span className={styles.dot} style={{ background: x.c }} />
                <div>
                  <div className={styles.macLab}>{x.k}</div>
                  <div className={styles.macVal}>{x.g}<small>g</small></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {meal.desc && <p className={styles.desc}>“{meal.desc}”</p>}

      {/* [P-RECIPES-COOK-REMOVED · 2026-07-12] Botón "Cocinar" (modo cocina +
          expansión LLM) retirado del producto — la única acción es descargar
          el PDF, que ahora lleva el estilo primary.
          [P1-EATEN-RECIPE-LOCK · 2026-07-28 · corregido en revisión de código
          el mismo día] Este `<button>` usaba `disabled` NATIVO al cerrar el
          commit original — se revirtió a `aria-disabled` (mismo patrón que
          los checkboxes de ingredientes y el toggle de pasos, abajo) porque
          `disabled` nativo saca el elemento del tab order POR COMPLETO: un
          usuario de teclado (vidente o con lector de pantalla) que navega con
          Tab nunca enfoca el botón, así que el `aria-describedby` que apunta
          a la razón del bloqueo jamás se dispara — el único texto que explica
          el bloqueo (`meal._eatenClaim`, en el nodo `.srOnly` de arriba)
          queda inalcanzable por CUALQUIER camino de teclado. Con
          `aria-disabled` el botón sigue siendo focosable (foco nativo de
          `<button>`, sin necesitar `tabIndex` explícito) y el bloqueo real
          sigue siendo absoluto porque vive en JS: el early-return dentro del
          handler (mismo patrón que el resto del repo, ej. Dashboard.jsx
          "Cambiar Plato") cubre tanto el click de mouse como el Enter/Space
          nativo de un `<button>` enfocado — `aria-disabled` NO desactiva la
          activación por teclado por sí solo, por eso el guard en el handler
          sigue siendo obligatorio, no solo defensa-en-profundidad. Texto
          visible "Descargar PDF" NO se toca — solo se suma
          `aria-describedby`, nunca `aria-label` (eso REEMPLAZARÍA el nombre
          accesible por la razón del bloqueo, perdiendo la acción — nos
          mordió antes en el botón del riel de Recetas). La clase `.locked`
          es la afordancia visible extra (cursor:not-allowed) más allá de la
          desaturación del pane. */}
      <div className={styles.actions} data-html2canvas-ignore="true">
        <button
          className={`${styles.btn} ${styles.primary}${isLocked ? ` ${styles.locked}` : ''}`}
          onClick={() => { if (isLocked) return; onPDF(); }}
          aria-disabled={isLocked || undefined}
          aria-describedby={isLocked ? lockReasonId : undefined}
        >
          <Svg d={ICONS.pdf} size={17} /> {t('Descargar PDF')}
        </button>
      </div>

      <div className={styles.cols}>
        {ingredients.length > 0 && (
          <div>
            <h3 className={styles.secHead} style={{ '--accent': 'var(--secondary)' }}>{t('Ingredientes')}</h3>
            {/* [P2-RECIPE-HOUSEHOLD-NOTE · 2026-07-01] La receta es POR PERSONA; solo la lista de compras
                multiplica por el hogar (calc_household_multiplier). Sin esta nota, un hogar de 4 cocinaba
                porción de 1 con despensa ×4 y nadie le decía por qué. */}
            <p style={{ fontSize: '0.78rem', opacity: 0.65, margin: '0 0 8px' }}>
              {t('Porciones para 1 persona — si cocinas para tu hogar, multiplica cada cantidad (tu lista de compras ya lo tiene en cuenta).')}
            </p>
            <div className={styles.ing}>
              {ingredients.map((s, i) => {
                const done = !!checkedIngredients[i];
                return (
                  // [P1-6 · 2026-07-09] a11y: role=checkbox + aria-checked + teclado
                  // (antes <div onClick> sin acceso por teclado ni estado para lectores).
                  // [P1-EATEN-RECIPE-LOCK · 2026-07-28] `role="checkbox"` es un DIV, no
                  // hay `disabled` nativo — `aria-disabled` + handlers inertes (click Y
                  // el camino Enter/Space del `onKeyDown`, ambos vivos hoy). Se
                  // MANTIENE `tabIndex={0}` (focusable) a propósito: quitarlo sacaría el
                  // control del tab order sin dar ninguna señal — un usuario de teclado
                  // notaría que "desapareció", no que está bloqueado. Con
                  // `aria-disabled` + `aria-describedby` el control sigue siendo
                  // alcanzable y el lector de pantalla anuncia la razón + el escape
                  // hatch (mismo criterio que WAI-ARIA recomienda para "deshabilitado
                  // pero descubrible", a diferencia del `disabled` nativo del botón de
                  // PDF arriba, que si saca el foco — ahí es apropiado porque es un
                  // `<button>` real con affordance de disabled ya conocida).
                  // Nunca `aria-label`: el nombre accesible de este checkbox viene del
                  // texto del ingrediente (name-from-content) — un aria-label lo
                  // reemplazaría por la razón del bloqueo y el usuario dejaría de saber
                  // QUÉ ingrediente es.
                  <div key={i} className={`${styles.ingItem} ${done ? styles.done : ''}`}
                       role="checkbox" aria-checked={done} tabIndex={0}
                       aria-disabled={isLocked || undefined}
                       aria-describedby={isLocked ? lockReasonId : undefined}
                       onClick={() => { if (isLocked) return; onToggleIngredient(i); }}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter' || e.key === ' ') {
                           e.preventDefault();
                           if (isLocked) return;
                           onToggleIngredient(i);
                         }
                       }}>
                    <span className={styles.check}><Svg d={ICONS.check} size={12} /></span>
                    <span className={styles.ingText}>{displayAjiMorron(s)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <h3 className={styles.secHead} style={{ '--accent': mt.tone }}>{t('Instrucciones')}</h3>
          {steps.length > 0 ? (
            <div className={styles.steps}>
              {numberRecipeSteps(steps).map(({ raw, annotation, number }, i) => {
                const si = STEP_ICONS[i % STEP_ICONS.length];
                const done = doneSteps.has(i);
                const { title, body } = parseStep(raw);
                return (
                  // [P1-EATEN-RECIPE-LOCK · 2026-07-28] Mismo tratamiento que los
                  // checkboxes de ingredientes: `aria-disabled` + click inerte
                  // (este `<div>` nunca tuvo `tabIndex`/`onKeyDown` — no se le suma
                  // ahora, solo se cierra el `onClick`). `aria-disabled` es un
                  // atributo global válido sin `role` explícito.
                  <div key={i} className={`${styles.step} ${done ? styles.done : ''}`}
                       style={{ '--stone': si.c }}
                       aria-disabled={isLocked || undefined}
                       aria-describedby={isLocked ? lockReasonId : undefined}
                       onClick={() => { if (isLocked) return; toggleStep(i); }}>
                    <span className={styles.node}>{done ? <Svg d={ICONS.check} size={18} /> : (annotation ? '•' : number)}</span>
                    <div className={styles.stepCard}>
                      {title && <div className={styles.stepTitle}>{title}</div>}
                      <div className={styles.stepText}>{renderBold(body)}</div>
                    </div>
                  </div>
                );
              })}
              {/* Cierre del timeline: nodo verde + tarjeta — mismo diseño que los pasos. */}
              <div className={`${styles.step} ${styles.finish}`}>
                <span className={styles.node}><Svg d={ICONS.check} size={18} /></span>
                <div className={styles.stepCard}>
                  <div className={styles.finishText}>{t('¡Listo para disfrutar!')}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.empty}>{t('No hay pasos detallados. Guíate de la descripción general.')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
