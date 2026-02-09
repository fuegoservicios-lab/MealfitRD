// src/services/shoppingGenerator.js

/**
 * Genera una lista de compras consolidada basada en el plan de comidas.
 * Extrae los ingredientes de cada plato, los unifica y elimina duplicados.
 * 
 * @param {Object} planData - El objeto JSON completo devuelto por la IA
 * @returns {Array<string>} - Lista de ingredientes limpia y ordenada
 */
/**
 * Parsea un string de ingrediente para separar cantidad, unidad y nombre.
 * Ej: "1/2 taza de avena" -> { quantity: 0.5, unit: "taza", name: "de avena", original: ... }
 */
const parseIngredient = (ingredientString) => {
    // Normalizar
    const clean = ingredientString.trim();

    // Regex para fracciones (ej: "1/2", "1 1/2", "3/4")
    const fractionRegex = /^(\d+)\s+(\d+)\/(\d+)\s+(.*)$|^(\d+)\/(\d+)\s+(.*)$/;
    // Regex para decimales o enteros (ej: "1.5", "2", "200")
    const decimalRegex = /^(\d*[.,]?\d+)\s*(.*)$/;

    let quantity = 0;
    let rest = clean;

    const fractionMatch = clean.match(fractionRegex);
    if (fractionMatch) {
        if (fractionMatch[1]) { // Mixed fraction: "1 1/2"
            quantity = parseInt(fractionMatch[1]) + (parseInt(fractionMatch[2]) / parseInt(fractionMatch[3]));
            rest = fractionMatch[4];
        } else { // Simple fraction: "1/2"
            quantity = parseInt(fractionMatch[5]) / parseInt(fractionMatch[6]);
            rest = fractionMatch[7];
        }
    } else {
        const decimalMatch = clean.match(decimalRegex);
        if (decimalMatch) {
            quantity = parseFloat(decimalMatch[1].replace(',', '.'));
            rest = decimalMatch[2];
        } else {
            // No quantity found found, assume 1 unit if appropriate or leave as 0 (e.g. "Sal al gusto")
            // For shopping list safety, treat "Sal" as 1 unit of purchase interaction
            return { quantity: 1, unit: '', name: clean, isAbstract: true };
        }
    }

    // Separar unidad y nombre (heurística simple)
    // Lista de unidades comunes y sus variantes
    const units = [
        'taza', 'tazas', 'cda', 'cdas', 'cdta', 'cdtas',
        'g', 'gr', 'gramos', 'gramo', 'kg', 'kilos', 'kilo', 'kilogramo', 'kilogramos',
        'lb', 'lbs', 'libra', 'libras', 'oz', 'onza', 'onzas',
        'ml', 'millilitros', 'litro', 'litros',
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
 * Formatea la cantidad para mostrarla amigablemente (ej: 0.5 -> 1/2)
 */
const formatQuantity = (num) => {
    if (num === 0) return "";
    if (Number.isInteger(num)) return num.toString();

    // Common fractions
    const decimal = num - Math.floor(num);
    const whole = Math.floor(num);

    // Tolerance for float errors
    if (Math.abs(decimal - 0.5) < 0.01) return whole > 0 ? `${whole} ½` : "½";
    if (Math.abs(decimal - 0.25) < 0.01) return whole > 0 ? `${whole} ¼` : "¼";
    if (Math.abs(decimal - 0.75) < 0.01) return whole > 0 ? `${whole} ¾` : "¾";
    if (Math.abs(decimal - 0.33) < 0.01) return whole > 0 ? `${whole} ⅓` : "⅓";

    return num.toFixed(1).replace('.0', '');
};

export const generateShoppingListFromPlan = (planData, days = 7) => {
    if (!planData || !planData.perfectDay || !Array.isArray(planData.perfectDay)) {
        return [];
    }

    // 1. Extraer todos los ingredientes
    const rawIngredients = planData.perfectDay.flatMap(meal => {
        if (meal.ingredients && Array.isArray(meal.ingredients) && meal.ingredients.length > 0) {
            return meal.ingredients;
        }
        return [meal.name];
    });

    // 2. Consolidar ingredientes
    const consolidated = {};

    rawIngredients.forEach(raw => {
        if (!raw) return;

        try {
            const parsed = parseIngredient(raw);

            // Normalizar nombre para agrupar (ej: "Huevo" == "huevos")
            // Quitamos 'de ', 'para ', parentesis, etc para mejor grouping
            let keyName = parsed.name.toLowerCase()
                .replace(/^(de |del |para )/, '')
                .replace(/\(.*\)/, '') // quitamos aclaraciones entre parentesis para agrupar
                .trim();

            // Singularizar (muy básico)
            if (keyName.endsWith('s') && !keyName.endsWith('ss')) keyName = keyName.slice(0, -1);
            if (keyName.endsWith('es')) keyName = keyName.slice(0, -2); // tomates -> tomat

            // Normalizar unidad para la clave (ej: "g" == "gr" == "gramos")
            let keyUnit = parsed.unit.toLowerCase();
            if (['g', 'gr', 'gramo', 'gramos'].includes(keyUnit)) keyUnit = 'g';
            if (['ml', 'mililitro', 'mililitros'].includes(keyUnit)) keyUnit = 'ml';
            if (['kg', 'kilo', 'kilos'].includes(keyUnit)) keyUnit = 'kg';
            if (['lb', 'libra', 'libras'].includes(keyUnit)) keyUnit = 'lb';
            if (['oz', 'onza', 'onzas'].includes(keyUnit)) keyUnit = 'oz';
            if (['lt', 'l', 'litro', 'litros'].includes(keyUnit)) keyUnit = 'l';

            const key = `${keyUnit}_${keyName}`;

            if (!consolidated[key]) {
                consolidated[key] = {
                    originalName: parsed.name, // Usamos el nombre original sin prefijos para mostrar
                    unit: parsed.unit, // Guardamos la unidad original para mostrar, aunque la clave esté normalizada
                    quantity: 0,
                    isAbstract: parsed.isAbstract
                };
            }

            // Sumamos la cantidad diaria
            consolidated[key].quantity += parsed.quantity;

        } catch (e) {
            // Fallback
            const key = `raw_${raw.trim().toLowerCase()}`;
            if (!consolidated[key]) {
                consolidated[key] = { originalName: raw, quantity: 1, isAbstract: true, unit: '' };
            } else {
                consolidated[key].quantity += 1;
            }
        }
    });

    // 3. Generar lista final escalada
    const shoppingList = Object.values(consolidated).map(item => {
        // Multiplicar por el número de días
        let weeklyQuantity = item.quantity * days;
        let unitDisplay = item.unit;

        if (item.isAbstract) {
            const incontables = ['sal', 'pimienta', 'aceite', 'vinagre', 'agua'];
            if (incontables.some(i => item.originalName.toLowerCase().includes(i))) {
                return item.originalName;
            }
            return `x${Math.ceil(weeklyQuantity)} ${item.originalName}`;
        }

        // LÓGICA DE CONVERSIÓN INTELIGENTE

        // 0. Mapeo de Cucharadas a Envases (Smart Containers)
        // Si tienes > 4 cucharadas de algo que viene en bote, mejor compra el bote.
        const CONTAINER_MAPPINGS = {
            'mantequilla de maní': 'Frasco',
            'mantequilla de cacahuete': 'Frasco',
            'salsa de soya': 'Botella',
            'salsa de soja': 'Botella',
            'aceite': 'Botella',
            'vinagre': 'Botella',
            'vainilla': 'Frasco',
            'mermelada': 'Frasco',
            'mayonesa': 'Frasco',
            'ketchup': 'Botella',
            'mostaza': 'Botella',
            'miel': 'Botella'
        };

        if (['cda', 'cdas', 'cdta', 'cdtas'].includes(unitDisplay.toLowerCase())) {
            const lowerName = item.originalName.toLowerCase();
            // Buscar si alguna key del mapping está contenida en el nombre
            const foundKey = Object.keys(CONTAINER_MAPPINGS).find(k => lowerName.includes(k));

            if (foundKey) {
                // Si hay una cantidad considerable (ej: 4 cucharadas en toda la semana), sugerimos comprar el envase
                if (weeklyQuantity >= 4) {
                    weeklyQuantity = 1;
                    unitDisplay = CONTAINER_MAPPINGS[foundKey];
                }
            }
        }

        // 1. Gramos a Libras (Si es >= 1 libra aprox 454g)
        if (['g', 'gr', 'gramo', 'gramos'].includes(unitDisplay.toLowerCase())) {
            if (weeklyQuantity >= 454) {
                weeklyQuantity = weeklyQuantity / 453.592;
                unitDisplay = 'lb';
            }
        }
        // 2. Mililitros a Litros (Si es >= 1000ml)
        if (['ml', 'mililitro', 'mililitros'].includes(unitDisplay.toLowerCase())) {
            if (weeklyQuantity >= 1000) {
                weeklyQuantity = weeklyQuantity / 1000;
                unitDisplay = 'L'; // Litros
            }
        }

        const qtyStr = formatQuantity(weeklyQuantity);

        // Invariantes (abreviaciones que no cambian en plural)
        const invariants = ['g', 'gr', 'kg', 'ml', 'cm', 'm', 'l', 'lt'];

        if (weeklyQuantity > 1 && unitDisplay && !invariants.includes(unitDisplay.toLowerCase())) {
            // Excepción específica para 'lb' -> 'lbs'
            if (unitDisplay === 'lb') {
                unitDisplay = 'lbs';
            }
            // Si ya termina en 's', no hacemos nada (ej: "latas")
            else if (unitDisplay.endsWith('s')) {
                // no-op
            } else {
                // Reglas generales
                if (/[aeiou]$/.test(unitDisplay)) {
                    unitDisplay += 's';
                } else {
                    unitDisplay += 'es';
                }
            }
        }

        return `${qtyStr} ${unitDisplay} ${item.originalName}`.trim();
    });

    return shoppingList.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
};