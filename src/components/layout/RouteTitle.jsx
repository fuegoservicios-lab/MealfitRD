import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/* [P3-ROUTE-TITLE · 2026-06-29] Título de pestaña por ruta, minimalista y coherente.
   Fuente única: antes solo index.html (estático) + 4 páginas de marketing seteaban
   título; el resto (login, dashboard, etc.) heredaba un título stale/incoherente.
   Esquema: "<Sección> · MealfitRD" para la app; el home conserva el título de marca.

   Las 4 páginas de marketing con SEO descriptivo propio (/motor, /como-funciona,
   /funciones, /precision) se auto-gestionan vía su useEffect → se listan en
   SELF_MANAGED para que este componente NO les pise el TITLE.

   [P3-ROUTE-META · 2026-06-30] Extendido para gestionar también <meta name="description">
   y <link rel="canonical"> (+ og/twitter description y og:url) POR RUTA. Motivo: el SPA
   sirve el mismo index.html estático para toda ruta, con la description Y el canonical de
   la HOME hardcodeados. Resultado en Google (que sí renderiza JS): el snippet de /privacy
   y demás subpáginas mostraba el texto genérico de la home, y peor — el canonical→home
   marcaba cada subpágina como DUPLICADO de la home, suprimiendo su indexación propia.
   Ahora cada ruta fija su propia description y un canonical auto-referente. Las 4 páginas
   de marketing siguen auto-gestionando su TITLE; su description se gestiona aquí.

   Nota de alcance: los unfurlers sociales (WhatsApp/Facebook/etc.) NO ejecutan JS → siguen
   leyendo el index.html estático. Este fix es para Google/buscadores. Un fix que también
   cubra unfurlers requeriría prerender/SSR por ruta (cambio de infra mayor, no hecho aquí). */

const BRAND = 'MealfitRD';
const ORIGIN = 'https://mealfitrd.com';

const HOME_DESC = 'Planes de alimentación 100% personalizados con IA avanzada. Adaptados a tus gustos, presupuesto y estilo de vida. Comienza gratis.';

const TITLES = {
    '/': 'MealfitRD | Nutrición Personalizada con IA',
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
    '/configuracion': `Ajustes · ${BRAND}`,
    '/history': `Historial · ${BRAND}`,
    '/precios': `Precios · ${BRAND}`,
    '/privacy': `Política de Privacidad · ${BRAND}`,
    '/terms': `Términos de Servicio · ${BRAND}`,
    '/medical': `Aviso Médico · ${BRAND}`,
    '/data-protection': `Protección de Datos · ${BRAND}`,
    '/ai-policy': `Uso de Inteligencia Artificial · ${BRAND}`,
    '/research': `Investigación · ${BRAND}`,
    '/refunds': `Reembolsos y Cancelaciones · ${BRAND}`,
    '/acceptable-use': `Política de Uso · ${BRAND}`,
};

// [P3-ROUTE-META] Description por ruta para el snippet de buscadores. ≤ ~160 chars,
// es-DO, adaptada al contenido real de cada página. Rutas sin entry → HOME_DESC.
const DESCRIPTIONS = {
    '/': HOME_DESC,
    '/login': 'Inicia sesión en MealfitRD para acceder a tu plan nutricional personalizado con IA, tu lista de compras y tu coach.',
    '/assessment': 'Crea tu plan nutricional personalizado con IA en minutos. Adaptado a tus gustos, presupuesto y condición. Gratis para empezar, sin tarjeta.',
    '/precios': 'Planes y precios de MealfitRD: empieza gratis o sube a Básico, Plus o Ultra. Precios reales en RD$, sin tarjeta para comenzar.',
    // Marketing (title self-managed; description gestionada aquí)
    '/funciones': 'Todo lo que hace MealfitRD: plan diario calibrado, recetas paso a paso, lista de compras costeada en RD$, coach IA 24/7 y nevera inteligente.',
    '/como-funciona': 'El método de MealfitRD paso a paso: de tu perfil clínico-metabólico al plato, con validación nutricional determinista en cada etapa.',
    '/precision': 'La precisión que medimos en MealfitRD: banda de macros, piso de proteína, 17 micronutrientes vs DRI y guardas clínicas por condición.',
    '/motor': 'El motor de MealfitRD por dentro: orquestación por grafos, validación nutricional y un catálogo verificado de alimentos dominicanos.',
    // Legales
    '/privacy': 'Política de Privacidad de MealfitRD: qué datos recopilamos, cómo los ciframos y protegemos, qué cookies usamos, con quién los compartimos y tus derechos.',
    '/terms': 'Términos de Servicio de MealfitRD: planes, suscripciones y pagos, uso aceptable, propiedad intelectual y limitación de responsabilidad.',
    '/medical': 'Aviso Médico de MealfitRD: nuestras recomendaciones nutricionales son informativas y no sustituyen el consejo de un profesional de la salud.',
    '/data-protection': 'Protección de datos en MealfitRD bajo la Ley 172-13: tus derechos de acceso, rectificación, cancelación y oposición, y cómo ejercerlos.',
    '/ai-policy': 'Cómo usa MealfitRD la inteligencia artificial: qué datos viajan al proveedor, límites del modelo, supervisión humana y que no entrenamos con tus datos.',
    '/research': 'Política de Investigación de MealfitRD: cómo usamos datos anonimizados para mejorar el producto, con exención de datos sensibles de salud y opt-out.',
    '/refunds': 'Reembolsos y cancelaciones de MealfitRD: cómo cancelar tu suscripción, la ventana de reembolso de 7 días y cómo solicitarlo. Conforme a la Ley 358-05.',
    '/acceptable-use': 'Política de Uso de MealfitRD: reglas para un uso responsable, conductas prohibidas, uso justo de la IA y consecuencias del incumplimiento.',
};

const SELF_MANAGED = new Set(['/motor', '/como-funciona', '/funciones', '/precision']);

function setMetaByName(name, content) {
    let el = document.head.querySelector(`meta[name="${name}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

function setMetaByProp(property, content) {
    let el = document.head.querySelector(`meta[property="${property}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

function setCanonical(href) {
    let el = document.head.querySelector('link[rel="canonical"]');
    if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
    }
    el.setAttribute('href', href);
}

export default function RouteTitle() {
    const { pathname } = useLocation();
    useEffect(() => {
        const path = pathname.replace(/\/+$/, '') || '/';

        // Título — las páginas de marketing con título propio lo setean ellas mismas.
        if (!SELF_MANAGED.has(path)) {
            document.title = TITLES[path] || BRAND;
        }

        // Description + canonical — gestionados aquí para TODAS las rutas.
        const desc = DESCRIPTIONS[path] || HOME_DESC;
        const canonical = path === '/' ? `${ORIGIN}/` : `${ORIGIN}${path}`;
        setMetaByName('description', desc);
        setCanonical(canonical);
        // Google puede usar OG/Twitter como fallback del snippet; alinearlos evita
        // contradicciones. (Los unfurlers sin JS siguen leyendo el estático.)
        setMetaByProp('og:description', desc);
        setMetaByProp('og:url', canonical);
        setMetaByName('twitter:description', desc);
    }, [pathname]);
    return null;
}
