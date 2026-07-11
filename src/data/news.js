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
//   art       → OPCIONAL. [c1, c2, c3] — tres colores hex del arte abstracto del
//               thumbnail (estilo OpenAI news: campos de color difuminados). Sin
//               art → NewsHighlight usa una paleta cíclica por índice.
//   href      → OPCIONAL. Ruta INTERNA a la que apunta "Leer el anuncio" en vez de la
//               página genérica /novedades/<slug> (p.ej. '/motor'). Si se define, la
//               página /novedades/<slug> redirige a ese destino (útil cuando el anuncio
//               ya tiene una página propia y rica). Sin href → usa la página del artículo.
//   content   → array de bloques: { h?: string, body?: string[], list?: string[] }.
//               (Se ignora si hay `href`, pero conviene mantenerlo por si se quita el href.)

export const NEWS = [
    {
        slug: 'base-datos-supermercados-rd',
        date: '2026-07-02',
        dateLabel: '2 de julio, 2026',
        tag: 'Datos',
        title: 'Una base de datos de supermercados hecha para RD',
        excerpt: 'Casi 2,000 productos reales de supermercados dominicanos, conectados a más de 200 alimentos verificados de nuestro catálogo. Ya puedes explorarla en Supermercados RD.',
        readTime: '2 min de lectura',
        badge: '≈2K',
        art: ['#34D399', '#38BDF8', '#6366F1'],
        content: [
            {
                body: [
                    'Acabamos de encender una pieza clave de MealfitRD: una base de datos propia con casi 2,000 productos reales de supermercados dominicanos, conectada a los más de 200 alimentos verificados que usa el motor para generar tus planes.',
                ],
            },
            {
                h: 'Qué contiene',
                list: [
                    'Casi 2,000 presentaciones comprables: marcas, tamaños y empaques tal como aparecen en la góndola.',
                    'Más de 200 alimentos verificados como base: cada producto se conecta a un alimento que el motor ya conoce, con macros, micronutrientes y precios en RD$.',
                    'Decenas de familias de alimentos: arroz, carnes, yogures, granos, vegetales, enlatados y más.',
                    'Curaduría manual: cada producto fue revisado a mano — nombres honestos, empaques reales y sin listados duplicados.',
                ],
            },
            {
                h: 'Por qué importa',
                body: [
                    'Un plan solo sirve si la compra existe. Con esta base, MealfitRD deja de hablar de "pollo" en abstracto y empieza a conocer las presentaciones reales que encuentras en el supermercado: qué marcas hay, en qué tamaños vienen y cómo se llaman de verdad.',
                    'Es también el primer paso para que tu lista de compras te deje elegir marca y presentación — el yogurt, el arroz o la carne exacta que prefieres — con el plan ajustándose a tu elección.',
                ],
            },
            {
                h: 'Explórala hoy',
                body: [
                    'La base completa ya es navegable en la sección Supermercados RD, disponible desde el pie de página de mealfitrd.com. Búscala por familia de alimento y mira las presentaciones disponibles.',
                    'Seguiremos ampliándola: más productos, más supermercados y, pronto, su conexión directa con tu lista de compras.',
                ],
            },
        ],
    },
    {
        slug: 'motor-mealfit-v1',
        date: '2026-07-01',
        dateLabel: '1 de julio, 2026',
        tag: 'Producto',
        title: 'Presentamos el Motor Mealfit',
        excerpt: 'Nuestro motor de nutrición de precisión llega a su versión 1.0: generación validada paso a paso, macros que cuadran de verdad y un catálogo dominicano verificado.',
        readTime: '3 min de lectura',
        // badge → texto grande del "cover" de la tarjeta destacada (opcional).
        badge: 'v1.0',
        art: ['#6366F1', '#A78BFA', '#FB7185'],
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
