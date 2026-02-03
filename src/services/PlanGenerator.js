// src/services/PlanGenerator.js

// --- BASE DE DATOS LOCAL INTELIGENTE (DOMINICAN MEALS) ---
// Se usa como respaldo si la IA falla tras varios intentos y para el botón de "refrescar plato".

export const DOMINICAN_MEALS = {
    breakfast: [
        { 
            name: "Mangú con Huevo (Porción Ajustada)", 
            tags: ['balanced', 'vegetarian'], 
            desc: "Puré de plátano verde (medido) con huevo hervido o poché y cebollita.",
            recipe: [
                "Hervir 1-2 plátanos verdes en agua con sal.",
                "Majar con un poco del agua de cocción (evitar mantequilla/aceite en exceso).",
                "Hervir o pochar 2 huevos.",
                "Saltear cebolla roja en vinagre y colocar por encima."
            ]
        },
        { 
            name: "Avena Integral con Canela", 
            tags: ['balanced', 'vegetarian'], 
            desc: "Avena cocida con agua o leche descremada, toque de canela y vainilla.",
            recipe: [
                "Hervir 1/2 taza de avena integral en agua con astillas de canela.",
                "Agregar un chorrito de leche descremada o de almendras al final.",
                "Endulzar con stevia y agregar vainilla.",
                "Servir caliente."
            ]
        },
        { 
            name: "Yuca Hervida con Cebollita", 
            tags: ['balanced', 'vegan', 'vegetarian', 'gluten_free'], 
            desc: "Yuca suavecita con aderezo de cebolla roja y vinagre.",
            recipe: [
                "Pelar y hervir la yuca hasta que esté blanda.",
                "Cortar cebolla roja en aros finos y marinar en vinagre y pizca de sal.",
                "Servir la yuca y agregar la cebolla por encima con un hilo de aceite de oliva."
            ]
        },
        { 
            name: "Revuelto de Huevos y Vegetales", 
            tags: ['balanced', 'low_carb', 'keto', 'vegetarian'], 
            desc: "Huevos revueltos con ajíes, cebolla, tomate y espinaca.",
            recipe: [
                "Picar tomate, cebolla, ajíes y espinaca en trozos pequeños.",
                "Sofreír los vegetales en sartén antiadherente con spray de aceite.",
                "Batir 2 huevos y agregarlos al sartén.",
                "Revolver hasta que estén cocidos al gusto."
            ]
        },
        { 
            name: "Omelette de Queso y Jamón", 
            tags: ['low_carb', 'keto'], 
            desc: "Tortilla de huevo rellena de queso bajo en grasa y jamón de pavo.",
            recipe: [
                "Batir 2 huevos con pimienta y sal.",
                "Verter en sartén caliente.",
                "Cuando cuaje, agregar una lonja de queso light y jamón de pavo.",
                "Doblar a la mitad y cocinar 1 minuto más."
            ]
        },
        { 
            name: "Batida Proteica de Guineo", 
            tags: ['balanced', 'vegetarian'], 
            desc: "Batido de proteína (whey o vegetal) con medio guineo.",
            recipe: [
                "En licuadora: 1 scoop de proteína, medio guineo congelado, hielo y agua.",
                "Licuar hasta obtener consistencia cremosa.",
                "Opcional: Agregar canela por encima."
            ]
        }
    ],
    lunch: [
        { 
            name: "La Bandera (Versión Fit)", 
            tags: ['balanced'], 
            desc: "Porción controlada de arroz, habichuelas y pollo guisado sin piel.",
            recipe: [
                "Servir 1 taza medida de arroz blanco o integral.",
                "Acompañar con 1/2 taza de habichuelas guisadas (poca salsa).",
                "Agregar una presa de pollo guisado (retirar la piel antes de comer).",
                "Incluir una porción de ensalada verde."
            ]
        },
        { 
            name: "Locrio de Pollo (Pechuga)", 
            tags: ['balanced'], 
            desc: "Arroz cocinado con pechuga de pollo desmenuzada y vegetales.",
            recipe: [
                "Sofreír pechuga en cubos con sazón natural.",
                "Agregar arroz y agua (proporción 1:1.5).",
                "Cocinar a fuego lento tapado hasta que el grano abra.",
                "Servir acompañado de aguacate."
            ]
        },
        { 
            name: "Berenjenas a la Parmesana", 
            tags: ['low_carb', 'vegetarian'], 
            desc: "Torre de berenjenas con salsa natural y queso gratinado.",
            recipe: [
                "Cortar berenjenas en rodajas y pasarlas por la plancha.",
                "En un pyrex, alternar capas de berenjena, salsa de tomate natural y queso mozzarella.",
                "Hornear 15 min hasta gratinar."
            ]
        },
        { 
            name: "Pechuga a la Plancha + Vegetales", 
            tags: ['low_carb', 'keto'], 
            desc: "Pechuga sazonada al orégano con brócoli y zanahoria al vapor.",
            recipe: [
                "Adobar pechuga con limón, orégano, ajo y sal.",
                "Cocinar en plancha bien caliente hasta dorar.",
                "Hervir brócoli y zanahoria por 4-5 minutos (que queden crujientes)."
            ]
        },
        { 
            name: "Moro de Guandules con Pescado", 
            tags: ['balanced'], 
            desc: "Moro clásico (porción medida) con filete de pescado en salsa de coco ligera.",
            recipe: [
                "Preparar moro de guandules con poco aceite.",
                "En sartén aparte, cocinar filete de pescado con pimientos y un chorrito de leche de coco light.",
                "Servir porción moderada de moro y abundante pescado."
            ]
        },
        { 
            name: "Sancocho Light", 
            tags: ['balanced'], 
            desc: "Sancocho con más auyama y carnes magras, reduciendo los víveres pesados.",
            recipe: [
                "Usar pechuga de pollo y carne de res magra.",
                "Usar mucha auyama para espesar el caldo naturalmente.",
                "Reducir cantidad de plátano y yuca.",
                "Agregar maíz en trozos pequeños."
            ]
        }
    ],
    dinner: [
        { 
            name: "Picadera: Queso y Casabe", 
            tags: ['balanced', 'vegetarian'], 
            desc: "Laminas de queso blanco a la plancha con trozos de casabe tostado.",
            recipe: [
                "Cortar queso de hoja o blanco de freír.",
                "Dorar en sartén antiadherente (sin aceite extra).",
                "Tostar casabe en el horno o tostadora.",
                "Servir caliente."
            ]
        },
        { 
            name: "Pescado al Papillote", 
            tags: ['low_carb', 'keto', 'balanced'], 
            desc: "Filete de pescado cocido en su jugo con vegetales variados.",
            recipe: [
                "Colocar filete de pescado sobre papel aluminio.",
                "Cubrir con rodajas de tomate, cebolla, ajíes y calabacín.",
                "Cerrar el paquete herméticamente.",
                "Cocinar en sartén tapado o airfryer por 12-15 min."
            ]
        },
        { 
            name: "Tortilla de Espinacas", 
            tags: ['low_carb', 'keto', 'vegetarian'], 
            desc: "Cena ligera de huevo y espinacas.",
            recipe: [
                "Saltear un puñado grande de espinacas hasta reducir.",
                "Batir 2 huevos y verter sobre las espinacas.",
                "Cocinar a fuego lento hasta cuajar.",
                "Doblar y servir."
            ]
        },
        { 
            name: "Guineítos con Queso", 
            tags: ['balanced', 'vegetarian'], 
            desc: "Guineos verdes hervidos con una lonja de queso blanco.",
            recipe: [
                "Hervir 2-3 guineos verdes en agua con sal.",
                "Servir con una porción de queso blanco fresco o a la plancha.",
                "Agregar un hilo de aceite de oliva (opcional)."
            ]
        },
        { 
            name: "Crema de Auyama", 
            tags: ['balanced', 'vegan', 'vegetarian'], 
            desc: "Crema espesa de auyama sin lácteos (o leche descremada).",
            recipe: [
                "Hervir auyama con ajo, cebolla y cilantro.",
                "Licuar con un poco del agua de cocción y una cucharada de queso crema light (opcional).",
                "Servir con semillas de auyama tostadas."
            ]
        },
        { 
            name: "Ensalada de Atún", 
            tags: ['low_carb', 'keto'], 
            desc: "Atún en agua con vegetales mixtos y limón.",
            recipe: [
                "Escurrir una lata de atún en agua.",
                "Mezclar con maíz, tomate picado, lechuga y pepino.",
                "Aderezar con mucho limón, sal y pimienta."
            ]
        }
    ],
    snack: [
        { 
            name: "Guineo Maduro", 
            tags: ['balanced', 'vegan', 'vegetarian'], 
            desc: "Una unidad mediana.",
            recipe: ["Pelar y comer. La naturaleza lo hizo listo."] 
        },
        { 
            name: "Yogur Griego con Chinola", 
            tags: ['low_carb', 'vegetarian'], 
            desc: "Alto en proteína, con un toque de fruta natural.",
            recipe: [
                "Servir 1 taza de yogur griego natural (sin azúcar).",
                "Verter la pulpa de media chinola encima.",
                "Mezclar y disfrutar."
            ]
        },
        { 
            name: "Puñado de Nueces Mixtas", 
            tags: ['low_carb', 'keto', 'vegan'], 
            desc: "Grasas saludables para saciedad.",
            recipe: ["Servir un puñado (lo que quepa en tu mano cerrada) de almendras o nueces."] 
        },
        { 
            name: "Huevo Hervido", 
            tags: ['low_carb', 'keto', 'vegetarian'], 
            desc: "Protein snack rápido.",
            recipe: ["Hervir huevo por 10 minutos. Pelar y agregar pizca de sal."] 
        },
        { 
            name: "Casabe Tostado", 
            tags: ['balanced', 'vegan'], 
            desc: "Fuente de carbohidrato crujiente y ligera.",
            recipe: ["Tostar torta de casabe en horno o airfryer hasta que esté bien crujiente."] 
        },
        { 
            name: "Manzana Verde", 
            tags: ['balanced', 'vegan'], 
            desc: "Fibra y pocas calorías.",
            recipe: ["Lavar bien y comer con cáscara para aprovechar la fibra."] 
        }
    ]
};

