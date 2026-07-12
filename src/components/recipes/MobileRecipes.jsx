// [P3-RECIPES-MOBILE-DEDICATED · 2026-06-24] Vista de Recetas dedicada a móvil
// (diseño MobileRecipes del owner). Misma interfaz de props que RecipesView —
// Recipes.jsx renderiza `isMobile ? <MobileRecipes/> : <RecipesView/>` con los
// MISMOS datos reales + handlers (PDF, días; el modo cocina se retiró —
// P-RECIPES-COOK-REMOVED 2026-07-12).
import { useMemo, useState } from 'react';
import { metaFor, STEP_ICONS, MACROS, ICONS, conicStops as _conicStops } from './recipesData';
import { displayAjiMorron } from '../../utils/ingredientDisplay';
import styles from './MobileRecipes.module.css';

const Svg = ({ d, size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
       dangerouslySetInnerHTML={{ __html: d }} />
);

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
  meal, steps = [], dayKcal,
  checkedIngredients = {}, onToggleIngredient,
  onPDF,
}) {
  const t = metaFor(meal.meal);
  const [doneSteps, setDoneSteps] = useState(() => new Set());
  const toggleStep = (i) => setDoneSteps((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const hasMacros = Number(meal.protein) > 0 || Number(meal.carbs) > 0 || Number(meal.fats) > 0;
  const { gradient, macroRow } = useMemo(() => {
    const calc = MACROS.map((x) => ({ ...x, g: Number(meal[x.key]) || 0, kc: (Number(meal[x.key]) || 0) * x.kcal }));
    return { gradient: `conic-gradient(${_conicStops(calc).join(',')})`, macroRow: calc };
  }, [meal]);

  const ingredients = meal.ingredients || [];

  return (
    <section className={styles.app} style={{ '--tone': t.tone }} aria-label="Recetas">
      {/* Barra superior fija */}
      <header className={styles.top}>
        {/* [P3-RECIPES-NO-TITLE · 2026-07-12] "Recetario" eliminado (pedido del
            owner, sin sinónimo). La meta del día ocupa la fila. */}
        <div className={styles.topRow}>
          <span className={styles.sum}>Meta del día · <b>{Number(dayKcal || 0).toLocaleString('es-DO')}</b> kcal</span>
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
      <div className={styles.rail} aria-label="Comidas del día">
        {meals.map((m, i) => {
          const mt = metaFor(m.meal);
          return (
            <button key={i} className={styles.meal} aria-current={i === activeMealIndex}
                    style={{ '--tone': mt.tone }} onClick={() => onSelectMeal(i)}>
              <span className={styles.mealIco}><Svg d={mt.icon} size={18} /></span>
              <span className={styles.mealBody}>
                <span className={styles.mealType}>{m.meal}</span>
                <span className={styles.mealKcal}>{m.cals} kcal</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Detalle */}
      <div className={styles.detail}>
        <div className={styles.head}>
          <h2 className={styles.title}>{meal.name}</h2>
          <div className={styles.chips}>
            <span className={`${styles.chip} ${styles.kcal}`}><Svg d={ICONS.flame} size={13} /> {meal.cals} kcal</span>
            {meal.prep_time && <span className={styles.chip}><Svg d={ICONS.clock} size={13} /> {meal.prep_time}</span>}
            {meal.difficulty && <span className={styles.chip}><Svg d={ICONS.chef} size={13} /> {meal.difficulty}</span>}
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

        {meal.desc && <p className={styles.desc}>“{meal.desc}”</p>}

        {/* [P-RECIPES-COOK-REMOVED · 2026-07-12] Botón "Cocinar" retirado —
            única acción: descargar PDF (estilo primary). */}
        <div className={styles.actions} data-html2canvas-ignore="true">
          <button className={`${styles.btn} ${styles.primary}`} onClick={onPDF}>
            <Svg d={ICONS.pdf} size={17} /> Descargar PDF
          </button>
        </div>

        {ingredients.length > 0 && (
          <>
            <h3 className={styles.secHead} style={{ '--accent': 'var(--secondary)' }}>Ingredientes</h3>
            {/* [P2-RECIPE-HOUSEHOLD-NOTE · 2026-07-01] receta por persona; la lista de compras ya multiplica. */}
            <p style={{ fontSize: '0.75rem', opacity: 0.65, margin: '0 0 8px' }}>
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
          </>
        )}

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
    </section>
  );
}
