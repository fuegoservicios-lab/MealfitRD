// src/services/shoppingGenerator.js

/**
 * Parsea un string de ingrediente para separar cantidad, unidad y nombre.
 */
const parseIngredient = (ingredientString) => {
    let clean = ingredientString.trim().replace(/^[-*•]\s*/, '').trim();

    const fractionRegex = /^(\d+)\s+(\d+)\/(\d+)\s+(.*)$|^(\d+)\/(\d+)\s+(.*)$/;
    const decimalRegex = /^(\d*[.,]?\d+)\s*(.*)$/;

    let quantity = 0;
    let rest = clean;

    const fractionMatch = clean.match(fractionRegex);
    if (fractionMatch) {
        if (fractionMatch[1]) { 
            quantity = parseInt(fractionMatch[1]) + (parseInt(fractionMatch[2]) / parseInt(fractionMatch[3]));
            rest = fractionMatch[4];
        } else { 
            quantity = parseInt(fractionMatch[5]) / parseInt(fractionMatch[6]);
            rest = fractionMatch[7];
        }
    } else {
        const decimalMatch = clean.match(decimalRegex);
        if (decimalMatch) {
            quantity = parseFloat(decimalMatch[1].replace(',', '.'));
            rest = decimalMatch[2];
        } else {
            return { quantity: 1, unit: '', name: clean, isAbstract: true };
        }
    }

    // UNIDADES ACTUALIZADAS Y CORREGIDAS
    const units =[
        'taza', 'tazas', 'cda', 'cdas', 'cdta', 'cdtas', 'cdita', 'cditas', 'cucharada', 'cucharadas', 'cucharadita', 'cucharaditas', 'scoop', 'scoops',
        'g', 'gr', 'gramos', 'gramo', 'kg', 'kilos', 'kilo', 'kilogramo', 'kilogramos',
        'lb', 'lbs', 'libra', 'libras', 'oz', 'onza', 'onzas',
        'ml', 'mililitros', 'litro', 'litros',
        'unidad', 'unidades', 'pieza', 'piezas',
        'paquete', 'paquetes', 'lata', 'latas',
        'manojo', 'manojos', 'puñado', 'puñados',
        'diente', 'dientes', 'lonja', 'lonjas', 'rebanada', 'rebanadas',
        'tallo', 'tallos', 'frasco', 'frascos', 'botella', 'botellas',
        'vaso', 'vasos', 'copa', 'copas'
    ];

    const parts = rest.split(' ');
    let unit = '';
    let name = rest;

    if (parts.length > 0 && units.includes(parts[0].toLowerCase().replace('.', ''))) {
        unit = parts[0];
        name = parts.slice(1).join(' ');
    }

    return { quantity, unit, name: name.trim(), isAbstract: false };
};

/**
 * Normaliza un nombre de ingrediente para usarlo como key de consolidación.
 * - Quita acentos/tildes
 * - Convierte a minúsculas
 * - Singulariza sufijos comunes del español
 * - Quita artículos y preposiciones sueltas
 * - Normaliza espacios
 */
const normalizeNameForKey = (name) => {
    let n = name.toLowerCase();
    
    // Quitar acentos/tildes
    n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Quitar contenido entre paréntesis o corchetes
    n = n.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '');
    
    // Quitar preposiciones/artículos iniciales
    n = n.replace(/^(de |del |para |la |el |los |las |un |una |unos |unas )/, '');
    
    // Singularizar sufijos comunes en español para ingredientes
    // "hojuelas" -> "hojuela", "verdes" -> "verde", etc.
    n = n.replace(/\b(\w+)s\b/g, (match, word) => {
        // No singularizar palabras de 2 letras o menos
        if (word.length <= 2) return match;
        // Palabras que terminan en "es" -> quitar "es" si la raíz tiene sentido
        // Ej: "tomates" -> "tomate", pero cuidado con "res"
        return word;
    });
    // Quitar "s" final en palabras largas (>3 chars) para unificar plurales
    n = n.replace(/\b([a-z]{4,})s\b/g, '$1');
    // Casos especiales de plurales "es": "lentejas" ya cubierto arriba, pero "pimientos" -> "pimiento"
    // "rebanadas" -> "rebanada" ya cubierto
    
    // Normalizar espacios
    n = n.replace(/\s+/g, ' ').trim();
    
    return n;
};