// --- LOGICA DE RESPALDO (FALLBACK) ---
// Se activa si la IA (n8n) falla tras todos los intentos
const generateFallbackPlan = (formData = {}) => {
    const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const skipLunch = formData.skipLunch;

    const baseMeals = [
        { meal: "Desayuno", time: "8:00 AM", ...getRandom(DOMINICAN_MEALS.breakfast), cals: 450 },
        { meal: "Merienda", time: "4:00 PM", ...getRandom(DOMINICAN_MEALS.snack), cals: 200 },
        { meal: "Cena", time: "8:00 PM", ...getRandom(DOMINICAN_MEALS.dinner), cals: 450 }
    ];

    if (!skipLunch) {
        baseMeals.splice(1, 0, { meal: "Almuerzo", time: "1:00 PM", ...getRandom(DOMINICAN_MEALS.lunch), cals: 600 });
    }

    return {
        calories: skipLunch ? 1500 : 2000,
        macros: {
            protein: skipLunch ? "110g" : "150g",
            carbs: skipLunch ? "150g" : "200g",
            fats: skipLunch ? "45g" : "60g"
        },
        insights: [
            "⚠️ MODO OFFLINE: El servidor de IA está saturado.",
            "Este es un plan generado localmente para que no pierdas el ritmo.",
            skipLunch ? "ℹ️ Has seleccionado omitir el almuerzo." : "Intenta más tarde para usar la IA completa.",
            "Visualiza tus metas y mantén la constancia."
        ],
        perfectDay: baseMeals,
        shoppingList: {
            daily: ["Plátanos", "Huevos", "Pollo", "Vegetales Variados", "Frutas de temporada", "Avena"].concat(skipLunch ? [] : ["Arroz", "Habichuelas"])
        }
    };
};

