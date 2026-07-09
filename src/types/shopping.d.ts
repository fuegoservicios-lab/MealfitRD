// [P1-1 · TS Fase 0 · 2026-07-09] Item de la lista de compras agregada.
// Grounded en shoppingHelpers.js:76-90 (resolveShopQty y sus alias de cantidad).
export interface ShoppingItem {
  ingredient_name?: string;
  category?: string;
  /** valor autoritativo poblado por el backend (P0-2) */
  market_qty_numeric?: number;
  /** legacy: puede venir string ("1 1/2") o number */
  market_qty?: number | string;
  quantity?: number | string;
  unit?: string;
  price?: number;
  [k: string]: unknown;
}