/**
 * Normaliza una unidad para usarla como key de consolidación.
 */
const normalizeUnitForKey = (unit) => {
    const u = unit.toLowerCase().replace('.', '').trim();
    
    // Peso
    if (['g', 'gr', 'gramo', 'gramos'].includes(u)) return 'g';
    if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(u)) return 'kg';
    if (['lb', 'lbs', 'libra', 'libras'].includes(u)) return 'lb';
    if (['oz', 'onza', 'onzas'].includes(u)) return 'oz';
    
    // Volumen
    if (['ml', 'mililitro', 'mililitros'].includes(u)) return 'ml';
    if (['litro', 'litros'].includes(u)) return 'litro';
    if (['taza', 'tazas'].includes(u)) return 'taza';
    if (['vaso', 'vasos'].includes(u)) return 'vaso';
    if (['copa', 'copas'].includes(u)) return 'copa';
    
    // Cucharas
    if (['cda', 'cdas', 'cucharada', 'cucharadas'].includes(u)) return 'cda';
    if (['cdta', 'cdtas', 'cdita', 'cditas', 'cucharadita', 'cucharaditas'].includes(u)) return 'cdta';
    
    // Conteo
    if (['unidad', 'unidades', 'pieza', 'piezas'].includes(u)) return 'unidad';
    if (['paquete', 'paquetes'].includes(u)) return 'paquete';
    if (['lata', 'latas'].includes(u)) return 'lata';
    if (['botella', 'botellas'].includes(u)) return 'botella';
    if (['frasco', 'frascos'].includes(u)) return 'frasco';
    if (['rebanada', 'rebanadas', 'lonja', 'lonjas'].includes(u)) return 'rebanada';
    if (['diente', 'dientes'].includes(u)) return 'diente';
    if (['manojo', 'manojos'].includes(u)) return 'manojo';
    if (['tallo', 'tallos'].includes(u)) return 'tallo';
    if (['scoop', 'scoops'].includes(u)) return 'scoop';
    
    // Cartón / Pote
    if (['carton', 'cartones'].includes(u)) return 'carton';
    if (['pote', 'potes', 'tarro', 'tarros'].includes(u)) return 'pote';
    
    return u;
};

const formatQuantity = (num) => {
    if (num === 0) return "";
    if (Number.isInteger(num)) return num.toString();
    const decimal = num - Math.floor(num);
    const whole = Math.floor(num);
    if (Math.abs(decimal - 0.5) < 0.01) return whole > 0 ? `${whole} ½` : "½";
    if (Math.abs(decimal - 0.25) < 0.01) return whole > 0 ? `${whole} ¼` : "¼";
    if (Math.abs(decimal - 0.75) < 0.01) return whole > 0 ? `${whole} ¾` : "¾";
    if (Math.abs(decimal - 0.33) < 0.01) return whole > 0 ? `${whole} ⅓` : "⅓";
    return num.toFixed(1).replace('.0', '');
};

