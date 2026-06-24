// [P3-RECIPES-REDESIGN · 2026-06-24] Vista presentacional de Recetas (diseño
// MicronutrientGaps→RecipesView del owner). Recibe datos REALES del plan +
// handlers desde Recipes.jsx (que conserva: modo cocina, PDF, expandir pasos
// con IA, registrar comida, ventana de días del chunk). Esta capa solo pinta.
import { useMemo, useState } from 'react';
import { metaFor, STEP_ICONS, MACROS, ICONS } from './recipesData';
import { displayAjiMorron } from '../../utils/ingredientDisplay';
import styles from './RecipesView.module.css';

const Svg = ({ d, size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
       dangerouslySetInnerHTML={{ __html: d }} />
);

// Secciones especiales del paso (mismo contrato que FormattedRecipeStep en
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
  onCook, onPDF, isExpanding,
}) {
  return (
    <section className={styles.app} aria-label="Recetas">
      <header className={styles.top}>
        <h1>Recetas</h1>
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
          onCook={onCook}
          onPDF={onPDF}
          isExpanding={isExpanding}
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

function RecipeDetail({ meal, steps, checkedIngredients, onToggleIngredient, onCook, onPDF, isExpanding }) {
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
    const tot = calc.reduce((s, x) => s + x.kc, 0) || 1;
    let acc = 0;
    const stops = calc.map((x) => {
      const a = (acc / tot) * 100, b = ((acc + x.kc) / tot) * 100;
      acc += x.kc;
      return `${x.c} ${a.toFixed(1)}% ${b.toFixed(1)}%`;
    });
    return { gradient: `conic-gradient(${stops.join(',')})`, macroRow: calc };
  }, [meal]);

  const ingredients = meal.ingredients || [];
  const allStepsDone = doneSteps.size >= steps.length && steps.length > 0;

  return (
    <div className={styles.detail} style={{ '--tone': t.tone }}>
      {/* Encabezado tipográfico (sin imagen) */}
      <div className={styles.head2}>
        <span className={styles.emblem}><Svg d={t.icon} size={27} /></span>
        <div className={styles.h2body}>
          <span className={styles.badge}><Svg d={t.icon} size={12} /> {meal.meal}</span>
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

      <div className={styles.actions} data-html2canvas-ignore="true">
        {steps.length > 0 && (
          <button className={`${styles.btn} ${styles.primary}`} onClick={onCook} disabled={isExpanding}>
            <Svg d={isExpanding ? ICONS.loader : ICONS.play} size={17} /> {isExpanding ? 'Generando…' : 'Cocinar'}
          </button>
        )}
        <button className={`${styles.btn} ${styles.ghost}`} onClick={onPDF}>
          <Svg d={ICONS.pdf} size={17} /> PDF
        </button>
      </div>

      <div className={styles.cols}>
        {ingredients.length > 0 && (
          <div>
            <h3 className={styles.secHead} style={{ '--accent': 'var(--secondary)' }}>Ingredientes</h3>
            <div className={styles.ing}>
              {ingredients.map((s, i) => {
                const done = !!checkedIngredients[i];
                return (
                  <div key={i} className={`${styles.ingItem} ${done ? styles.done : ''}`} onClick={() => onToggleIngredient(i)}>
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
            <>
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
              </div>
              {allStepsDone && (
                <div className={styles.stepDone}><Svg d={ICONS.check} size={17} /> ¡Listo para disfrutar!</div>
              )}
            </>
          ) : (
            <div className={styles.empty}>No hay pasos detallados. Guíate de la descripción general.</div>
          )}
        </div>
      </div>
    </div>
  );
}
