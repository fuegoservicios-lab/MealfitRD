// [P2-LANDING-PRERENDER-META · 2026-08-14] SSOT del `<head>` por ruta.
//
// POR QUÉ SALE DE `RouteTitle.jsx`. Estas tablas vivían dentro del componente que
// las aplica en el cliente, y ahora las necesitan DOS consumidores: ese
// componente (navegación SPA) y `scripts/build-route-meta.mjs`, que estampa el
// mismo texto en un HTML por ruta durante el build. Dejarlas donde estaban
// obligaba al script a parsear un `.jsx` con expresiones interpoladas — o, peor,
// a mantener una segunda copia del copy, que es la clase de duplicación que este
// repo lleva todo el día cerrando.
//
// El fichero es JS plano a propósito: lo importa Node durante el build, así que
// no puede contener JSX ni tocar el DOM.
//
// ⚠️ LOS TÍTULOS DE LAS PÁGINAS «SELF-MANAGED» TAMBIÉN VIVEN AQUÍ AHORA.
// `/motor`, `/como-funciona`, `/funciones`, `/precision` y `/research` fijan su
// `document.title` con un `useEffect` propio, así que hasta hoy su título no
// existía en ninguna tabla: era imposible estamparlo en el HTML servido. Se
// conserva el `useEffect` de cada página (es quien lo repone al navegar), pero
// el texto es el mismo objeto — si divergen, un guard lo canta.
// La extensión `.js` es OBLIGATORIA aquí: este módulo lo importa Node durante el
// build (`scripts/build-route-meta.mjs`), y el resolver de ESM no adivina
// extensiones como sí hace Vite. Sin ella el script muere con ERR_MODULE_NOT_FOUND
// y el prerender no se genera — en un `postbuild`, eso rompe el despliegue.
import { MICROS_TRACKED, VERIFIED_FOODS_LABEL } from './systemFacts.js';

export const BRAND = 'Bioboros';

// [I18N-EXEMPT: metadato SEO del HTML servido; mismo motivo que TITLES]
export const HOME_DESC = 'Planes de alimentación 100% personalizados con IA avanzada. Adaptados a tus gustos, presupuesto y estilo de vida. Comienza gratis.';

// [I18N-EXEMPT: metadatos SEO que Node estampa en el HTML servido, ANTES de que exista un locale]
export const TITLES = {
    '/': 'Bioboros | Nutrición Personalizada con IA',
    '/login': `Iniciar sesión · ${BRAND}`,
    '/reset-password': `Restablecer contraseña · ${BRAND}`,
    '/assessment': `Crear mi plan · ${BRAND}`,
    '/plan': `Diseñando tu plan · ${BRAND}`,
    '/dashboard': `Mi plan · ${BRAND}`,
    '/dashboard/pantry': `Mi nevera · ${BRAND}`,
    '/dashboard/recipes': `Recetas · ${BRAND}`,
    '/dashboard/agent': `Asistente · ${BRAND}`,
    '/dashboard/settings': `Ajustes · ${BRAND}`,
    '/dashboard/upgrade': `Planes · ${BRAND}`,
    '/history': `Historial · ${BRAND}`,
    '/precios': `Planes y Precios · ${BRAND}`,
    '/privacy': `Política de Privacidad · ${BRAND}`,
    '/terms': `Términos de Servicio · ${BRAND}`,
    '/medical': `Aviso Médico · ${BRAND}`,
    '/data-protection': `Protección de Datos · ${BRAND}`,
    '/ai-policy': `Uso de Inteligencia Artificial · ${BRAND}`,
    '/refunds': `Reembolsos y Cancelaciones · ${BRAND}`,
    '/acceptable-use': `Política de Uso · ${BRAND}`,
    '/about': `Acerca de ${BRAND} — nutrición de precisión con IA`,
    '/responsible-disclosure': `Divulgación Responsable · ${BRAND}`,
    '/novedades': `Novedades · ${BRAND}`,
    '/supermercado': `Supermercados RD · ${BRAND}`,
    // Las cinco «self-managed»: cada página repone este mismo texto al montar.
    '/motor': 'Presentamos a Bioboros v1 — el motor de Bioboros',
    '/como-funciona': 'Cómo funciona Bioboros — el método, paso a paso',
    '/funciones': 'Funciones de Bioboros — todo lo que hace la app',
    '/precision': 'Precisión de Bioboros — la metodología que medimos',
    '/research': 'Investigación en Bioboros — mejoramos sin exponerte',
};

