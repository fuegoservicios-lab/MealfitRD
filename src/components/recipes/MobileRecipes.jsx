// [P3-RECIPES-MOBILE-DEDICATED · 2026-06-24] Vista de Recetas dedicada a móvil
// (diseño MobileRecipes del owner). Misma interfaz de props que RecipesView —
// Recipes.jsx renderiza `isMobile ? <MobileRecipes/> : <RecipesView/>` con los
// MISMOS datos reales + handlers (PDF, días; el modo cocina se retiró —
// P-RECIPES-COOK-REMOVED 2026-07-12).
import { useId, useMemo, useState } from 'react';
import { metaFor, STEP_ICONS, getMacros, ICONS, conicStops as _conicStops } from './recipesData';
import { displayAjiMorron } from '../../utils/ingredientDisplay';
import styles from './MobileRecipes.module.css';
// [P1-I18N-DASHBOARD · 2026-08-15] Espejo de RecipesView.jsx: `metaFor(...)`
// pasa a llamarse `mt` para dejarle el nombre `t` a la traducción, y
// `formatNumber` sustituye al `toLocaleString('es-DO')` fijo.
import { useT, formatNumber } from '../../i18n';
import { mealSlotLabel, mealDifficultyLabel } from '../../utils/displayMeal';
// [P2-RECIPE-NOTES-NOT-STEPS · 2026-07-24] anotaciones sin número (ver util).
import { numberRecipeSteps, parseRecipeStep } from '../../utils/recipeSteps';
// [P1-EATEN-SLOT-COPY · 2026-07-28] Texto del chip "ya registraste tu
// <slot>" — SSOT compartido con Dashboard.jsx/RecipesView.jsx. El detalle
// (qué se registró + kcal) llega precomputado en `meal._eatenClaim`
// (Recipes.jsx) — esta vista no re-decide esa frase, solo la pinta.
import { eatenChipLabel } from '../../utils/todayRemaining';

const Svg = ({ d, size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
       dangerouslySetInnerHTML={{ __html: d }} />
);

// [P1-DISPLAY-VOCAB-CERRADO · 2026-08-21] `SECTIONS` + `parseStep` vivían aquí Y en el
// otro componente de recetas, byte a byte, mientras la otra mitad del mismo vocabulario
// (las anotaciones) ya estaba en `utils/recipeSteps.js`. Ahora hay un solo sitio, y el
// rótulo se traduce en el render — no en el módulo, que congelaría el idioma.
function renderBold(text) {
  return String(text).split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part,
  );
}

