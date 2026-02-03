// src/services/shoppingGenerator.js

/**
 * Genera una lista de compras consolidada basada en el plan de comidas.
 * Extrae los ingredientes de cada plato, los unifica y elimina duplicados.
 * 
 * @param {Object} planData - El objeto JSON completo devuelto por la IA
 * @returns {Array<string>} - Lista de ingredientes limpia y ordenada
 */
export const generateShoppingListFromPlan = (planData) => {
    // 1. Validaciones de seguridad
    // Si no hay plan o no tiene la estructura correcta, devolvemos array vacío
    if (!planData || !planData.perfectDay || !Array.isArray(planData.perfectDay)) {
        console.warn("ShoppingGenerator: Estructura de plan inválida o vacía.");
        return [];
    }

    // 2. Extracción de ingredientes (Flattening)
    // Recorremos cada comida (Desayuno, Almuerzo, etc.) y sacamos su array 'ingredients'
    const rawIngredients = planData.perfectDay.flatMap(meal => {
        // La IA debería devolver 'ingredients', pero si falla, usamos el nombre del plato como fallback
        if (meal.ingredients && Array.isArray(meal.ingredients) && meal.ingredients.length > 0) {
            return meal.ingredients;
        }
        return [meal.name]; 
    });

    // 3. Limpieza y Normalización
    const cleanList = rawIngredients
        .map(item => {
            if (!item || typeof item !== 'string') return null;
            // Quitamos espacios al inicio/final y caracteres raros si los hubiera
            return item.trim();
        })
        .filter(Boolean); // Elimina valores null o vacíos

    // 4. Eliminación de Duplicados (Case Insensitive)
    const uniqueIngredients = [];
    const seen = new Set(); // Usamos un Set para rastrear lo que ya agregamos

    cleanList.forEach(item => {
        // Convertimos a minúsculas para comparar: "Sal" == "sal"
        const normalized = item.toLowerCase();
        
        // Filtro de duplicados
        // Nota: Como la IA incluye cantidades (ej: "2 Huevos"), "2 Huevos" y "1 Huevo" 
        // contarán como items diferentes. Esto es correcto para un MVP para asegurar 
        // que el usuario compre suficiente, aunque idealmente en el futuro se sumarían.
        if (!seen.has(normalized)) {
            
            // Lógica extra: Evitar duplicados obvios de básicos como "Sal", "Aceite", "Pimienta"
            // Si ya vimos "sal", no agregamos "pizca de sal" si queremos ser estrictos, 
            // pero por seguridad dejamos que el usuario decida.
            // Aquí solo filtramos strings idénticos.
            
            seen.add(normalized);
            
            // Capitalizamos la primera letra para que se vea estético en la lista
            const formattedItem = item.charAt(0).toUpperCase() + item.slice(1);
            uniqueIngredients.push(formattedItem);
        }
    });

    // 5. Ordenar alfabéticamente para facilitar la compra en el súper
    return uniqueIngredients.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
};