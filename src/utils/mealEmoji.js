// [P1-CLINICAL-MEAL-COUNT · 2026-06-27] SSOT del emoji de comida por SLOT (no por índice).
// Antes los paneles del Historial usaban un array posicional ['🍳','🍲','🥗','🍎'][i] que se
// descuadraba con planes de 3/5/6 comidas (ej. en un plan de 5, "Merienda AM" en índice 1 mostraba
// 🍲 de almuerzo). Mapea por substring del nombre del slot — preserva el look del plan de 4 comidas
// (desayuno🍳 / almuerzo🍲 / merienda🥗 / cena🍎) y resuelve correctamente Merienda AM/PM/Nocturna.
export function mealEmojiFor(slot) {
  const t = String(slot || "").toLowerCase();
  if (t.includes("desayuno")) return "🍳";
  if (t.includes("almuerzo") || t.includes("comida")) return "🍲";
  if (t.includes("merienda") || t.includes("snack")) return "🥗";
  if (t.includes("cena")) return "🍎";
  return "🍽️";
}