export function MobileRecipes({
  days, activeDayGlobalIdx, onSelectDay,
  meals, activeMealIndex, onSelectMeal,
  meal, steps = [], dayKcal, activeDayLabel = '', activeDayEsHoy = false,
  checkedIngredients = {}, onToggleIngredient,
  onPDF,
  // [P2-I18N-LANG-POR-PARTE · 2026-08-21] `langs` lo calcula el CALLER: aquí el meal
  // llega ya traducido, así que desde dentro no hay forma de saber qué campo cayó al
  // español. `{}` por defecto — sin él, un consumidor viejo pintaría `lang="undefined"`.
  langs = {},
}) {
  const t = useT();
  const mt = metaFor(meal.meal);
  const [doneSteps, setDoneSteps] = useState(() => new Set());
  const toggleStep = (i) => setDoneSteps((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const hasMacros = Number(meal.protein) > 0 || Number(meal.carbs) > 0 || Number(meal.fats) > 0;
  const { gradient, macroRow } = useMemo(() => {
    const calc = getMacros().map((x) => ({ ...x, g: Number(meal[x.key]) || 0, kc: (Number(meal[x.key]) || 0) * x.kcal }));
    return { gradient: `conic-gradient(${_conicStops(calc).join(',')})`, macroRow: calc };
  }, [meal]);

  const ingredients = meal.ingredients || [];

  // [P1-EATEN-RECIPE-DONE · 2026-07-28 · reversado por P1-EATEN-RECIPE-LOCK
  // · 2026-07-28] Espejo EXACTO de RecipesView.jsx (RecipeDetail) — ver el
  // comentario largo ahí para el razonamiento completo (qué se archiva solo
  // visualmente vs qué se bloquea de verdad, y por qué bloquear es seguro en
  // esta página: escape hatch de un solo paso en "Progreso en Tiempo Real",
  // sin reload). `meal._isEatenToday` ya llega gateado a "día mostrado ===
  // hoy" desde Recipes.jsx.
  const isLocked = !!meal._isEatenToday;
  // [P1-EATEN-RECIPE-LOCK · 2026-07-28] Un solo nodo `.srOnly` por pane basta
  // — los 3 controles bloqueados comparten la MISMA razón (`meal._eatenClaim`,
  // cta='unlock'). `useId()` es estable por instancia; desktop/mobile nunca
  // están montados a la vez, así que no hay colisión posible.
  const lockReasonId = useId();

  return (
    <section className={styles.app} style={{ '--tone': mt.tone }} aria-label={t('Recetas')}>
      {/* Barra superior fija */}
      <header className={styles.top}>
        {/* [P3-RECIPES-NO-TITLE · 2026-07-12] "Recetario" eliminado (pedido del
            owner, sin sinónimo). La meta del día ocupa la fila. */}
        <div className={styles.topRow}>
          {/* [P1-RECIPES-DAY-LABEL · 2026-08-14] El día, siempre. Con varios se
              elige abajo en las pestañas; con uno solo esta es la única
              mención — antes no había ninguna y la pantalla no decía qué día
              estabas viendo. */}
          <span className={styles.diaUnico}>
            {activeDayLabel}{activeDayEsHoy ? ` · ${t('hoy')}` : ''}
          </span>
          <span className={styles.sum}>{t('Meta del día')} · <b>{formatNumber(dayKcal || 0)}</b> kcal</span>
        </div>
        {days.length > 1 && (
          <div className={styles.days} role="tablist">
            {days.map((d) => (
              <button key={d.globalIdx} role="tab" aria-selected={d.globalIdx === activeDayGlobalIdx}
                      className={styles.day} onClick={() => onSelectDay(d.globalIdx)}>{d.label}</button>
            ))}
          </div>
        )}
      </header>

      {/* Selector de comidas (scroll horizontal) */}
      <div className={styles.rail} aria-label={t('Comidas del día')}>
        {meals.map((m, i) => {
          const mt = metaFor(m.meal);
          // [P1-EATEN-SLOT-RECIPES · 2026-07-28 · reversado parcialmente por
          // P1-EATEN-RECIPE-LOCK · 2026-07-28] Este riel sigue sin lock — ver
          // misma nota (completa) en RecipesView.jsx (MealRail). Botón sigue
          // 100% clickeable/navegable; el bloqueo real vive en el pane de
          // detalle, abajo.
          const eaten = !!m._isEatenToday;
          return (
            <button key={i} className={eaten ? `${styles.meal} ${styles.eaten}` : styles.meal} aria-current={i === activeMealIndex}
                    style={{ '--tone': mt.tone }} onClick={() => onSelectMeal(i)}
                    title={eaten ? m._eatenClaim : undefined}>
              <span className={styles.mealIco}><Svg d={mt.icon} size={18} /></span>
              <span className={styles.mealBody}>
                <span className={styles.mealType}>{mealSlotLabel(m.meal, t)}</span>
                <span className={styles.mealKcal}>{m.cals} kcal</span>
                {eaten && (
                  <span className={styles.eatenBadge}>
                    <Svg d={ICONS.check} size={10} /> {eatenChipLabel(m.meal)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Detalle */}
      <div className={isLocked ? `${styles.detail} ${styles.eaten}` : styles.detail}>
        {/* [P1-EATEN-RECIPE-LOCK · 2026-07-28] Ver `.srOnly` en RecipesView.jsx
            (mismo mecanismo, ver comentario largo ahí). */}
        {isLocked && (
          <p id={lockReasonId} className={styles.srOnly}>{meal._eatenClaim}</p>
        )}
        <div className={styles.head}>
          {/* [P2-I18N-LANG-POR-PARTE · 2026-08-21] `lang` sólo si ESTE campo cayó
              al español; si vino traducido, hereda `<html lang>`. */}
          <h2 className={styles.title} lang={langs?.name || undefined}>{meal.name}</h2>
          <div className={styles.chips}>
            <span className={`${styles.chip} ${styles.kcal}`}><Svg d={ICONS.flame} size={13} /> {meal.cals} kcal</span>
            {meal.prep_time && <span className={styles.chip}><Svg d={ICONS.clock} size={13} /> {meal.prep_time}</span>}
            {meal.difficulty && <span className={styles.chip}><Svg d={ICONS.chef} size={13} /> {mealDifficultyLabel(meal.difficulty, t)}</span>}
            {/* [P1-EATEN-SLOT-RECIPES · 2026-07-28] Marcador quieto — ver
                misma nota en RecipesView.jsx (RecipeDetail).
                [P1-EATEN-SLOT-COPY · 2026-07-28] Sin kcal visible (discutía
                con el chip `{meal.cals} kcal` vecino) — detalle en el
                `title` (`meal._eatenClaim`, precomputado en Recipes.jsx). */}
            {meal._isEatenToday && (
              <span className={`${styles.chip} ${styles.eatenChip}`}
                    title={meal._eatenClaim}>
                <Svg d={ICONS.check} size={13} /> {eatenChipLabel(meal.meal)}
              </span>
            )}
          </div>
        </div>

        {/* Macros */}
        {hasMacros && (
          <div className={styles.macros}>
            <div className={styles.donut} style={{ background: gradient }}>
              <div className={styles.donutHole}><b>{meal.cals}</b><span>kcal</span></div>
            </div>
            <div className={styles.macroRow}>
              {macroRow.map((x) => (
                <div key={x.key} className={styles.mac}>
                  <span className={styles.dot} style={{ background: x.c }} />
                  <span className={styles.macLab}>{x.k}</span>
                  <span className={styles.macVal}>{x.g}<small>g</small></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {meal.desc && <p className={styles.desc} lang={langs?.desc || undefined}>“{meal.desc}”</p>}

        {/* [P-RECIPES-COOK-REMOVED · 2026-07-12] Botón "Cocinar" retirado —
            única acción: descargar PDF (estilo primary).
            [P1-EATEN-RECIPE-LOCK · 2026-07-28 · corregido en revisión de
            código el mismo día] Ver comentario largo en RecipesView.jsx:
            `aria-disabled` (NO `disabled` nativo — sacaría el botón del tab
            order y el `aria-describedby` nunca se dispararía) + early-return
            en el handler que cubre click Y el Enter/Space nativo del
            `<button>` enfocado, nunca `aria-label`. */}
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

        {ingredients.length > 0 && (
          <>
            <h3 className={styles.secHead} style={{ '--accent': 'var(--secondary)' }}>{t('Ingredientes')}</h3>
            {/* [P2-RECIPE-HOUSEHOLD-NOTE · 2026-07-01] receta por persona; la lista de compras ya multiplica. */}
            <p style={{ fontSize: '0.75rem', opacity: 0.65, margin: '0 0 8px' }}>
              {t('Porciones para 1 persona — si cocinas para tu hogar, multiplica cada cantidad (tu lista de compras ya lo tiene en cuenta).')}
            </p>
            <div className={styles.ing}>
              {ingredients.map((s, i) => {
                const done = !!checkedIngredients[i];
                return (
                  // [P1-6 · 2026-07-09] a11y: role=checkbox + aria-checked + teclado
                  // (antes <div onClick> sin acceso por teclado ni estado para lectores).
                  // [P1-EATEN-RECIPE-LOCK · 2026-07-28] Ver comentario largo en
                  // RecipesView.jsx (mismo patrón: `aria-disabled` + click Y
                  // Enter/Space inertes; se MANTIENE `tabIndex` — quitarlo sacaría
                  // el control del tab order sin dar ninguna señal; `aria-label`
                  // NUNCA, reemplazaría el nombre accesible por la razón).
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
          </>
        )}

        <h3 className={styles.secHead} style={{ '--accent': mt.tone }}>{t('Instrucciones')}</h3>
        {steps.length > 0 ? (
          <div className={styles.steps}>
            {numberRecipeSteps(steps).map(({ raw, annotation, number }, i) => {
              const si = STEP_ICONS[i % STEP_ICONS.length];
              const done = doneSteps.has(i);
              const { titleKey, body } = parseRecipeStep(raw);
              const title = titleKey ? t(titleKey) : null;
              return (
                // [P1-EATEN-RECIPE-LOCK · 2026-07-28] Ver comentario largo en
                // RecipesView.jsx — este `<div>` nunca tuvo `tabIndex`/`onKeyDown`,
                // no se le suma ahora; solo se cierra el `onClick`.
                <div key={i} className={`${styles.step} ${done ? styles.done : ''}`}
                     style={{ '--stone': si.c }}
                     aria-disabled={isLocked || undefined}
                     aria-describedby={isLocked ? lockReasonId : undefined}
                     onClick={() => { if (isLocked) return; toggleStep(i); }}>
                  <span className={styles.node}>{done ? <Svg d={ICONS.check} size={18} /> : (annotation ? '•' : number)}</span>
                  <div className={styles.stepCard}>
                    {title && <div className={styles.stepTitle}>{title}</div>}
                    <div className={styles.stepText} lang={langs?.recipe || undefined}>{renderBold(body)}</div>
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
    </section>
  );
}
