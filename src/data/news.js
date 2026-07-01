// [P3-NEWS-1 · 2026-07-01] SSOT de Novedades/anuncios de MealfitRD (estilo Anthropic/OpenAI).
//
// CÓMO AÑADIR UNA NOVEDAD: agrega un objeto NUEVO al PRINCIPIO del array `NEWS`
// (más reciente primero — el orden del array es el orden de publicación). Con eso se
// actualiza automáticamente: la sección del landing (NewsHighlight), el índice
// /novedades y su página /novedades/<slug>. No hay que tocar nada más de UI.
//
// Campos por noticia:
//   slug      → identificador en la URL (/novedades/<slug>). Único, kebab-case.
//   date      → ISO (YYYY-MM-DD), solo para referencia/orden.
//   dateLabel → fecha legible es-DO (lo que se muestra).
//   tag       → categoría corta (Producto, Motor, Anuncio, …).
//   title     → titular del anuncio.
//   excerpt   → resumen de 1–2 líneas (landing + índice + meta description).
//   readTime  → opcional, p.ej. "3 min de lectura".
//   href      → OPCIONAL. Ruta INTERNA a la que apunta "Leer el anuncio" en vez de la
//               página genérica /novedades/<slug> (p.ej. '/motor'). Si se define, la
//               página /novedades/<slug> redirige a ese destino (útil cuando el anuncio
//               ya tiene una página propia y rica). Sin href → usa la página del artículo.
//   content   → array de bloques: { h?: string, body?: string[], list?: string[] }.
//               (Se ignora si hay `href`, pero conviene mantenerlo por si se quita el href.)

export const NEWS = [
    {
        slug: 'motor-mealfit-v1',
        date: '2026-07-01',
        dateLabel: '1 de julio, 2026',
        tag: 'Producto',
        title: 'Presentamos el Motor Mealfit v1',
        excerpt: 'Nuestro motor de nutrición de precisión llega a su versión 1.0: generación validada paso a paso, macros que cuadran de verdad y un catálogo dominicano verificado.',
        readTime: '3 min de lectura',
        // El Motor ya tiene su propia página completa → "Leer el anuncio" va ahí.
        href: '/motor',
        content: [
            {
                body: [
                    'Hoy lanzamos oficialmente el Motor Mealfit v1, el corazón que genera cada plan de MealfitRD. No es un simple modelo de inteligencia artificial: es un sistema completo que piensa, calcula y valida cada comida antes de mostrártela.',
                ],
            },
            {
                h: 'Qué es el Motor Mealfit',
                body: [
                    'El Motor Mealfit es la tecnología propietaria detrás de tus planes. Coordina varios pasos —generación, cálculo de macronutrientes, validación y guardas clínicas— para producir tu plan diario, sus recetas y la lista de compras, todo coherente entre sí.',
                    'Usa modelos de IA de última generación como base, pero la inteligencia real está en cómo los orquestamos, los validamos y los personalizamos para la mesa dominicana.',
                ],
            },
            {
                h: 'Qué trae la v1',
                list: [
                    'Generación validada paso a paso: cada plan pasa por controles antes de llegar a ti.',
                    'Macros que cuadran de verdad: calculamos calorías y proteína con fórmulas, no a ojo.',
                    'Catálogo dominicano verificado: alimentos que se consiguen aquí, con precios reales en RD$.',
                    'Guardas clínicas por condición: ajustes para diabetes, enfermedad renal, embarazo, cirugía bariátrica y más.',
                    'Motor de coherencia: la lista de compras siempre concuerda con las recetas.',
                ],
            },
            {
                h: 'Qué significa para ti',
                body: [
                    'Planes más precisos, más realistas y más seguros. Menos sorpresas en la compra, comidas que sí puedes cocinar y macros en los que puedes confiar.',
                ],
            },
            {
                h: 'Esto es solo el comienzo',
                body: [
                    'La v1 es la primera de muchas. Seguiremos midiendo, calibrando y ampliando el motor — y te lo contaremos aquí, en Novedades, cada vez que haya algo nuevo.',
                ],
            },
        ],
    },
];

export const LATEST_NEWS = NEWS[0];

export const getNewsBySlug = (slug) => NEWS.find((n) => n.slug === slug);
