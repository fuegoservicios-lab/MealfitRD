// [P3-RECIPES-REDESIGN · 2026-06-24] Vista presentacional de Recetas (diseño
// MicronutrientGaps→RecipesView del owner). Recibe datos REALES del plan +
// handlers desde Recipes.jsx (que conserva: PDF y ventana de días del chunk;
// el modo cocina/expandir con IA se retiró — P-RECIPES-COOK-REMOVED
// 2026-07-12). Esta capa solo pinta.
import { useMemo, useState } from 'react';
import { metaFor, STEP_ICONS, MACROS, ICONS, conicStops as _conicStops } from './recipesData';
import { displayAjiMorron } from '../../utils/ingredientDisplay';
import styles from './RecipesView.module.css';

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
  meal, steps = [], dayKcal,
  checkedIngredients = {}, onToggleIngredient,
  onPDF,
}) {
  return (
    <section className={styles.app} aria-label="Recetas">
      <header className={styles.top}>
        {/* [P3-RECIPES-NO-TITLE · 2026-07-12] Título "Recetario"/"Recetas"
            eliminado a pedido del owner (sin sinónimo de reemplazo). El
            selector de días pasa a ser el ancla izquierda del header. */}
        {days.length > 1 && (
          <div className={styles.days} role="tablist">
            {days.map((d) => (
              <button key={d.globalIdx} role="tab" aria-selected={d.globalIdx === activeDayGlobalIdx}
                      className={styles.day} onClick={() => onSelectDay(d.globalIdx)}>{d.label}</button>
            ))}
          </div>
        )}
        <span className={styles.sum}>Meta del día · <b>{Number(dayKcal || 0).toLocaleString('es-DO')}</b> kcal</span>
      </header>

      <div className={styles.layout}>
        <MealRail meals={meals} active={activeMealIndex} onSelect={onSelectMeal} />
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

function MealRail({ meals, active, onSelect }) {
  return (
    <aside className={styles.rail} aria-label="Comidas del día">
      <div className={styles.railHead}>Comidas de hoy</div>
      {meals.map((m, i) => {
        const t = metaFor(m.meal);
        return (
          <button key={i} className={styles.meal} aria-current={i === active}
                  style={{ '--tone': t.tone }} onClick={() => onSelect(i)}>
            <span className={styles.mealIco}><Svg d={t.icon} size={20} /></span>
            <span className={styles.mealBody}>
              <span className={styles.mealType}>{m.meal}</span>
              <span className={styles.mealTitle}>{m.name}</span>
              <span className={styles.mealKcal}><Svg d={ICONS.flame} size={12} /> {m.cals} kcal</span>
            </span>
          </button>
        );
      })}
    </aside>
  );
}

function RecipeDetail({ meal, steps, checkedIngredients, onToggleIngredient, onPDF }) {
  const t = metaFor(meal.meal);
  const [doneSteps, setDoneSteps] = useState(() => new Set());
  const toggleStep = (i) => setDoneSteps((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const hasMacros = Number(meal.protein) > 0 || Number(meal.carbs) > 0 || Number(meal.fats) > 0;

  // Dona de calorías: segmentos conic por aporte calórico de cada macro.
  const { gradient, macroRow } = useMemo(() => {
    const calc = MACROS.map((x) => ({ ...x, g: Number(meal[x.key]) || 0, kc: (Number(meal[x.key]) || 0) * x.kcal }));
    return { gradient: `conic-gradient(${_conicStops(calc).join(',')})`, macroRow: calc };
  }, [meal]);

  const ingredients = meal.ingredients || [];

  return (
    <div className={styles.detail} style={{ '--tone': t.tone }}>
      {/* Encabezado tipográfico (sin imagen) */}
      <div className={styles.head2}>
        <div className={styles.h2body}>
          <h2 className={styles.title}>{meal.name}</h2>
          <div className={styles.chips}>
            <span className={`${styles.chip} ${styles.kcal}`}><Svg d={ICONS.flame} size={13} /> {meal.cals} kcal</span>
            {meal.prep_time && <span className={styles.chip}><Svg d={ICONS.clock} size={13} /> {meal.prep_time}</span>}
            {meal.difficulty && <span className={styles.chip}><Svg d={ICONS.chef} size={13} /> {meal.difficulty}</span>}
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
          el PDF, que ahora lleva el estilo primary. */}
      <div className={styles.actions} data-html2canvas-ignore="true">
        <button className={`${styles.btn} ${styles.primary}`} onClick={onPDF}>
          <Svg d={ICONS.pdf} size={17} /> Descargar PDF
        </button>
      </div>

      <div className={styles.cols}>
        {ingredients.length > 0 && (
          <div>
            <h3 className={styles.secHead} style={{ '--accent': 'var(--secondary)' }}>Ingredientes</h3>
            {/* [P2-RECIPE-HOUSEHOLD-NOTE · 2026-07-01] La receta es POR PERSONA; solo la lista de compras
                multiplica por el hogar (calc_household_multiplier). Sin esta nota, un hogar de 4 cocinaba
                porción de 1 con despensa ×4 y nadie le decía por qué. */}
            <p style={{ fontSize: '0.78rem', opacity: 0.65, margin: '0 0 8px' }}>
              Porciones para 1 persona — si cocinas para tu hogar, multiplica cada cantidad
              (tu lista de compras ya lo tiene en cuenta).
            </p>
            <div className={styles.ing}>
              {ingredients.map((s, i) => {
                const done = !!checkedIngredients[i];
                return (
                  // [P1-6 · 2026-07-09] a11y: role=checkbox + aria-checked + teclado
                  // (antes <div onClick> sin acceso por teclado ni estado para lectores).
                  <div key={i} className={`${styles.ingItem} ${done ? styles.done : ''}`}
                       role="checkbox" aria-checked={done} tabIndex={0}
                       onClick={() => onToggleIngredient(i)}
                       onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleIngredient(i); } }}>
                    <span className={styles.check}><Svg d={ICONS.check} size={12} /></span>
                    <span className={styles.ingText}>{displayAjiMorron(s)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <h3 className={styles.secHead} style={{ '--accent': t.tone }}>Instrucciones</h3>
          {steps.length > 0 ? (
            <div className={styles.steps}>
              {steps.map((raw, i) => {
                const si = STEP_ICONS[i % STEP_ICONS.length];
                const done = doneSteps.has(i);
                const { title, body } = parseStep(raw);
                return (
                  <div key={i} className={`${styles.step} ${done ? styles.done : ''}`}
                       style={{ '--stone': si.c }} onClick={() => toggleStep(i)}>
                    <span className={styles.node}>{done ? <Svg d={ICONS.check} size={18} /> : i + 1}</span>
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
                  <div className={styles.finishText}>¡Listo para disfrutar!</div>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.empty}>No hay pasos detallados. Guíate de la descripción general.</div>
          )}
        </div>
      </div>
    </div>
  );
}