// Description por ruta para el snippet de buscadores. ≤ ~160 chars, es-DO,
// adaptada al contenido real de cada página. Rutas sin entry → HOME_DESC.
// [I18N-EXEMPT: metadato SEO del HTML servido; mismo motivo que TITLES]
export const DESCRIPTIONS = {
    '/': HOME_DESC,
    '/login': 'Inicia sesión en Bioboros para acceder a tu plan nutricional personalizado con IA, tu lista de compras y tu coach.',
    '/assessment': 'Crea tu plan nutricional personalizado con IA en minutos. Adaptado a tus gustos, presupuesto y condición. Gratis para empezar, sin tarjeta.',
    // [P3-BETA-COPY-TRUTH · 2026-08-22] Decía «Precios reales en RD$» y los tres planes se cobran
    // en USD vía PayPal (SSOT: config/plans.js). Falso desde antes del flip y para cualquier
    // visitante, dominicano incluido — y aparece en el snippet de buscadores, o sea justo donde
    // alguien decide si hace clic. Ojo al corregir por grep: el RD$ de `/supermercado` sí es
    // cierto (es el súper dominicano) y tocarlo empeoraría un texto correcto.
    '/precios': 'Planes y precios de Bioboros: empieza gratis o sube a Básico, Plus o Ultra. Precios en USD, sin tarjeta para comenzar.',
    '/funciones': 'Todo lo que hace Bioboros: plan diario calibrado, recetas paso a paso, lista de compras costeada en RD$, coach IA 24/7 y nevera inteligente.',
    '/como-funciona': 'El método de Bioboros paso a paso: de tu perfil clínico-metabólico al plato, con validación nutricional determinista en cada etapa.',
    '/precision': `La precisión que medimos en Bioboros: banda de macros, piso de proteína, ${MICROS_TRACKED} micronutrientes vs DRI y guardas clínicas por condición.`,
    '/motor': 'El motor de Bioboros por dentro: orquestación por grafos, validación nutricional y un catálogo verificado de alimentos dominicanos.',
    '/privacy': 'Política de Privacidad de Bioboros: qué datos recopilamos, cómo los ciframos y protegemos, qué cookies usamos, con quién los compartimos y tus derechos.',
    '/terms': 'Términos de Servicio de Bioboros: planes, suscripciones y pagos, uso aceptable, propiedad intelectual y limitación de responsabilidad.',
    '/medical': 'Aviso Médico de Bioboros: nuestras recomendaciones nutricionales son informativas y no sustituyen el consejo de un profesional de la salud.',
    '/data-protection': 'Protección de datos en Bioboros bajo la Ley 172-13: tus derechos de acceso, rectificación, cancelación y oposición, y cómo ejercerlos.',
    '/ai-policy': 'Cómo usa Bioboros la inteligencia artificial: qué datos viajan al proveedor, límites del modelo, supervisión humana y que no entrenamos con tus datos.',
    '/research': 'Política de Investigación de Bioboros: cómo usamos datos anonimizados para mejorar el producto, con exención de datos sensibles de salud y opt-out.',
    '/refunds': 'Reembolsos y cancelaciones de Bioboros: prueba gratis y cancela cuando quieras; las suscripciones no son reembolsables salvo donde la ley lo exija. Conforme a la Ley 358-05.',
    '/acceptable-use': 'Política de Uso de Bioboros: reglas para un uso responsable, conductas prohibidas, uso justo de la IA y consecuencias del incumplimiento.',
    '/about': 'Acerca de Bioboros: nutrición de precisión con IA para la mesa dominicana. Nuestra misión, cómo funciona el motor y los principios que nos guían.',
    '/responsible-disclosure': 'Política de Divulgación Responsable de Bioboros: cómo reportar vulnerabilidades de seguridad, nuestro compromiso de puerto seguro y el alcance del programa.',
    '/novedades': 'Novedades de Bioboros: anuncios, mejoras del motor y todo lo nuevo, a medida que sucede.',
    '/supermercado': `El supermercado dominicano de Bioboros: ${VERIFIED_FOODS_LABEL} alimentos verificados con presentaciones, marcas y precios reales en RD$ que alimentan tu lista de compras.`,
};

/** Las páginas que fijan su propio `document.title` al montar. */
export const SELF_MANAGED = new Set(['/motor', '/como-funciona', '/funciones', '/precision', '/research']);

/** Título y description de una ruta, con los mismos defaults que el runtime. */
export function metaForRoute(path) {
    return {
        title: TITLES[path] || BRAND,
        description: DESCRIPTIONS[path] || HOME_DESC,
    };
}