export const generateShoppingListFromPlan = (planData, days = 7) => {
    let allMeals = [];
    let basePlanLength = 1;

    if (planData?.days && Array.isArray(planData.days)) {
        basePlanLength = planData.days.length || 1;
        planData.days.forEach(day => {
            if (day.meals && Array.isArray(day.meals)) {
                allMeals = allMeals.concat(day.meals);
            }
        });
    } else if (planData?.meals || planData?.perfectDay) {
        allMeals = planData.meals || planData.perfectDay;
    }

    if (!allMeals || !Array.isArray(allMeals) || allMeals.length === 0) return [];

    const rawIngredients = allMeals.flatMap(meal => {
        if (meal.ingredients && Array.isArray(meal.ingredients) && meal.ingredients.length > 0) return meal.ingredients;
        return [meal.name];
    });

    const consolidated = {};
    rawIngredients.forEach(raw => {
        if (!raw) return;
        try {
            const parsed = parseIngredient(raw);
            const keyName = normalizeNameForKey(parsed.name);
            const keyUnit = normalizeUnitForKey(parsed.unit);

            const key = `${keyUnit}_${keyName}`;
            if (!consolidated[key]) {
                consolidated[key] = { originalName: parsed.name, unit: parsed.unit, quantity: 0, isAbstract: parsed.isAbstract };
            }
            consolidated[key].quantity += parsed.quantity;
        } catch (error) {
            const keyRaw = normalizeNameForKey(raw.trim());
            const key = `raw_${keyRaw}`;
            if (!consolidated[key]) consolidated[key] = { originalName: raw, quantity: 1, isAbstract: true, unit: '' };
            else consolidated[key].quantity += 1;
        }
    });

    const shoppingList = Object.values(consolidated).map(item => {
        const multiplier = days / basePlanLength;
        let weeklyQuantity = item.quantity * multiplier;
        
        // --- MANEJO DE ABSTRACTOS (Al gusto / Despensa) ---
        if (item.isAbstract) {
            let cleanName = item.originalName.replace(/^[xX]?\d+\s*/, '').trim();
            // Eliminar "al gusto" de forma robusta sin regex de límite de palabra
            cleanName = cleanName.replace(/\s*(al gusto|a gusto)\s*/gi, '').replace(/\s+/g, ' ').trim();
            // Quitar posibles "y" o comas colgadas al final (ej: "hielo, vainilla y")
            cleanName = cleanName.replace(/(\s+y\s*|\s*,\s*)$/i, '').trim();
            
            if (cleanName.length > 0) {
                cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
            }
            return `Al gusto / En despensa: ${cleanName}`;
        }

        let finalQty = weeklyQuantity;
        let finalUnit = item.unit || '';
        let finalName = item.originalName;

        // --- LIMPIEZA PROFUNDA Y EXTREMA DEL STRING ---
        finalName = finalName.replace(/\(.*?\)/g, '');
        finalName = finalName.replace(/\[.*?\]/g, '');
        finalName = finalName.replace(/\b(cocido|cocida|hervido|hervida|asado|asada|guisadas|guisados|escurridas|escurridos|picado|picada|picados|picadas|al horno|en agua|crudo|cruda|fresco|fresca|entero|enteros)\b/gi, '');
        // Eliminar también "al gusto" de los que sí tienen número
        finalName = finalName.replace(/\s*(al gusto|a gusto)\s*/gi, '');
        finalName = finalName.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
        finalName = finalName.replace(/^(de|del|para)\s+/i, '');
        finalName = finalName.replace(/\s+(o|y|con|al)\s*$/i, '');
        finalName = finalName.trim();
        
        const lowerName = finalName.toLowerCase();
        const lowerUnit = finalUnit.toLowerCase();

        // 1. CONDIMENTOS Y ACEITES
        if (/(cda|cdta|cdita|cucharada|cucharadita)/.test(lowerUnit)) {
            if (/(aceite|vinagre|miel|sirope)/.test(lowerName)) {
                finalQty = 1; finalUnit = 'Botella';
            } else if (/(mayonesa|salsa|mantequilla|aderezo|mostaza|ketchup|mermelada)/.test(lowerName)) {
                finalQty = 1; finalUnit = 'Frasco';
            }
        }
        // 2. SUPLEMENTOS
        else if (lowerName.includes('proteína') && /(scoop|cucharada|taza)/.test(lowerUnit)) {
            finalQty = 1; finalUnit = 'Pote/Tarro';
            finalName = 'Proteína en polvo';
        }
        // 3. CLARAS DE HUEVO
        else if (lowerName.includes('clara') && lowerName.includes('huevo')) {
            if (lowerUnit.includes('g') || lowerUnit.includes('ml')) {
                finalQty = Math.ceil(finalQty / 450); 
                finalUnit = finalQty > 1 ? 'Botellas/Cartones' : 'Botella/Cartón';
            } else {
                finalQty = Math.ceil(finalQty);
                finalUnit = finalQty > 1 ? 'Unidades' : 'Unidad';
            }
            finalName = 'Claras de huevo';
        }
        // 4. HUEVOS ENTEROS
        else if (lowerName.includes('huevo')) {
            if (finalQty >= 10) {
                if (finalQty > 18) {
                    finalQty = Math.ceil(finalQty / 30);
                    finalUnit = 'Cartón (30 unidades)';
                } else {
                    finalQty = 1;
                    finalUnit = 'Cartón (12 unidades)';
                }
            } else {
                finalQty = Math.ceil(finalQty);
                finalUnit = finalQty > 1 ? 'Unidades' : 'Unidad';
            }
            finalName = 'Huevos';
        }
        // 5. GUINEOS
        else if (lowerName.includes('guineo') && finalQty >= 4 && (!lowerUnit || lowerUnit.includes('unidad'))) {
            finalQty = Math.ceil(finalQty / 6);
            finalUnit = finalQty > 1 ? 'Manos/Racimos' : 'Mano/Racimo';
        }
        // 6. AGUACATES
        else if (lowerName.includes('aguacate')) {
            if (lowerUnit.includes('g') || lowerUnit.includes('gr')) finalQty = Math.ceil(finalQty / 150);
            else finalQty = Math.ceil(finalQty);
            finalUnit = finalQty > 1 ? 'Unidades' : 'Unidad';
        }
        // 7. PAN
        else if (/(pan|tostada)/.test(lowerName) && /(rebanada|lonja|tapa|unidad)/.test(lowerUnit)) {
            finalQty = Math.ceil(finalQty / 15);
            finalUnit = finalQty > 1 ? 'Paquetes' : 'Paquete';
        }
        // 8. TAZAS -> LIBRAS O LATAS
        else if (lowerUnit.includes('taza') && /(arroz|quinoa|avena)/.test(lowerName)) {
            let lbs = finalQty / 4;
            finalQty = Math.ceil(lbs * 2) / 2;
            if (finalQty < 0.5) finalQty = 0.5;
            finalUnit = 'lb';
        }
        else if (lowerUnit.includes('taza') && /(habichuela|frijol|lenteja|guandul|garbanzo)/.test(lowerName)) {
            finalQty = Math.ceil(finalQty / 1.5); 
            finalUnit = finalQty > 1 ? 'Latas' : 'Lata';
        }
        // 9. TAZAS -> LITROS
        else if (/(leche|jugo|bebida)/.test(lowerName) && (lowerUnit.includes('taza') || lowerUnit.includes('oz'))) {
            let ml = lowerUnit.includes('taza') ? finalQty * 240 : finalQty * 30;
            finalQty = Math.ceil(ml / 1000);
            if (finalQty < 1) finalQty = 1;
            finalUnit = finalQty > 1 ? 'Litros (Cartones)' : 'Litro (Cartón)';
        }
        // 10. UNIDADES FALTANTES
        else if (!finalUnit && finalQty > 0) {
            finalQty = Math.ceil(finalQty); 
            finalUnit = finalQty > 1 ? 'Unidades' : 'Unidad';
        }

        // 11. FALLBACK UNIVERSAL
        if (['g', 'gr', 'gramo', 'gramos'].includes(finalUnit.toLowerCase()) && finalQty >= 100) {
            let lbs = finalQty / 454;
            finalQty = Math.ceil(lbs * 2) / 2; 
            if (finalQty < 0.5) finalQty = 0.5;
            finalUnit = 'lb';
        } else if (['ml', 'mililitro', 'mililitros'].includes(finalUnit.toLowerCase()) && finalQty >= 400) {
            finalQty = Math.ceil(finalQty / 1000);
            if (finalQty < 1) finalQty = 1;
            finalUnit = finalQty > 1 ? 'Litros' : 'Litro';
        } else if (['oz', 'onza', 'onzas'].includes(finalUnit.toLowerCase()) && finalQty > 10) {
            let lbs = finalQty / 16;
            finalQty = Math.ceil(lbs * 2) / 2; 
            if (finalQty < 0.5) finalQty = 0.5;
            finalUnit = 'lb';
        }

        const qtyStr = formatQuantity(finalQty);
        
        // PLURALIZAR UNIDADES
        if (finalQty > 1 && finalUnit) {
            const u = finalUnit.toLowerCase();
            if (['cucharada', 'cucharadita', 'lata', 'botella', 'frasco', 'taza', 'paquete'].includes(u)) {
                finalUnit += 's';
            }
        }

        if (finalName.length > 0) {
            finalName = finalName.charAt(0).toUpperCase() + finalName.slice(1);
        }

        return `${qtyStr} ${finalUnit} ${finalName}`.trim().replace(/\s+/g, ' ');
    });

    // Deduplicar items que produzcan el mismo string final
    // (puede pasar con abstractos como "sal" que vienen de diferentes recetas)
    const uniqueList = [...new Set(shoppingList)];

    return uniqueList.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
};