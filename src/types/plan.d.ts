// [P1-1 · TS Fase 0 · 2026-07-09] Tipos de shape del plan nutricional.
// AMBIENT: con checkJs:false NO se enforzan sobre .js/.jsx todavia — dan
// inferencia en el editor y son la base de P1-2 (normalizePlanDays) y de la
// migracion .ts incremental (P3-3). Grounded en los accesos reales:
//   AssessmentContext.jsx:2299 (coalescing days||meals||perfectDay),
//   HistoryDesktopPanel.jsx:74, shoppingHelpers.js:76.

/**
 * Macros de una comida o total del dia. El generador emite alias inconsistentes
 * (p/c/g abreviado vs protein/carbs/fats). P1-2 los canonicaliza en un adaptador.
 */
export interface Macros {
  protein?: number;
  carbs?: number;
  fats?: number;
  /** alias abreviados emitidos por algunas ramas del generador */
  p?: number;
  c?: number;
  g?: number;
}

export interface MealIngredient {
  name?: string;
  quantity?: number | string;
  unit?: string;
  [k: string]: unknown;
}

/**
 * Una comida individual. Los alias de calorias (cals/kcal/calories) y de macros
 * (p/c/g vs protein/carbs/fats) conviven por historia del generador; leer via el
 * adaptador de P1-2, no directo campo-a-campo.
 */
export interface Meal {
  name?: string;
  title?: string;
  type?: string;
  /** alias de calorias: cualquiera puede venir poblado segun la rama del generador */
  calories?: number;
  cals?: number;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  p?: number;
  c?: number;
  g?: number;
  ingredients?: MealIngredient[] | string[];
  recipe?: string | string[];
  steps?: string[];
  time?: string;
  [k: string]: unknown;
}

export interface Day {
  day: number;
  meals: Meal[];
  [k: string]: unknown;
}

/**
 * El jsonb `plan_data`. Es un union de 3 shapes historicos:
 *   - moderno:            { days: Day[] }
 *   - legacy multi-meal:  { meals: Meal[] }
 *   - legacy "dia perfecto": { perfectDay: Meal[] }
 * Un branch olvidado del coalescing renderiza menu en blanco SIN error — por eso
 * P1-2 centraliza la normalizacion en normalizePlanDays().
 */
export interface PlanData {
  days?: Day[];
  meals?: Meal[];
  perfectDay?: Meal[];
  name?: string;
  calories?: number;
  macros?: Macros;
  generation_status?: 'pending' | 'processing' | 'complete' | string;
  [k: string]: unknown;
}

/** Projection minima del listado del Historial (getHistoryList). */
export interface PlanSummary {
  id?: string;
  plan_id?: string;
  name?: string;
  created_at?: string;
  calories?: number;
  [k: string]: unknown;
}
