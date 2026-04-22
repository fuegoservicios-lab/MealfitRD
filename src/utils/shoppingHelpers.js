export const getActiveShoppingList = (planData, duration) => {
    if (!planData || !duration) return null;
    const keyMap = {
        'weekly': 'aggregated_shopping_list_weekly',
        'biweekly': 'aggregated_shopping_list_biweekly',
        'monthly': 'aggregated_shopping_list_monthly'
    };
    const key = keyMap[duration];
    if (key && Array.isArray(planData[key]) && planData[key].length > 0) return planData[key];
    if (Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0) return planData.aggregated_shopping_list;
    return null;
};

export const calculateAllPlanIngredients = (planData, isPlanExpired, liveInventory) => {
    if (!planData || isPlanExpired) return [];

    const currentIngredientsMap = new Map();

    // 1. Agregar Inventario Físico (user_inventory) - Lo que ya tiene en casa
    if (liveInventory && Array.isArray(liveInventory) && liveInventory.length > 0) {
        liveInventory.forEach(item => {
            const qty = parseFloat(item.quantity) || 0;
            const unit = item.unit || 'unidad';
            const name = item.ingredient_name || item.master_ingredients?.name || 'Ingrediente';
            const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1).replace(/\.0$/, '');

            let displayQty = '';
            if (qty > 0) {
                if (unit === 'unidad') {
                    displayQty = qty === 1 ? '1 Ud.' : `${qtyStr} Uds.`;
                } else {
                    displayQty = `${qtyStr} ${unit}`;
                }
            }

            // id_string compatible con backend _parse_quantity
            const idString = unit === 'unidad'
                ? `${qtyStr} ${name}`
                : `${qtyStr} ${unit} de ${name}`;

            currentIngredientsMap.set(name.toLowerCase().trim(), {
                id_string: idString,
                quantity: displayQty,
                name: name
            });
        });
    }

    // 2. Agregar Lista de Compras (lo nuevo) - Debe sobreescribir para reflejar cantidades escaladas
    if (planData.aggregated_shopping_list && Array.isArray(planData.aggregated_shopping_list) && planData.aggregated_shopping_list.length > 0) {
        planData.aggregated_shopping_list.forEach(ing => {
            if (typeof ing === 'object' && ing !== null) {
                const idString = ing.display_string || ing.name || String(ing);
                const qty = ing.display_qty || '';
                const name = ing.name || ing.display_name || ing.display_string || 'Ingrediente';

                // Siempre sobreescribimos para asegurar que el UI refleje el nuevo tamaño del hogar
                currentIngredientsMap.set(name.toLowerCase().trim(), {
                    id_string: idString,
                    quantity: qty,
                    name: name
                });
                
                return;
            }

            // Fallback directo sin Regex para strings legacy
            const str_ing = String(ing).trim();
            currentIngredientsMap.set(str_ing.toLowerCase(), {
                id_string: str_ing,
                quantity: 'Al gusto',
                name: str_ing
            });
        });
    } else {
        // 3. Fallback Legacy si no hay aggregated_shopping_list
        const planDaysToCheck = planData.days || [{ day: 1, meals: planData.meals || planData.perfectDay || [] }];
        planDaysToCheck.forEach(day => {
            day.meals.forEach(meal => {
                if (meal && meal.ingredients && Array.isArray(meal.ingredients)) {
                    meal.ingredients.forEach(ing => {
                        let qty = 'Al gusto';
                        let name = 'Desconocido';
                        let id_string = '';

                        if (typeof ing === 'object' && ing !== null) {
                            name = ing.name || ing.display_name || ing.display_string || String(ing);
                            qty = ing.display_qty || (ing.market_qty && ing.market_unit ? `${ing.market_qty} ${ing.market_unit}` : 'Al gusto');
                            id_string = ing.display_string || name;
                        } else {
                            name = String(ing).trim();
                            id_string = name;
                        }

                        if (name.length > 2 && !currentIngredientsMap.has(name.toLowerCase().trim())) {
                            currentIngredientsMap.set(name.toLowerCase().trim(), { id_string: id_string, quantity: qty, name: name });
                        }
                    });
                }
            });
        });
    }

    return Array.from(currentIngredientsMap.values()).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
};
