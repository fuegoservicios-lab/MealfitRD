// [P3-RECIPES-REDESIGN · 2026-06-24] Config visual del rediseño de Recetas
// (RecipesView). Iconos de línea (paths, currentColor), color+icono por tipo de
// comida y por paso, y kcal/g por macro para la dona.

// Iconos por tipo de comida y por paso (paths de línea, currentColor)
export const ICONS = {
  sun:'<path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4"/><circle cx="12" cy="12" r="4"/>',
  fish:'<path d="M2 12c3-5 8-6 13-6 4 0 7 3 7 6s-3 6-7 6c-5 0-10-1-13-6Z"/><circle cx="8" cy="11" r="1"/>',
  cup:'<path d="M18 8h1a3 3 0 0 1 0 6h-1"/><path d="M4 8h14v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
  flame:'<path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.5.6-2.8 1.3-3.8C9 9.6 12 8 12 3Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chef:'<path d="M7 21h10M7 17h10M6 13a4 4 0 1 1 1.5-7.7 4 4 0 0 1 9 0A4 4 0 1 1 18 13Z"/>',
  play:'<path d="M7 4v16l13-8z"/>', pdf:'<path d="M12 3v12M7 11l5 5 5-5"/><path d="M5 21h14"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  leaf:'<path d="M11 20a8 8 0 0 1 8-8c0-5-4-9-9-9-1 7-6 9-6 13a4 4 0 0 0 7 4Z"/>',
  utensils:'<path d="M4 3v7a2 2 0 0 0 2 2a2 2 0 0 0 2-2V3M6 12v9M18 3c-2 0-3 2-3 5s1 4 3 4v9"/>',
  sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  loader:'<path d="M12 3a9 9 0 1 0 9 9"/>',
};

// Color + icono por tipo de comida
export const MEAL_META = {
  Desayuno: { tone: '#FBBF24', icon: ICONS.sun },
  Almuerzo: { tone: '#34D399', icon: ICONS.fish },
  Merienda: { tone: '#38BDF8', icon: ICONS.cup },
  Cena:     { tone: '#A78BFA', icon: ICONS.moon },
};

// Fallback robusto: el `meal.meal` real puede variar (Snack, Comida, Cena
// ligera…). Hacemos match difuso por palabra clave; si nada calza, default.
export function metaFor(tipo) {
  if (MEAL_META[tipo]) return MEAL_META[tipo];
  const t = String(tipo || '').toLowerCase();
  if (t.includes('desayuno')) return MEAL_META.Desayuno;
  if (t.includes('almuerzo') || t.includes('comida')) return MEAL_META.Almuerzo;
  if (t.includes('merienda') || t.includes('snack')) return MEAL_META.Merienda;
  if (t.includes('cena')) return MEAL_META.Cena;
  return { tone: 'var(--primary)', icon: ICONS.utensils };
}

// Color + icono por índice de paso (se cicla)
export const STEP_ICONS = [
  { c: '#22D3EE', i: ICONS.leaf },
  { c: '#FB923C', i: ICONS.flame },
  { c: '#A78BFA', i: ICONS.utensils },
  { c: '#34D399', i: ICONS.sparkle },
];

// kcal/g por macro para la dona. `key` mapea a los campos reales del meal.
export const MACROS = [
  { k: 'Proteínas', key: 'protein', c: '#34D399', kcal: 4 },
  { k: 'Carbos',    key: 'carbs',   c: '#818CF8', kcal: 4 },
  { k: 'Grasas',    key: 'fats',    c: '#FB7185', kcal: 9 },
];

// [P2-LINT-ZERO · 2026-07-09] Segmentos acumulados del conic-gradient de la
// dona de macros. Extraído del useMemo duplicado en RecipesView/MobileRecipes:
// la mutación del acumulador dentro de un closure de render disparaba
// react-hooks/immutability; como función pura module-level no hay closure de
// render y la lógica queda en un solo sitio.
export function conicStops(calc) {
  const tot = calc.reduce((s, x) => s + x.kc, 0) || 1;
  const stops = [];
  let acc = 0;
  for (const x of calc) {
    const a = (acc / tot) * 100;
    const b = ((acc + x.kc) / tot) * 100;
    acc += x.kc;
    stops.push(`${x.c} ${a.toFixed(1)}% ${b.toFixed(1)}%`);
  }
  return stops;
}
