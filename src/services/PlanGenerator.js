const DOMINICAN_MEALS = {
    breakfast: [
        { name: "Mangú con Huevo (Hervido/Poché)", cals: 450 },
        { name: "Avena Caliente con Canela", cals: 350 },
        { name: "Yuca Hervida con Cebollita", cals: 480 },
        { name: "Tostadas de Pan de Agua", cals: 380 }
    ],
    lunch: [
        { name: "La Bandera: Arroz, Habichuelas, Pollo", cals: 650 },
        { name: "Locrio de Pollo y Ensalada", cals: 600 },
        { name: "Moro de Guandules con Pescado", cals: 580 },
        { name: "Sancocho Light", cals: 550 }
    ],
    dinner: [
        { name: "Picadera: Queso y Casabe", cals: 350 },
        { name: "Ensalada César con Pollo", cals: 380 },
        { name: "Pescado al Vapor", cals: 350 },
        { name: "Tortilla de Espinacas", cals: 300 }
    ],
    snack: [
        { name: "Guineo Maduro", cals: 105 },
        { name: "Yogur con Chinola", cals: 150 },
        { name: "Nueces Mixtas", cals: 180 },
        { name: "Casabe Tostado", cals: 200 }
    ]
};

// Lógica de respaldo por si falla la conexión con n8n
// CORRECCIÓN: Eliminamos el parámetro 'formData' porque no se usaba dentro
const generateFallbackPlan = () => {
    const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    return {
        calories: 2000,
        macros: {
            protein: "150g",
            carbs: "200g",
            fats: "60g"
        },
        insights: [
            "⚠️ MODO OFFLINE: No se pudo conectar con el servidor de IA (n8n).",
            "Verifica tu conexión a internet o la URL del Webhook.",
            "Este es un plan generado de ejemplo.",
            "Visualiza tus metas y mantén la constancia."
        ],
        perfectDay: [
            { meal: "Desayuno", time: "8:00 AM", ...getRandom(DOMINICAN_MEALS.breakfast) },
            { meal: "Almuerzo", time: "1:00 PM", ...getRandom(DOMINICAN_MEALS.lunch) },
            { meal: "Merienda", time: "4:00 PM", ...getRandom(DOMINICAN_MEALS.snack) },
            { meal: "Cena", time: "8:00 PM", ...getRandom(DOMINICAN_MEALS.dinner) }
        ],
        shoppingList: {
            daily: ["Plátanos", "Huevos", "Arroz", "Pollo"]
        }
    };
};

export const generateAIPlan = async (formData) => {
    try {
        // Obtenemos la URL desde el archivo .env
        // Si no existe, usamos localhost por defecto como respaldo
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/analyze';

        console.log("🚀 Conectando al cerebro IA en:", API_URL);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        });

        if (!response.ok) {
            throw new Error(`Error del servidor: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // n8n a veces devuelve el body dentro de un array. Si es así, extraemos el primer elemento.
        if (Array.isArray(data) && data.length > 0) {
             return data[0]; 
        }

        return data;

    } catch (error) {
        console.warn("❌ Error conectando a la API (Usando Fallback):", error);
        // Llamamos al fallback sin argumentos, ya que no los necesita
        return generateFallbackPlan();
    }
};