// --- FUNCIÓN HELPER: RETRY LOGIC (Inteligencia de Reintentos) ---
// Intenta hacer el fetch X veces si recibe errores de servidor o timeout
async function fetchWithRetry(url, options, retries = 3, backoff = 2000) {
    try {
        const response = await fetch(url, options);
        
        // Si el servidor da error 502, 503, 504 (Gateway Timeout), lanzamos error para forzar el reintento
        if (response.status >= 500) {
            throw new Error(`Server Error ${response.status}`);
        }
        
        // Si no es un error de servidor pero tampoco es OK (ej: 404, 400), lo manejamos aquí
        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Error ${response.status}: ${txt}`);
        }
        
        return response; // Éxito
    } catch (err) {
        if (retries > 1) {
            console.warn(`⚠️ Intento fallido. Reintentando en ${backoff/1000}s... (${retries-1} intentos restantes)`);
            // Esperar (Backoff)
            await new Promise(r => setTimeout(r, backoff));
            // Llamada recursiva con menos intentos y más tiempo de espera
            return fetchWithRetry(url, options, retries - 1, backoff * 1.5); 
        } else {
            throw err; // Se acabaron los intentos, lanzamos el error final
        }
    }
}

// --- FUNCIÓN PRINCIPAL (CONEXIÓN CON IA) ---
export const generateAIPlan = async (formData) => {
    // CORRECCIÓN: Apuntamos directamente a tu webhook de n8n de producción
    const API_URL = import.meta.env.VITE_API_URL || 'https://agente-de-citas-dental-space-n8n.ofcrls.easypanel.host/webhook/analyze';
    
    console.log("🚀 Iniciando generación con Reintentos Automáticos...");
    console.log("📡 Conectando con:", API_URL);

    // Timeout general de seguridad extendido (2.5 minutos) para permitir que ocurran los 3 reintentos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 150000); 

    try {
        // Usamos nuestra función de reintento en lugar de fetch directo
        const response = await fetchWithRetry(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
            signal: controller.signal
        }, 3); // 3 Intentos máximos
        
        clearTimeout(timeoutId);

        const data = await response.json();
        
        console.log("✅ Respuesta IA recibida tras intentos.");
        
        // n8n a veces devuelve un array [{...}], extraemos el primer objeto si es necesario
        if (Array.isArray(data) && data.length > 0) return data[0];
        
        return data;

    } catch (error) {
        // Manejo final de errores
        if (error.name === 'AbortError') {
            console.error("⏳ Error Fatal: Timeout total excedido.");
        } else {
            console.error("❌ Fallaron todos los intentos de conexión:", error);
        }
        
        console.warn("⚠️ Activando Plan de Respaldo (Modo Offline)...");
        // Retornamos el plan local para que el usuario siempre vea algo
        return generateFallbackPlan(formData);
    }
};

// --- LOGICA DE REEMPLAZO (DASHBOARD) ---
// Se usa cuando el usuario hace clic en el botón de "refrescar" un plato específico
export const getAlternativeMeal = (mealType, currentMealName, targetCalories, userDietType) => {
    // 1. Identificar categoría
    let category = 'snack';
    const lowerType = mealType.toLowerCase();
    
    if (lowerType.includes('desayuno')) category = 'breakfast';
    else if (lowerType.includes('almuerzo')) category = 'lunch';
    else if (lowerType.includes('cena')) category = 'dinner';

    // 2. Normalizar tipo de dieta
    let dietFilter = 'balanced';
    if (userDietType) {
        const type = userDietType.toLowerCase();
        if (type.includes('keto')) dietFilter = 'keto';
        else if (type.includes('low')) dietFilter = 'low_carb';
        else if (type.includes('veg') && !type.includes('vegetariana')) dietFilter = 'vegan';
        else if (type.includes('vegetariana')) dietFilter = 'vegetarian';
    }

    // 3. Obtener opciones base
    const options = DOMINICAN_MEALS[category] || DOMINICAN_MEALS.breakfast;

    // 4. Filtrar opciones compatibles
    let compatibleOptions = options.filter(meal => {
        if (dietFilter === 'balanced') return true;
        return meal.tags.includes(dietFilter); 
    });

    if (compatibleOptions.length === 0) {
        compatibleOptions = options.filter(m => m.tags.includes('balanced') || m.tags.includes('vegetarian'));
        if (compatibleOptions.length === 0) compatibleOptions = options;
    }

    // 5. Filtrar para no repetir el actual
    const availableOptions = compatibleOptions.filter(m => m.name !== currentMealName);
    
    const selectedTemplate = availableOptions.length > 0 
        ? availableOptions[Math.floor(Math.random() * availableOptions.length)]
        : options[0];

    // 6. Retorno con RECETA INCLUIDA
    return {
        name: selectedTemplate.name,
        desc: selectedTemplate.desc,
        cals: targetCalories || selectedTemplate.cals || 400,
        recipe: selectedTemplate.recipe, 
        isSwapped: true
    };
};