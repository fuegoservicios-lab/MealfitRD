import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';
import styles from './LegalPages.module.css';
// [P1-PLAN-LOTE-849] Dentro de la app nativa, Términos no señala dónde se compra (Apple 3.1.1); la web lo dice entero.
import { nativeHidesCommerce } from '../../config/platform';
// [P1-PAPER-LEGAL · 2026-08-02] `CalendarDays` salió con `.metaIcon`: bajo
// papel el metadato de un pliego se ROTULA en mono, no se ilustra.
import { AlertTriangle, ArrowLeft } from 'lucide-react';
// [P2-LANDING-COPY-TRUTH · 2026-08-14] Los Términos citaban precios y créditos a
// mano y las tres cifras habían quedado obsoletas: prometían 15 créditos (el
// backend entrega 10 desde P1-CREDITS-LADDER) y ofrecían un «Max anual» de
// 449.99 que NO EXISTE — es el importe del plan que P0-ANNUAL-PLANS-MISCONFIGURED
// dejó INACTIVE por cobrar esa cifra CADA MES. Un contrato que promete lo que el
// producto no da no es un detalle de copy.
import {
    TIER_CREDITS, TIER_DISPLAY_NAME, PRICING, hasAnnualBilling,
} from '../../config/plans';

/**
 * La lista de planes del contrato, derivada del SSOT.
 *
 * ⚠️ El anual se decide con `hasAnnualBilling`, NO mirando si `PRICING[tier].annual`
 * existe: ese objeto conserva `ultra.annual` como dato inerte para el día que se
 * cree el plan en PayPal, así que preguntarle a él resucitaría el importe fantasma.
 */
const PlanesDelContrato = () => (
    <ul>
        {['basic', 'plus', 'ultra'].map((tier) => {
            const mensual = PRICING[tier].monthly.price;
            const anual = hasAnnualBilling(tier) ? PRICING[tier].annual : null;
            return (
                <li key={tier}>
                    <strong>{TIER_DISPLAY_NAME[tier]}</strong> — USD {mensual}/mes
                    {anual
                        ? ` ó USD ${anual.price}/año (≈ USD ${anual.monthlyEquiv}/mes).`
                        : ' (este plan no ofrece facturación anual).'}
                </li>
            );
        })}
    </ul>
);

const LegalLayout = ({ title, lastUpdated, children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { userProfile, session, isGuest } = useAssessment();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    // [P3-LEGAL-BACK-LINK · 2026-05-26 · refinado 3ª iteración 2026-05-26]
    // Back-link inteligente en las 4 páginas legales. Cadena de fallbacks:
    //
    //   1. `location.state?.from` — si el Link que nos trajo pasó state
    //      explícito con el path origen, usarlo (más preciso).
    //   2. `document.referrer` — útil cuando el user hace cold-start /
    //      refresh estando en /privacy. En SPA navigation puro el referrer
    //      NO se actualiza por route changes — solo en page loads reales.
    //   3. Auth status — si el user está logueado, asumir que vino del
    //      dashboard (footer del upgrade page, etc.) → /dashboard. Si NO
    //      está logueado, vino del landing public → /.
    //
    // Por qué evitamos `navigate(-1)`: el `ProtectedRoute` redirige `/` →
    // `/dashboard` en navegación POP (incluyendo `navigate(-1)`). El
    // ProtectedRoute permite acceso al landing solo en PUSH/REPLACE. Por
    // eso aquí usamos `navigate(path)` programatic siempre.
    const handleBack = () => {
        // 1. Origen explícito vía Link state
        if (location.state?.from) {
            navigate(location.state.from);
            return;
        }

        // 2. document.referrer (cold-start)
        try {
            const referrer = document.referrer;
            if (referrer) {
                const url = new URL(referrer);
                if (url.origin === window.location.origin) {
                    const path = url.pathname;
                    if (path.startsWith('/dashboard') || path === '/history') {
                        navigate('/dashboard');
                        return;
                    }
                    // [P1-LEGAL-ACK · 2026-06-21] Si venías del login/registro, volver
                    // al LOGIN (no al landing): un usuario sin sesión no debe aterrizar
                    // en el landing (gateado por ProtectedRoute).
                    if (path === '/login' || path === '/register') {
                        navigate('/login');
                        return;
                    }
                    if (path === '/') {
                        navigate('/');
                        return;
                    }
                }
            }
        } catch {
            // ignore URL parse errors
        }

        // 3. Fallback auth-based
        if (userProfile?.id || session) {
            navigate('/dashboard');
        } else if (isGuest) {
            navigate('/'); // un invitado SÍ puede ver el landing/funnel del plan gratis
        } else {
            // [P1-LEGAL-ACK · 2026-06-21] Sin sesión ni modo invitado: el landing está
            // gateado (ProtectedRoute) → mandar a /login en vez de /.
            navigate('/login');
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.contentWrapper}>
                <button
                    type="button"
                    onClick={handleBack}
                    className={styles.backButton}
                    aria-label="Volver a la página anterior"
                >
                    <ArrowLeft size={16} strokeWidth={2.25} />
                    Volver
                </button>
                <header className={styles.header}>
                    <h1 className={styles.title}>{title}</h1>
                    {/* [P3-ABOUT-PAGE · 2026-06-30] lastUpdated opcional: la página
                        "Acerca de Bioboros" no es una política con fecha → sin meta. */}
                    {lastUpdated && (
                        <p className={styles.meta}>
                            <span className={styles.metaLabel}>Última actualización</span>
                            <span className={styles.metaDate}>{lastUpdated}</span>
                        </p>
                    )}
                </header>
                <div className={styles.content}>
                    {children}
                </div>
            </div>
        </div>
    );
};

/* ============================================================================
   POLÍTICA DE PRIVACIDAD
   ============================================================================ */
export const Privacy = () => (
    <LegalLayout title="Política de Privacidad" lastUpdated="29 de Septiembre, 2026">
        <p>En Bioboros nos tomamos en serio la protección de sus datos. Esta Política describe con precisión técnica qué información recopilamos, cómo la procesamos, dónde la almacenamos, con quién la compartimos, qué cookies y almacenamiento local usamos, y qué derechos tiene usted sobre ella. La transparencia es nuestro principio fundamental.</p>

        <h3>1. Identidad del Responsable del Tratamiento</h3>
        <p>El responsable del tratamiento de sus datos es <strong>Bioboros</strong>, plataforma operada desde República Dominicana. Para cualquier consulta sobre privacidad puede contactarnos en <strong>bioboros.support@gmail.com</strong>.</p>

        <h3>2. Información que Recopilamos</h3>
        <p>Recopilamos únicamente la información necesaria para personalizar su plan nutricional y operar la plataforma. Las categorías exactas son:</p>
        <ul>
            <li><strong>Datos de cuenta:</strong> nombre y correo electrónico. <strong>No usamos contraseñas</strong>: se entra con un código de un solo uso enviado a su correo, con su cuenta de Google o con su cuenta de Apple. Por tanto no recopilamos, no almacenamos y no podemos filtrar ninguna contraseña suya.</li>
            <li><strong>País e idioma:</strong> el país desde el que usa Bioboros (lo elige usted entre los que atendemos: República Dominicana, España, Estados Unidos, México, Puerto Rico y Colombia) y el idioma de la interfaz. El país decide el catálogo de alimentos, los precios de referencia y la moneda del presupuesto; el idioma sólo traduce la interfaz. Guardamos además el desfase horario de su dispositivo para programar su plan en su día local.</li>
            <li><strong>Perfil de salud (<code>health_profile</code>):</strong> peso actual y objetivo, estatura, edad, género, grasa corporal y cintura (opcionales), nivel de actividad física, objetivo (perder peso, ganar músculo, mantener) y ritmo deseado, restricciones dietéticas, alergias alimentarias, <strong>condiciones de salud declaradas, medicamentos que toma y suplementos</strong>, embarazo o lactancia si aplica, horas de sueño, nivel de estrés, horario de comidas, tiempo disponible para cocinar, hábitos y dificultades que usted describe, y preferencias culinarias. Los datos de salud se tratan como <strong>datos sensibles</strong> (ver Sección 3 y la Política de Protección de Datos).</li>
            <li><strong>Presupuesto:</strong> presupuesto semanal de compra, con su moneda. Sirve para acotar la lista de compras; no se usa para perfilarle comercialmente.</li>
            <li><strong>Histórico nutricional:</strong> comidas registradas (<code>consumed_meals</code>), hidratación diaria, peso histórico (<code>weight_history</code>), inventario de despensa (<code>user_inventory</code>) e ítems agotados.</li>
            <li><strong>Datos de interacción con IA:</strong> mensajes con el asistente conversacional (<code>agent_messages</code>), planes generados (<code>meal_plans</code>), recetas expandidas, "lecciones aprendidas" derivadas de su uso (<code>user_facts</code>) almacenadas como embeddings vectoriales para personalización a largo plazo.</li>
            <li><strong>Fotos de comida y fotos del chat (opcional):</strong> si usted decide escanear una comida con la cámara o subir una foto, en el escáner o en el chat del coach, la enviamos al proveedor de visión (ver Sección 4) para identificar los alimentos y estimar sus macros, y guardamos el resultado textual del análisis, que usted revisa antes de registrarlo. La foto del escáner no se guarda en nuestros servidores una vez analizada. Las fotos que usted envía al chat del coach sí se guardan en nuestra base de datos (<code>chat_attachments</code>), de forma privada y junto a esa conversación, para mostrárselas en el historial del chat; se borran si usted borra esa conversación o su cuenta, y las que sube sin llegar a enviarlas, pasadas 24 horas. Además, cuando una foto acaba en un plato registrado, la app guarda una copia sólo en su dispositivo para mostrarla en la ficha de esa comida (ver Sección 13).</li>
            <li><strong>Dictado y modo voz (opcional):</strong> el dictado convierte su voz en texto en su propio dispositivo o navegador: a Bioboros sólo llega el texto transcrito, que se trata como cualquier otro mensaje del chat, y su voz no se envía a nuestros servidores. Según el navegador, su fabricante (por ejemplo, Google en Chrome o Apple en Safari y en el iPhone) puede procesar en sus servidores lo que usted dice, bajo sus propios términos. En el modo voz, para leerle en voz alta la respuesta del coach, enviamos el texto de esa respuesta a Google (API de Gemini, servicio de pago que, según sus condiciones, no usa esos datos para entrenar sus modelos) y reproducimos el audio que devuelve. Si ese servicio no está disponible, se usa la voz de su dispositivo o navegador, que, según el navegador o el dispositivo, puede generarse en servidores de su fabricante (por ejemplo, Google en Chrome) a partir del mismo texto, bajo sus propios términos.</li>
            <li><strong>Datos de pago:</strong> NO almacenamos números de tarjeta de crédito ni información financiera. Solo guardamos el identificador de suscripción de PayPal (<code>paypal_subscription_id</code>) y el plan vigente (<code>plan_tier</code>).</li>
            <li><strong>Regalos en su cuenta:</strong> si el equipo de Bioboros le regala créditos o un plan de cortesía, guardamos el regalo con su vigencia y el motivo (<code>account_grants</code>). Se borra con su cuenta y aparece en la exportación de sus datos. Si borra su cuenta, el registro del equipo sobre ese regalo se conserva sin el identificador de su cuenta ni el motivo (ver Sección 9).</li>
            <li><strong>Ajustes de la app:</strong> guardamos los ajustes que elige en Configuración (por ejemplo, la hidratación, la Nevera o los recordatorios) y los de su dispositivo que la app nos informa —el tema, si permite notificaciones, si activó las alertas, la plataforma y la versión de la app (<code>ajustes_dispositivo</code>)—, además de un historial de cuándo cambió cada ajuste y si lo cambió usted, el coach o el sistema (<code>ajustes_cambios</code>). Se borran con su cuenta y aparecen en la exportación de sus datos; el historial se borra a los 24 meses.</li>
            <li><strong>Cuenta de prueba:</strong> si su cuenta participa en las pruebas, guardamos desde cuándo, quién la marcó y por qué, cuándo vio el aviso y cuándo salió (<code>cuentas_de_prueba</code>). Se borra con su cuenta y aparece en la exportación de sus datos, sin los identificadores del personal.</li>
            <li><strong>Notificaciones:</strong> si usted activa los avisos en el navegador, guardamos la suscripción push de su navegador (<code>push_subscriptions</code>); en la app para Android o iPhone, si su dispositivo permite los avisos de Bioboros, guardamos el identificador de avisos de ese dispositivo (<code>device_push_tokens</code>). Los usamos sólo para enviarle esos avisos. Puede desactivarlos en cualquier momento desde Ajustes o desde su dispositivo.</li>
            <li><strong>Diagnóstico de la voz:</strong> al abrir la app del teléfono y cada vez que el dictado o el modo voz fallan, la app nos envía un informe técnico sin identificar su cuenta —si la voz está disponible, el código de error, la plataforma y el motor de voz, el idioma y el modelo y la versión del sistema de su dispositivo—; nunca su voz ni lo que dijo. Lo usamos solo para arreglar fallos y se borra a los 30 días.</li>
            <li><strong>Datos técnicos automáticos:</strong> dirección IP, tipo de navegador o dispositivo, sistema operativo, y eventos de error (gestionados por Sentry con filtrado de información personal — ver Sección 7).</li>
        </ul>

        <h3>3. Base Legal y Finalidades del Tratamiento</h3>
        <p>Usamos sus datos exclusivamente para:</p>
        <ul>
            <li><strong>Ejecución del contrato:</strong> generar planes de comidas personalizados, calcular macronutrientes, listas de compras, recomendaciones del asistente, sincronizar su nevera y administrar su suscripción.</li>
            <li><strong>Interés legítimo:</strong> mejorar la plataforma mediante telemetría agregada (latencia de generación, tasa de éxito, errores), prevenir abuso del servicio (rate limits, detección de fraude), y mantener integridad del sistema.</li>
            <li><strong>Cumplimiento legal:</strong> retener registros de facturación según obligaciones tributarias dominicanas y procesar reclamaciones de PayPal cuando aplique.</li>
        </ul>
        <p>No utilizamos sus datos para publicidad dirigida, ni los vendemos a terceros, ni los compartimos con anunciantes.</p>

        <h3>4. Cómo Funciona Nuestra Inteligencia Artificial</h3>
        <p>Bioboros <strong>no es un simple "wrapper" sobre un modelo de IA</strong>. Nuestro sistema combina varios componentes propietarios: un orquestador basado en grafos de estados (LangGraph) que coordina la generación de planes en múltiples pasos validados, un motor propio de coherencia nutricional que verifica que la lista de compras concuerde con las recetas generadas, un sistema de memoria a largo plazo con embeddings vectoriales que aprende de sus interacciones, un agente conversacional con herramientas seguras (no permitimos que la IA acceda a datos de otros usuarios — defensa <code>P0-AGENT-1</code>), un módulo de visión multimodal para analizar fotos de comida, y un circuit breaker que protege contra fallos del proveedor del modelo.</p>
        {/* [P1-AI-CONFIDENTIAL · 2026-07-11] Las identidades/versiones de los modelos
            son secreto comercial y rotan; el PROVEEDOR (receptor de datos) sí se
            divulga — es la parte legalmente relevante bajo la Ley 172-13.
            [P1-PLAN-LOTE-794 · 2026-09-28 · ronda 2] §2 (cuenta), §4, §8, §12, §13, Protección de Datos
            §5-§6 y Política de IA §2 copiados del landing (rama ia6d-legal, e94872d). Proveedores medidos
            en el VPS el 28-sep: MEALFIT_LLM_PROVIDER=deepseek, fotos a gemini-3.8-flash (Google), OpenAI
            y Cohere con clave viva. Con el knob en deepseek los IDs GLM se traducen a DeepSeek
            (llm_provider._GLM_TO_DEEPSEEK) y el proveedor anterior no recibe nada: si el knob vuelve a
            zai (rollback), estas políticas tienen que volver a nombrarlo ANTES.
            [FUSIÓN 0f + 6d · 2026-09-28] Privacidad, Uso de IA, Protección de Datos, Uso aceptable,
            Aviso Médico y Divulgación responsable dicen lo MISMO que el landing fusionado
            (bioboros-landing, rama ia6d-integ-landing): la voz del modo voz (P1-PLAN-LOTE-685), el
            acceso del equipo y los regalos de cuenta (P1-PLAN-LOTE-771) y el papel entero de OpenAI.
            Las únicas diferencias a propósito: la frase de PostHog de §7 (esta copia vive en la app),
            «copia de cortesía» en Protección de Datos §1 y los créditos del plan gratis desde el SSOT.
            [FUSIÓN 0f + 6d · ronda 2 · 2026-09-28] Las dos copias a la vez: Google también por la voz en las
            listas de §4, Uso de IA §2 y Protección de Datos §6; el respaldo de la voz puede ser de red (Chrome);
            las fotos del chat SÍ se guardan (chat_attachments) y la del escáner no; el panel de soporte y su
            registro, que sobrevive al borrado (§5, §9, §10). Reembolsos con la fecha del apex (18-ago).
            [FUSIÓN 0f + 6d · ronda 3 · 2026-09-29] Las dos copias a la vez (landing c2bfddf): las fotos del chat
            no se acotan a comida (§2, §4, §8 y Uso de IA §2; el chat manda y guarda cualquier imagen); DeepSeek
            estima las comidas anotadas por escrito también en §4 y Uso de IA §2; el borrador del chat en §13
            (chatDraftStore.js); el motivo del panel en §9; Protección de Datos §5 remite también a la §2.
            [P1-PLAN-LOTE-836 · 2026-09-29] Textos del apex, palabra por palabra: el panel de soporte ve los ajustes y
            la actividad EN NÚMEROS (§5); las cuentas de prueba, avisadas en la app, su actividad completa (§2 «Cuenta de
            prueba» y «Ajustes de la app», §5 «Cuentas de prueba»); el rastro del equipo dura 24 meses y, al borrar la
            cuenta, pierde el identificador y los motivos (§2 regalos, §9; seudónimo del 841); Protección de Datos §5, la
            finalidad de prueba. Fechas de Privacidad y Protección de Datos: 29-sep.
            Ancla: src/__tests__/legal_verdad_publica.test.js */}
        <p>Como motor generativo utilizamos <strong>modelos de IA de última generación de proveedores externos</strong>, y un proveedor más para la memoria del coach. Hoy son <strong>cuatro</strong> proveedores de IA, y no todos reciben lo mismo:</p>
        <ul>
            <li><strong>DeepSeek</strong> genera partes de su plan, mueve la conversación con el coach y estima las macros de las comidas que usted anota por escrito en su diario (también las correcciones que escribe al escanear una). Recibe su perfil de salud, sus preferencias, el historial reciente de la conversación, el nombre de su cuenta —para que el coach se dirija a usted por su nombre— y esas anotaciones.</li>
            <li><strong>OpenAI</strong> genera días de su plan, realiza la revisión clínica (comprueba que el plan respete sus condiciones y alergias) y actúa como red de respaldo cuando DeepSeek no responde. Recibe su perfil de salud, sus preferencias y, cuando hace falta, parte de la conversación. En el modo voz en vivo también recibe el audio de su micrófono y las respuestas del coach para escucharle y responderle.</li>
            <li><strong>Google</strong>, mediante su API de <strong>Gemini</strong>, <strong>analiza las fotos de comida que usted escanea y las fotos que usted envía al chat</strong> y, en el modo voz, <strong>lee en voz alta las respuestas del coach</strong>. Para las fotos recibe la imagen, lo que usted escriba para aclararla y su país; en el modo voz, el texto de cada respuesta que se lee en voz alta, que puede mencionar su plan o su salud. No recibe su perfil de salud.</li>
            <li><strong>Cohere</strong> convierte textos en embeddings vectoriales para la memoria a largo plazo del coach y para recuperar lo relevante al generar su plan; no genera respuestas. Recibe las notas que guardamos sobre usted, la búsqueda que el coach hace a partir de su mensaje, un resumen de su perfil (objetivo, alergias, condiciones de salud, dieta, alimentos que no le gustan y obstáculos) al generar su plan, la descripción de las comidas que usted escanea para su diario y un resumen de las comidas que suele dejar sin registrar, para ajustar los recordatorios (ver Sección 8).</li>
        </ul>
        <p>La identidad, versión y combinación específica de los modelos que orquestamos constituye información confidencial de Bioboros (secreto comercial) y <strong>puede cambiar sin previo aviso</strong> a medida que evaluamos y adoptamos mejores modelos, siempre manteniendo los mismos estándares de calidad y validación. Lo que <strong>no</strong> cambia sin avisarle es <em>quién</em> recibe sus datos: si añadiéramos o sustituyéramos un proveedor, actualizaremos esta política antes. Específicamente enviamos a los proveedores:</p>
        <ul>
            <li>Su perfil de salud completo (peso, altura, edad, género, condiciones, medicamentos, restricciones).</li>
            <li>Sus preferencias y comidas que le gustan/no le gustan.</li>
            <li>El historial reciente de la conversación con el asistente.</li>
            <li>El nombre de su cuenta, para que el coach se dirija a usted.</li>
            <li>Las comidas que usted anota por escrito en su diario y las correcciones que escribe al escanear una, para estimar sus macros (sólo a DeepSeek).</li>
            <li>Las fotos de comida que usted decide escanear y las fotos que usted envía al chat (sólo a Google).</li>
            <li>El texto de las respuestas del coach que se leen en voz alta, si usa el modo voz (sólo a Google).</li>
        </ul>
        <p>DeepSeek trata estos datos bajo sus <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className={styles.link}>Términos de Servicio y Política de Privacidad de la Plataforma Abierta</a>; sus servidores están en la <strong>República Popular China</strong>. OpenAI trata estos datos bajo sus <a href="https://openai.com/policies/" target="_blank" rel="noopener noreferrer" className={styles.link}>políticas de uso de la API</a> (que excluyen el uso de los datos de la API para entrenar sus modelos); sus servidores están principalmente en <strong>Estados Unidos</strong>. Google trata las fotos y el texto del modo voz bajo los <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" className={styles.link}>Términos adicionales de la API de Gemini</a>; sus servidores están principalmente en <strong>Estados Unidos</strong>. Cohere trata sus textos bajo sus propios términos de la API. En todos los casos el envío implica una transferencia internacional de datos. No anonimizamos los datos antes de enviarlos porque la personalización requiere su contexto específico; sin embargo, NUNCA les enviamos su correo electrónico ni sus datos de pago.</p>
        <p>Adicionalmente, NOSOTROS no usamos sus datos personales para entrenar modelos propios. La "memoria a largo plazo" del agente se basa en embeddings vectoriales privados de SU cuenta — no se cruza ni se agrega con otros usuarios.</p>

        <h3>5. Infraestructura y Seguridad Técnica</h3>
        <p>Su información se almacena en infraestructura administrada:</p>
        <ul>
            <li><strong>Base de datos:</strong> Neon (PostgreSQL serverless gestionado por Neon, Inc.), con cifrado en reposo AES-256 y cifrado en tránsito TLS 1.2 o superior.</li>
            <li><strong>Aislamiento por <code>user_id</code>:</strong> cada consulta a la base de datos incluye un filtro explícito por su <code>user_id</code>, de modo que ninguna consulta puede acceder a información de otro usuario. Publicamos tests automatizados que verifican este contrato en cada cambio del código (invariantes I2/I6).</li>
            <li><strong>Acceso del equipo de Bioboros:</strong> para darle soporte y mejorar el servicio, personal autorizado puede ver en un panel de soporte los datos de su cuenta —correo, nombre, fecha de alta, plan, estado y vencimiento de la suscripción y si está vinculada a PayPal, cuántos créditos y mensajes del coach ha usado este mes, los regalos que ha recibido, con su motivo, su país, idioma y modo de uso, los ajustes que tiene activados en la app (también los de su dispositivo, como el tema o si permite notificaciones) y cuándo los cambió, y cuánto usa la app en números: cuántas comidas ha registrado, cuántos planes ha generado, cuántos mensajes ha enviado al coach, cuántos escaneos ha hecho, cuánto ha costado su uso de la inteligencia artificial y cuándo fue su última actividad— y ajustar su plan o sus créditos (por ejemplo, para compensar un fallo o regalarle un plan de cortesía). Desde ese panel no se ven el contenido de sus registros, sus conversaciones con el asistente, sus fotos ni su perfil de salud, salvo en las cuentas de prueba (siguiente punto). Cada cambio queda registrado con quién lo hizo, cuándo y por qué, y cada consulta, con quién la hizo y cuándo.</li>
            <li><strong>Cuentas de prueba:</strong> si su cuenta participa en las pruebas de Bioboros, se lo indicamos en la propia app. Mientras lo sea, y desde que usted ve ese aviso, el personal autorizado puede revisar su actividad completa en la app —lo que indicó en el formulario, las comidas que registró, sus planes, sus conversaciones con el asistente y las fotos que adjuntó en ellas, y el uso que hizo de la inteligencia artificial—, también la anterior a que se marcara, para probar y mejorar el servicio. Puede salir del modo de prueba en cualquier momento desde Configuración → Privacidad, y desde ese momento el equipo deja de tener ese acceso. Cada consulta queda registrada.</li>
            <li><strong>Autenticación:</strong> Neon Auth (Better Auth), con tokens JWT firmados mediante EdDSA y validados en el servidor —contra el JWKS de Neon Auth— en cada petición. Tokens de sesión en cookies HttpOnly + SameSite.</li>
            <li><strong>Acceso sin contraseña:</strong> el ingreso es por código de un solo uso al correo o con Google, así que no hay ninguna contraseña que robar, adivinar o reutilizar. Se conserva un flujo residual de restablecimiento de contraseña que, si alguna vez se usa, comprueba la clave elegida contra la base de datos HaveIBeenPwned por k-anonimato —enviando solo cinco caracteres del hash, nunca la contraseña— y la rechaza si aparece en una filtración conocida.</li>
            <li><strong>Headers de seguridad web:</strong> HSTS, X-Frame-Options DENY, Content Security Policy, Referrer-Policy estrictos.</li>
        </ul>

        <h3>6. Procesamiento de Pagos</h3>
        <p>Los pagos se procesan exclusivamente a través de <strong>PayPal</strong> (PayPal Holdings, Inc., certificada PCI-DSS Level 1). Bioboros nunca recibe ni almacena su número de tarjeta, fecha de vencimiento ni CVV. Cuando usted hace upgrade a un plan pago, PayPal nos devuelve únicamente un identificador de suscripción que asociamos a su cuenta. Validamos del lado del servidor que el plan reportado por PayPal coincida exactamente con el que usted seleccionó (defensa contra manipulación cliente-side).</p>

        <h3>7. Monitoreo de Errores y Telemetría</h3>
        <p>Usamos <strong>Sentry</strong> (Functional Software, Inc.) para detectar errores técnicos en frontend y backend. Tenemos filtros automáticos (PII scrubbing) que eliminan de los reportes de error: <code>user_id</code>, contraseñas, tokens, perfil de salud, contenido de mensajes con el agente y números de pago. El sampling rate por defecto es 10% (configurable). Sentry conserva los reportes según su política propia de retención.</p>
        {/* [P1-PLAN-LOTE-794 · 2026-09-28 · ronda 2] Misma redacción que el landing (content/privacy.html,
            rama ia6d-legal, e94872d): el código seudónimo diario del servidor y el texto visible de lo que
            se pulsa (el autocapture sigue encendido en la app). Única diferencia a propósito: el landing
            dice que «estas políticas» no cargan PostHog porque allí se sirven desde bioboros.com; esta
            copia vive en app.bioboros.com, que sí lo carga. Ancla: src/__tests__/lote794.test.js */}
        <p>Usamos además <strong>PostHog</strong> (PostHog, Inc.) para analítica de producto dentro de la aplicación: cuántas personas la usan, qué secciones visitan y en qué punto abandonan el registro. Es analítica de uso, no publicidad: no vendemos ni compartimos esos datos con anunciantes, y sólo asociamos los eventos a su cuenta —por identificador interno, nunca por correo ni nombre— si usted ha iniciado sesión. Funciona <strong>sin cookies ni almacenamiento local</strong>: PostHog no escribe cookies ni entradas de <code>localStorage</code> en su dispositivo, así que no deja en él ningún identificador de analítica. Por eso no le pedimos aceptar cookies para la analítica: no hay ninguna cookie de analítica que aceptar. Para contar visitantes sin guardar nada en su dispositivo, PostHog calcula en sus servidores un código seudónimo a partir de su dirección IP, su navegador y una clave que cambia cada día; si usted no ha iniciado sesión, ese código no permite reconocerle de un día a otro. PostHog registra además, de forma automática, qué botones y opciones pulsa en la aplicación, con el texto visible de cada uno: en el formulario, eso puede incluir la opción de salud que usted marque (por ejemplo, una condición como «Diabetes tipo 2»). No registra lo que usted escribe en los campos de texto. Las páginas informativas de bioboros.com (portada, precios, artículos y las políticas publicadas allí) no cargan PostHog; las de la aplicación (app.bioboros.com), incluida esta, sí. Los eventos se procesan en servidores de PostHog en <strong>Estados Unidos</strong>, lo que implica una transferencia internacional de datos (ver Sección 12); como en cualquier conexión, PostHog recibe la dirección IP y el tipo de navegador o dispositivo desde el que se envían. Puede desactivar por completo estos eventos desde <strong>Ajustes → Privacidad → «Ayuda a mejorar Bioboros»</strong>.</p>
        <p>No utilizamos Google Analytics, Mixpanel, Facebook Pixel, ni ningún rastreador publicitario.</p>

        <h3>8. Proveedores Subcontratados (Encargados de Tratamiento)</h3>
        <p>Para operar la plataforma compartimos datos estrictamente necesarios con los siguientes proveedores. Todos están bajo contratos de procesamiento de datos:</p>
        <ul>
            <li><strong>Neon, Inc.</strong> — almacenamiento de base de datos y autenticación.</li>
            <li><strong>Google LLC</strong> — en cuatro papeles distintos: (1) <strong>análisis de las fotos de comida que usted escanea y de las fotos que usted envía al chat</strong>, mediante la API de <strong>Gemini</strong> (recibe la imagen, lo que usted escriba para aclararla y su país; no su perfil de salud); (2) entrega de los avisos en la app de Android mediante <strong>Firebase Cloud Messaging</strong>, <em>si su dispositivo permite los avisos de Bioboros</em>; (3) <strong>la voz del modo voz del coach</strong>, mediante la API de <strong>Gemini</strong>: recibe el texto de cada respuesta que se lee en voz alta (no su voz ni su perfil de salud); y (4) proveedor de identidad, <em>solo si usted elige «Entrar con Google»</em>: en ese caso conoce que usted accedió a Bioboros y nos devuelve su correo y su nombre. Si entra con el código por correo, Google no interviene en su acceso.</li>
            <li><strong>Apple Inc.</strong> — en dos papeles: entrega de los avisos en la app para iPhone mediante <strong>Apple Push Notification service (APNs)</strong>, <em>si su dispositivo permite los avisos de Bioboros</em>; y proveedor de identidad, <em>solo si usted elige «Entrar con Apple»</em>, disponible en la app para iPhone, que puede ocultarnos su correo real mediante un alias de reenvío, que respetamos.</li>
            <li><strong>DeepSeek (Hangzhou DeepSeek Artificial Intelligence Basic Technology Research Co., Ltd.)</strong> — generación de partes del plan, conversación con el coach y estimación de las macros de las comidas que usted anota por escrito en su diario y de las correcciones que escribe al escanear una (perfil de salud, preferencias, conversación, el nombre de su cuenta y esas anotaciones).</li>
            <li><strong>OpenAI, L.L.C.</strong> — generación de días del plan, revisión clínica y red de respaldo de la generación (perfil de salud, preferencias y conversación); escucha y respuesta en el modo voz en vivo (audio del micrófono y respuestas del coach). No recibe sus fotos.</li>
            <li><strong>PayPal Holdings, Inc.</strong> — procesamiento de pagos y suscripciones.</li>
            <li><strong>Functional Software, Inc. (Sentry)</strong> — monitoreo de errores técnicos.</li>
            <li><strong>PostHog, Inc.</strong> — analítica de producto (visitas, uso de secciones y embudo de registro). Le identifica sólo por un identificador interno, nunca por su correo ni su nombre; puede recibir el texto visible de las opciones que usted pulsa, incluida una opción de salud que marque en el formulario (ver Sección 7).</li>
            <li><strong>Oracle Corporation (Oracle Cloud Infrastructure)</strong> — infraestructura de hosting (VPS con nginx) del frontend y backend.</li>
            <li><strong>Cohere Inc.</strong> — generación de embeddings vectoriales para la memoria a largo plazo del asistente y para recuperar lo relevante al generar su plan: recibe las "lecciones" derivadas de su uso, la búsqueda que el coach hace a partir de su mensaje, un resumen de su perfil (objetivo, alergias, condiciones de salud, dieta, alimentos que no le gustan y obstáculos) al generar su plan, la descripción de las comidas que usted escanea para su diario y un resumen de las comidas que suele dejar sin registrar, para ajustar los recordatorios.</li>
        </ul>
        <p>Sobre los avisos: para entregar cada uno, Firebase Cloud Messaging (Android) y APNs (iPhone) reciben el texto del aviso —que puede incluir, por ejemplo, el principio de una respuesta del coach— y un identificador técnico de su dispositivo. En el navegador, los avisos viajan cifrados a través del servicio de notificaciones de su propio navegador, que no puede leer su contenido.</p>
        <p>Sobre la voz: si usa el dictado del coach, es el servicio de voz de su navegador o dispositivo —no Bioboros— el que convierte su voz en texto; según el navegador, lo hace en servidores de su fabricante (por ejemplo, Google o Apple), bajo sus propios términos. En el modo voz, la voz que lee las respuestas del coach la genera Google a partir del texto de cada respuesta; si ese servicio no está disponible, la genera la voz de su navegador o dispositivo, que según el navegador puede hacerlo en servidores de su fabricante (ver Sección 2).</p>

        <h3>9. Retención de Datos</h3>
        <p>Mantenemos sus datos mientras su cuenta esté activa. Tablas operacionales (planes huérfanos, telemetría de chunks, logs de errores) tienen políticas automáticas de purga: 7 días para planes abandonados sin generar, 90 días para telemetría desvinculada del plan, 30 días para caché de operaciones temporales. Los registros de facturación se conservan por el plazo legal aplicable (típicamente 5-7 años en RD). El registro de lo que el equipo de Bioboros consulta y ajusta en su cuenta desde el panel de soporte (ver Sección 5) se conserva 24 meses como constancia de esos accesos y después se borra: guarda el identificador interno de su cuenta, quién actuó y cuándo y, en cada ajuste, qué se cambió y por qué; no guarda su correo, su nombre ni su perfil de salud, más allá de lo que el personal escriba como motivo de un ajuste, que no debe incluir datos personales. Si usted elimina su cuenta, de ese registro se borran el identificador de su cuenta y esos motivos: queda sólo qué hizo el equipo y cuándo, sin poder asociarse a usted.</p>

        <h3>10. Sus Derechos</h3>
        <p>Usted puede en cualquier momento:</p>
        <ul>
            <li><strong>Acceder</strong> a la información que tenemos de usted desde Ajustes en la app o solicitándola por correo.</li>
            <li><strong>Rectificar</strong> datos incorrectos editando su perfil directamente.</li>
            <li><strong>Eliminar</strong> su cuenta y todos los datos asociados directamente <strong>desde la app</strong> (Ajustes → Eliminar cuenta, con confirmación), o escribiendo a bioboros.support@gmail.com. El borrado dispara CASCADE sobre todas las tablas vinculadas mediante claves foráneas. Lo que se conserva después, y por qué, está en la Sección 9.</li>
            <li><strong>Exportar</strong> sus datos en formato JSON <strong>al instante desde la app</strong> (Ajustes → Privacidad → Exportar datos). Si prefiere pedirlo por correo, cumplimos en un plazo máximo de 30 días.</li>
            <li><strong>Oponerse</strong> al tratamiento para finalidades distintas a la ejecución del contrato.</li>
            <li><strong>Revocar el consentimiento</strong> cancelando su suscripción y eliminando la cuenta.</li>
        </ul>

        <h3>11. Menores de Edad</h3>
        <p>Bioboros está destinada a personas mayores de 18 años. Aunque actualmente solicitamos la edad como dato declarativo del usuario, no realizamos verificación de identidad. Si descubrimos que un menor ha creado una cuenta sin consentimiento parental, eliminaremos la cuenta y sus datos asociados de inmediato. Padres o tutores pueden notificarnos en bioboros.support@gmail.com.</p>

        <h3>12. Transferencias Internacionales</h3>
        <p>Dado que nuestros proveedores (Neon, DeepSeek, OpenAI, Google, PayPal, Sentry, PostHog, Oracle Cloud, Cohere y, si usted usa sus avisos o su acceso, Apple) operan globalmente, sus datos pueden procesarse fuera de República Dominicana — principalmente en <strong>Estados Unidos</strong> (incluida la analítica de producto de PostHog) y, en el caso de <strong>DeepSeek</strong>, en la <strong>República Popular China</strong> (ver Sección 4). Si usted reside en la Unión Europea, estas transferencias se amparan en Cláusulas Contractuales Estándar de la Comisión Europea o, para proveedores estadounidenses adheridos, en el Marco de Privacidad de Datos UE-EE. UU.; el detalle de sus derechos bajo el RGPD está en la Política de Protección de Datos. Nunca enviamos a los proveedores de inteligencia artificial su correo electrónico ni sus datos de pago.</p>

        <h3>13. Cookies y Almacenamiento Local</h3>
        <p>Aplicamos un principio de minimalismo: solo usamos los almacenamientos estrictamente necesarios para que el servicio funcione, para recordar sus preferencias entre visitas y para diagnosticar errores técnicos. <strong>No utilizamos cookies de publicidad, marketing ni retargeting</strong> — sin Google Analytics, Meta/TikTok Pixel ni identificadores publicitarios (IDFA, GAID). Tampoco usamos cookies de analítica: la analítica de producto (PostHog) funciona sin cookies ni almacenamiento local, así que no necesita que usted acepte cookies antes de usar el servicio; para contar visitantes, PostHog calcula en sus servidores un código seudónimo que cambia cada día (ver Sección 7).</p>
        <ul>
            <li><strong>Cookies de sesión (autenticación):</strong> establecen y renuevan su sesión tras iniciar sesión. Son <code>HttpOnly</code> y <code>Secure</code>; sin ellas no podría usar funciones que requieran cuenta. Caducan según la duración de su sesión.</li>
            <li><strong>Cookies técnicas de PayPal:</strong> durante el flujo de pago, PayPal puede establecer cookies en su propio dominio para detección de fraude y para mantener su sesión de pago. No controlamos su contenido; PayPal las describe en su <a href="https://www.paypal.com/us/legalhub/privacy-full" target="_blank" rel="noopener noreferrer" className={styles.link}>política de privacidad</a>.</li>
            <li><strong>Almacenamiento local (<code>localStorage</code>):</strong> guarda en SU dispositivo preferencias y caché operacional (su plan actual, el borrador del formulario de evaluación, el tracker de hidratación, la caché de despensa y del diario nutricional, preferencias de notificaciones y banderitas de UI). Nunca se envía automáticamente a nuestros servidores y persiste hasta que usted lo borre o cierre sesión.</li>
            <li><strong>Fotos de sus comidas (<code>IndexedDB</code>):</strong> cuando registra un plato con una foto, la app guarda en SU dispositivo una copia de esa foto para mostrarla en la ficha de la comida. Nunca se envía desde ahí a nuestros servidores; se borra al borrar esa comida o al eliminar su cuenta desde ese dispositivo, y la app retira las de más de 90 días al guardar otras nuevas.</li>
            <li><strong>Borrador del chat (<code>IndexedDB</code>):</strong> lo que usted escribe en el chat del coach y todavía no ha enviado —el texto y hasta 4 fotos por conversación— se guarda en SU dispositivo para que no lo pierda si sale de la conversación o de la app. No llega a nuestros servidores mientras no lo envíe; se borra al enviarlo o vaciarlo, al borrar esa conversación y al cerrar sesión.</li>
            <li><strong>Service Worker (PWA):</strong> como Aplicación Web Progresiva, registramos un Service Worker que cachea recursos estáticos (imágenes, fuentes, JavaScript) para uso offline e instalación como app. No envía información personal a nuestros servidores.</li>
            <li><strong>Sentry (telemetría técnica):</strong> inserta un identificador anónimo de sesión técnica para correlacionar errores de una misma visita — sin cookies de rastreo publicitario y con filtrado de datos personales (ver Sección 7).</li>
            <li><strong>PostHog (analítica de producto):</strong> no guarda cookies ni entradas de <code>localStorage</code> en su dispositivo. Lo nombramos aquí precisamente para decirlo: la analítica no deja en su navegador ningún identificador de visitante (el código diario con el que cuenta visitantes lo calcula PostHog en sus servidores; ver Sección 7). Se desactiva desde <strong>Ajustes → Privacidad</strong>.</li>
            <li><strong>Preferencia de privacidad:</strong> si desactiva los eventos de uso, guardamos esa decisión en su dispositivo (en el <code>localStorage</code> y en una cookie de preferencia de <code>bioboros.com</code>) para seguir respetándola en sus próximas visitas. Contiene sólo esa elección, ningún identificador, y se escribe únicamente cuando usted usa ese interruptor.</li>
        </ul>
        <p>Usted tiene control total: puede bloquear o eliminar cookies desde la configuración de su navegador, borrar el <code>localStorage</code> y desinstalar el Service Worker desde las DevTools (Application → Storage), o usar el modo incógnito para no persistir nada entre sesiones. Tenga en cuenta que bloquear las cookies estrictamente necesarias (sesión) impedirá iniciar sesión o usar funciones que requieran autenticación.</p>

        <h3>14. Cambios en esta Política</h3>
        <p>Podremos actualizar esta Política para reflejar cambios técnicos o legales. Cualquier modificación se publicará aquí con la nueva fecha de "Última actualización". Si los cambios son materiales, le notificaremos por correo electrónico antes de su entrada en vigor.</p>
    </LegalLayout>
);

/* ============================================================================
   TÉRMINOS DE SERVICIO
   ============================================================================ */
export const Terms = () => (
    <LegalLayout title="Términos de Servicio" lastUpdated="22 de Agosto, 2026">
        <p>Bienvenido a Bioboros. Al acceder o utilizar nuestra plataforma usted acepta los presentes Términos de Servicio, que constituyen un acuerdo legalmente vinculante entre usted y Bioboros. Por favor léalos con atención.</p>

        <h3>1. Naturaleza del Servicio</h3>
        <p>Bioboros es una plataforma propietaria de nutrición personalizada que integra varias capas tecnológicas desarrolladas internamente: un orquestador determinístico basado en grafos de estados que coordina la generación de planes en múltiples pasos validados, un motor de coherencia nutricional que verifica matemáticamente la consistencia entre recetas y listas de compras, un agente conversacional con herramientas seguras de modificación de datos del usuario, un módulo de visión multimodal para análisis de fotografías de comida, un sistema de memoria a largo plazo con embeddings vectoriales para personalización continua, un programador de tareas (chunks rolling) que regenera porciones de su plan sin interrumpir su uso, y un sistema de auditoría con detección de derivas operativas.</p>
        <p>Como motor generativo utilizamos modelos de IA de terceros de última generación. La identidad, versión y combinación específica de dichos modelos es <strong>información confidencial de Bioboros (secreto comercial)</strong> y puede cambiar sin previo aviso a medida que evaluamos y adoptamos mejores modelos, manteniendo siempre los estándares de calidad y validación descritos en estos Términos. <strong>Bioboros no es un wrapper ni un envoltorio simple sobre un modelo de IA</strong>: el valor diferencial reside en nuestros sistemas de orquestación, validación, persistencia y aprendizaje continuo, todos propietarios. Los modelos generativos funcionan como piezas dentro de un sistema mucho mayor. Los proveedores externos que reciben datos para inferencia se identifican en la <strong>Política de Privacidad</strong> y en la <strong>Política de Uso de Inteligencia Artificial</strong>.</p>

        <h3>2. Elegibilidad y Registro</h3>
        <p>Para utilizar Bioboros usted debe:</p>
        <ul>
            <li>Tener al menos 18 años cumplidos. Bioboros trata datos de salud y medicación y no está diseñada para menores; no ofrecemos registro con consentimiento parental.</li>
            <li>Proporcionar información veraz y mantenerla actualizada.</li>
            <li>Tener capacidad legal para celebrar este contrato según las leyes de su jurisdicción.</li>
            <li>No estar suspendido previamente de la plataforma por violación de términos.</li>
        </ul>
        <p>Usted es el único responsable de la confidencialidad de sus credenciales y de todas las actividades realizadas bajo su cuenta. Notifíquenos de inmediato cualquier acceso no autorizado.</p>

        <h3>3. Suscripciones, Planes y Pagos</h3>
        <p>Ofrecemos un plan gratuito con {TIER_CREDITS.gratis} créditos mensuales y tres planes pagos:</p>
        <PlanesDelContrato />
        <p>Todos los pagos se procesan mediante PayPal. La suscripción se renueva automáticamente al final de cada período (mensual o anual) salvo que usted la cancele desde Ajustes o desde su cuenta de PayPal antes de la fecha de renovación. Las cancelaciones surten efecto al final del período facturado en curso — no realizamos prorrateo de devolución por períodos parcialmente consumidos.</p>
        <p><strong>Reembolsos:</strong> las suscripciones <strong>no son reembolsables</strong>, salvo donde la ley aplicable lo exija. Puede cancelar en cualquier momento para detener las renovaciones futuras; conservará el acceso hasta el final del período ya pagado. El detalle está en la <strong>Política de Reembolsos y Cancelaciones</strong>.</p>
        <p>Reservamos el derecho de modificar los precios y planes con notificación previa de treinta (30) días para suscriptores existentes.</p>
        <p><strong>Aplicación para iPhone:</strong> si usted usa Bioboros desde la app de la App Store, esa app <strong>no vende suscripciones ni incluye ninguna compra</strong>: sólo refleja el plan que usted tenga contratado.{nativeHidesCommerce() ? ' Apple no interviene en el cobro ni en la gestión de su suscripción.' : ' Todas las suscripciones se contratan, renuevan y cancelan exclusivamente en bioboros.com a través de PayPal, según se describe en esta sección. Apple no interviene en el cobro ni en la gestión de su suscripción.'}</p>

        <h3>4. Uso Aceptable</h3>
        <p>Usted se compromete a NO:</p>
        <ul>
            <li>Realizar ingeniería inversa, descompilar o intentar derivar el código fuente del sistema.</li>
            <li>Extraer datos de forma masiva mediante scraping, bots, scrapers o cualquier técnica automatizada no autorizada.</li>
            <li>Intentar acceder a datos de otros usuarios, a la infraestructura interna, o a partes de la API no expuestas oficialmente.</li>
            <li>Usar el servicio para fines ilícitos, fraudulentos, o que infrinjan derechos de terceros.</li>
            <li>Compartir su cuenta con terceros, revender el acceso, o sublicenciar el servicio.</li>
            <li>Realizar ataques de denegación de servicio, abuso de rate limits, o intentos de evasión de cuotas.</li>
            <li>Inyectar instrucciones maliciosas (prompt injection) intentando manipular al agente de IA para acciones contrarias a estos términos.</li>
            <li>Subir contenido ilegal, contenido que infrinja derechos de autor, material sexual explícito o contenido violento a través del módulo de visión.</li>
        </ul>
        <p>El incumplimiento podrá resultar en suspensión inmediata sin reembolso.</p>

        <h3>5. Propiedad Intelectual</h3>
        <p>Todo el software, el código fuente, los modelos propietarios, los prompts diseñados para el agente, los algoritmos de validación nutricional, los esquemas de datos, los diseños de interfaz, el sistema de tipografía, los íconos personalizados, las marcas <em>Bioboros</em>, los logos y demás contenidos generados por la plataforma son propiedad exclusiva de Bioboros y están protegidos por las leyes de derechos de autor y propiedad industrial de República Dominicana e internacionales.</p>
        <p>Los planes nutricionales generados específicamente para usted son para su uso personal y no comercial. Puede compartir capturas o resúmenes para uso personal pero NO puede revenderlos, redistribuirlos masivamente, ni utilizarlos para entrenar modelos competidores.</p>

        <h3>6. Limitación de Responsabilidad</h3>
        <p>El servicio se entrega <em>"tal cual" y "según disponibilidad"</em>. Aunque hacemos esfuerzos razonables para mantener disponibilidad y precisión, <strong>Bioboros no garantiza</strong>:</p>
        <ul>
            <li>Que el servicio funcione sin interrupciones, sin errores, o sin retrasos.</li>
            <li>Que los planes generados produzcan resultados específicos de pérdida de peso, ganancia muscular u otros objetivos.</li>
            <li>La exactitud absoluta de cálculos nutricionales o macronutrientes, dado que la composición real de los alimentos puede variar.</li>
            <li>La disponibilidad de los modelos de IA de terceros ni la de otros proveedores subcontratados.</li>
        </ul>
        <p>En la máxima medida permitida por la ley, Bioboros no será responsable de daños indirectos, incidentales, especiales, consecuenciales o punitivos, ni de pérdidas de datos, ganancias o oportunidad. Nuestra responsabilidad total agregada por cualquier reclamación no excederá el monto pagado por usted en los últimos doce (12) meses.</p>
        <p><strong>Las recomendaciones nutricionales no constituyen consejo médico.</strong> Consulte el Aviso Médico para detalle.</p>

        <h3>7. Modificaciones del Servicio y de Estos Términos</h3>
        <p>Podremos modificar funcionalidades de la plataforma, añadir nuevas características, deprecar otras o ajustar la capacidad de modelos de IA disponibles, con previo aviso razonable cuando los cambios sean materiales. Estos Términos pueden actualizarse periódicamente; la versión vigente se publica siempre en esta página con su fecha. Para cambios materiales, le notificaremos por correo electrónico antes de su entrada en vigor.</p>

        <h3>8. Terminación</h3>
        <p>Usted puede cancelar su suscripción en cualquier momento desde Ajustes. Bioboros podrá terminar o suspender cuentas que violen estos Términos, incurran en fraude, o representen riesgo para otros usuarios o para la infraestructura. Tras la terminación, sus datos personales se eliminarán según se describe en la Política de Privacidad. Los registros de facturación necesarios para cumplimiento legal se conservarán por el plazo aplicable.</p>

        <h3>9. Ley Aplicable y Resolución de Disputas</h3>
        <p>Estos Términos se rigen por las leyes de la República Dominicana, incluyendo en lo pertinente la Ley 358-05 de Protección al Consumidor. Cualquier controversia que no pueda resolverse amistosamente será sometida a los tribunales competentes de la ciudad de Santo Domingo, Distrito Nacional.</p>

        <h3>10. Contacto</h3>
        <p>Para cualquier consulta legal, técnica o comercial puede escribirnos a <strong>bioboros.support@gmail.com</strong>.</p>
    </LegalLayout>
);

/* [P3-COOKIES-MERGE · 2026-06-30] La "Política de Cookies" se fusionó dentro de la
   Política de Privacidad (sección 13). El componente Cookies se eliminó; la ruta
   /cookies redirige a /privacy (App.jsx) para no romper enlaces ya indexados. */

/* ============================================================================
   AVISO MÉDICO
   ============================================================================ */
export const MedicalDisclaimer = () => (
    <LegalLayout title="Aviso Médico" lastUpdated="28 de Septiembre, 2026">
        <div className={styles.alertBox}>
            <p className={styles.alertTitle}>
                <AlertTriangle size={20} /> IMPORTANTE
            </p>
            <p className={styles.alertText}>
                Bioboros es una herramienta de apoyo nutricional generada por Inteligencia Artificial. <strong>No es un dispositivo médico, no diagnostica enfermedades, y no sustituye la atención de un profesional de la salud.</strong>
            </p>
        </div>

        <p>Esta sección explica con claridad qué es Bioboros desde el punto de vista médico, qué NO es, y cuándo debe usted necesariamente consultar a un profesional. Léala completa antes de seguir cualquier recomendación generada por nuestra plataforma.</p>

        <h3>1. Naturaleza de las Recomendaciones</h3>
        <p>Los planes de comidas, recetas, listas de compras, cálculos de macronutrientes y consejos del asistente conversacional son <strong>recomendaciones generales de carácter informativo y educativo</strong>, generadas algorítmicamente a partir de la información que usted nos proporciona (peso, altura, edad, género, objetivos, alergias declaradas y preferencias). Su precisión depende de la veracidad de esos datos.</p>
        <p>Nuestros cálculos siguen fórmulas nutricionales estándar (Mifflin-St Jeor para metabolismo basal, factor de actividad, balance de macronutrientes). Sin embargo, la composición real de los alimentos en cada caso particular puede variar según marca, preparación, frescura y origen, y los requerimientos individuales pueden divergir significativamente de los promedios poblacionales.</p>

        <h3>2. Lo que Bioboros NO Hace</h3>
        <ul>
            <li>NO diagnostica enfermedades, deficiencias nutricionales, intolerancias, alergias ni trastornos alimentarios.</li>
            <li>NO prescribe tratamientos médicos, suplementos, medicamentos ni terapias.</li>
            <li>NO sustituye la consulta con médicos generales, nutricionistas clínicos, endocrinólogos, gastroenterólogos, psicólogos especializados en alimentación, ni ningún otro profesional de la salud.</li>
            <li>NO interpreta resultados de laboratorio, estudios de composición corporal, ni señales clínicas.</li>
            <li>NO está certificada como dispositivo médico por la Dirección General de Drogas y Farmacias de República Dominicana, la FDA estadounidense, la EMA europea, ni ningún otro organismo regulatorio sanitario.</li>
            <li>NO está diseñada para el manejo de emergencias médicas.</li>
        </ul>

        <h3>3. Consulta Profesional Obligatoria</h3>
        <p>Antes de seguir cualquier plan generado por Bioboros, <strong>debe consultar a un profesional de la salud calificado</strong> si:</p>
        <ul>
            <li>Tiene <strong>diabetes</strong> (tipo 1, tipo 2 o gestacional), prediabetes, o resistencia a la insulina.</li>
            <li>Tiene <strong>enfermedad renal</strong> crónica o aguda, o restricciones de proteína prescritas.</li>
            <li>Tiene <strong>enfermedad cardiovascular</strong>, hipertensión, hipercolesterolemia, o usa medicación cardiovascular.</li>
            <li>Está <strong>embarazada, amamantando o planificando un embarazo</strong>.</li>
            <li>Tiene historial actual o pasado de <strong>trastornos alimentarios</strong> (anorexia, bulimia, atracones, ARFID, ortorexia).</li>
            <li>Tiene <strong>enfermedad celíaca</strong>, intolerancia severa al gluten, intolerancia confirmada a la lactosa, o cualquier alergia alimentaria diagnosticada (incluyendo frutos secos, maní, mariscos, pescado, soya, huevo, sulfitos, etc.).</li>
            <li>Tiene enfermedades hepáticas, problemas de tiroides, síndrome de ovario poliquístico, problemas digestivos crónicos (Crohn, colitis, SII) o cualquier condición metabólica.</li>
            <li>Toma <strong>medicación regular</strong> (anticoagulantes, antidepresivos, inmunosupresores, antibióticos prolongados, anticonvulsivos, tratamientos hormonales) — pueden existir interacciones con ciertos alimentos.</li>
            <li>Tiene historial de <strong>cirugía bariátrica</strong>, gastroplastía, o intervenciones quirúrgicas digestivas.</li>
            <li>Practica deporte de <strong>alto rendimiento competitivo</strong> (requerimientos especializados).</li>
            <li>Es <strong>menor de 18 años</strong> (este servicio está destinado a adultos).</li>
            <li>Es <strong>adulto mayor de 65 años</strong> con condiciones médicas múltiples.</li>
            <li>Recibe tratamiento <strong>oncológico</strong> activo.</li>
        </ul>
        <p>Esta lista no es exhaustiva. Ante cualquier duda razonable, priorice siempre el consejo de un profesional calificado.</p>

        <h3>4. Limitaciones Específicas de la Inteligencia Artificial</h3>
        <p>Nuestro motor de IA, aunque sofisticado, tiene limitaciones inherentes que debe conocer:</p>
        <ul>
            <li>Puede ocasionalmente cometer errores de cálculo nutricional o sugerir combinaciones subóptimas. Validamos automáticamente coherencia entre recetas y lista de compras, pero ningún sistema es infalible.</li>
            <li>Puede no reconocer todas las contraindicaciones específicas de su caso si usted no las declara explícitamente.</li>
            <li>Su capacidad de análisis está acotada a la información provista; no realiza diagnóstico médico subyacente.</li>
            <li>Los modelos generativos sobre los que operamos pueden, en raras ocasiones, "alucinar" datos. Nuestros sistemas de validación reducen esto, pero no lo eliminan al 100%.</li>
        </ul>

        <h3>5. No Establecimiento de Relación Médico-Paciente</h3>
        <p>El uso de Bioboros <strong>no establece una relación médico-paciente, terapéutica, ni profesional</strong> entre usted y Bioboros, sus empleados, contratistas, accionistas o desarrolladores. No somos su nutricionista, su médico, ni su psicólogo.</p>

        <h3>6. Emergencias Médicas</h3>
        <p>Si experimenta <strong>una emergencia médica</strong> — incluyendo, sin limitación: reacción alérgica severa, dolor de pecho, dificultad para respirar, hipoglucemia, deshidratación severa, pensamientos suicidas o ideación de autolesión, vómito persistente, signos de shock anafiláctico, o cualquier signo de gravedad — <strong>no use Bioboros para resolverla</strong>. Llame de inmediato al número de emergencias del lugar donde se encuentre, acuda a la sala de emergencia más cercana, o contacte a su médico tratante. En los países donde Bioboros está disponible, ese número es el <strong>9-1-1</strong> en República Dominicana; el <strong>911</strong> en Estados Unidos, Puerto Rico y México; el <strong>112</strong> en España; y el <strong>123</strong> en Colombia. Si se encuentra en cualquier otro país, use el número de emergencias local.</p>

        <h3>7. Exención de Responsabilidad</h3>
        <p>Usted reconoce y acepta que la decisión de seguir cualquier plan, recomendación o sugerencia provista por Bioboros es <strong>exclusivamente suya</strong>. En la máxima medida permitida por la ley, Bioboros no asume responsabilidad alguna por consecuencias adversas para la salud, alteraciones nutricionales, reacciones alérgicas o cualquier otro perjuicio que pudiera resultar del uso de la plataforma sin consulta profesional previa.</p>

        <h3>8. Comunicación de Errores Nutricionales</h3>
        <p>Si detecta un error específico en un cálculo, una combinación de alimentos potencialmente peligrosa, o cualquier recomendación que considere inadecuada, le pedimos reportarla a <strong>bioboros.support@gmail.com</strong>. Tomamos en serio cada reporte y los usamos para mejorar la calibración de nuestros sistemas de validación.</p>
    </LegalLayout>
);

/* ============================================================================
   POLÍTICA DE PROTECCIÓN DE DATOS (Ley 172-13)
   ============================================================================ */
export const DataProtection = () => (
    <LegalLayout title="Política de Protección de Datos" lastUpdated="29 de Septiembre, 2026">
        <p>Esta Política desarrolla los derechos que la legislación de protección de datos le reconoce sobre su información personal y le explica, paso a paso, cómo ejercerlos en Bioboros. Complementa nuestra <strong>Política de Privacidad</strong> (qué datos tratamos) centrándose en <strong>sus derechos como titular</strong> de esos datos.</p>

        <h3>1. Marco Legal Aplicable</h3>
        <p>Bioboros opera desde República Dominicana y trata sus datos conforme a la <strong>Ley No. 172-13 sobre Protección Integral de los Datos Personales</strong>, así como, en lo pertinente, la Ley No. 358-05 de Protección al Consumidor y la Ley No. 126-02 sobre Comercio Electrónico, Documentos y Firmas Digitales.</p>
        <p>Bioboros está disponible también en <strong>España, Estados Unidos, México, Puerto Rico y Colombia</strong>. Si usted reside en una de esas jurisdicciones, le reconocemos además los derechos que le otorga su normativa local, y ésta prevalece sobre la dominicana en lo que le resulte más favorable:</p>
        <ul>
            <li><strong>España y resto de la Unión Europea:</strong> el <strong>Reglamento General de Protección de Datos (RGPD, Reglamento (UE) 2016/679)</strong> y la Ley Orgánica 3/2018. Sus datos de salud son una categoría especial (art. 9) que tratamos sobre la base de su <strong>consentimiento explícito</strong> al completar el formulario, que puede retirar en cualquier momento. Tiene derecho de acceso, rectificación, supresión («derecho al olvido»), limitación, portabilidad y oposición, y a reclamar ante la Agencia Española de Protección de Datos (AEPD) o la autoridad de su país. Las transferencias fuera del Espacio Económico Europeo se amparan en Cláusulas Contractuales Estándar o en el Marco de Privacidad de Datos UE-EE. UU. para los proveedores adheridos (ver Sección 6).</li>
            <li><strong>Estados Unidos y Puerto Rico:</strong> las leyes estatales de privacidad que le sean aplicables (por ejemplo, la CCPA/CPRA en California), que le reconocen el derecho a saber qué datos tenemos, a borrarlos y a no ser discriminado por ejercer esos derechos. <strong>No vendemos ni compartimos sus datos personales</strong> en el sentido de esas leyes.</li>
            <li><strong>México:</strong> la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), incluidos los derechos ARCO.</li>
            <li><strong>Colombia:</strong> la Ley 1581 de 2012 y sus decretos reglamentarios.</li>
        </ul>
        <p>Si ampliamos el servicio a otros países, respetaremos la normativa de protección de datos aplicable a sus residentes y lo reflejaremos aquí.</p>
        <p>El texto íntegro y vigente de esta política vive en bioboros.com; esta página es una copia de cortesía.</p>

        <h3>2. Responsable del Tratamiento</h3>
        <p>El responsable es <strong>Bioboros</strong>, plataforma operada desde República Dominicana. Punto de contacto para cualquier asunto de datos personales: <strong>bioboros.support@gmail.com</strong>.</p>

        <h3>3. Sus Derechos como Titular</h3>
        <p>Usted, como titular de los datos, tiene en todo momento derecho a:</p>
        <ul>
            <li><strong>Acceso:</strong> conocer qué datos personales tenemos sobre usted, su origen y las finalidades de su tratamiento.</li>
            <li><strong>Rectificación:</strong> corregir datos inexactos, incompletos o desactualizados.</li>
            <li><strong>Cancelación / Supresión:</strong> solicitar la eliminación de sus datos cuando ya no sean necesarios, retire su consentimiento o considere que se tratan indebidamente.</li>
            <li><strong>Oposición:</strong> oponerse al tratamiento de sus datos para finalidades distintas a la ejecución del contrato (por ejemplo, mejora del producto o investigación).</li>
            <li><strong>Revocación del consentimiento:</strong> retirar, sin efecto retroactivo, cualquier consentimiento que nos haya otorgado.</li>
            <li><strong>Portabilidad:</strong> obtener una copia de sus datos en un formato estructurado y legible por máquina (JSON).</li>
            <li><strong>No quedar sujeto a decisiones únicamente automatizadas:</strong> los planes los genera un sistema automatizado, pero son una herramienta de apoyo que usted revisa y decide seguir o no; puede solicitar intervención humana escribiéndonos.</li>
        </ul>

        <h3>4. Cómo Ejercer sus Derechos</h3>
        <p>Ofrecemos vías directas, gratuitas y sin formalismos excesivos:</p>
        <ul>
            <li><strong>Acceso y rectificación inmediatos:</strong> edite su perfil, peso, objetivos, condiciones y preferencias directamente desde <strong>Ajustes</strong> en la aplicación.</li>
            <li><strong>Eliminación autoservicio:</strong> puede borrar su cuenta y todos los datos asociados desde la propia app; la eliminación dispara un borrado en cascada sobre todas las tablas vinculadas a su identificador; lo que se conserva después, y por qué, está en la Política de Privacidad (Sección 9).</li>
            <li><strong>Solicitudes por correo:</strong> para acceso detallado, portabilidad (exportación JSON), oposición o cualquier otro derecho, escriba a <strong>bioboros.support@gmail.com</strong> desde el correo asociado a su cuenta. Respondemos en un plazo máximo de <strong>treinta (30) días</strong>.</li>
        </ul>
        <p>No le cobramos por ejercer estos derechos. Podremos pedirle verificar su identidad para proteger su cuenta frente a solicitudes fraudulentas.</p>

        <h3>5. Datos Sensibles de Salud</h3>
        <p>Su perfil incluye datos de salud (peso, condiciones declaradas como diabetes o enfermedad renal, alergias) que la Ley 172-13 considera <strong>datos sensibles</strong>. Los tratamos para prestarle el servicio —generar y ajustar su plan nutricional y responderle en el coach— y, solo en las cuentas de prueba (avisadas en la app), para probar y mejorar el servicio, con la finalidad limitada que usted consiente al completar el formulario, y nunca para publicidad. Los reciben los proveedores de inferencia que producen y revisan su plan y mueven la conversación con el coach, y Cohere, que mantiene la memoria del coach y recibe un resumen de su perfil al generar su plan. Además, el texto de un aviso —que entregan en su dispositivo <strong>Firebase Cloud Messaging</strong> (Android) o Apple Push Notification service (iPhone)— puede mencionar su plan o su salud, y la analítica de producto (PostHog) puede recibir el texto de una opción de salud que usted marque en el formulario. Si usa el dictado del coach, lo que usted dice lo convierte en texto el servicio de voz de su navegador o dispositivo, que según el navegador lo procesa en servidores de su fabricante (por ejemplo, Google o Apple), bajo sus propios términos; a Bioboros sólo llega el texto. En el modo voz, el texto de las respuestas del coach se envía a Google (API de Gemini) para leerlas en voz alta; si ese servicio no está disponible, las lee la voz de su navegador o dispositivo, que según el navegador puede procesar ese texto en servidores de su fabricante. Su voz no se envía a la API de Gemini. El detalle está en la Política de Privacidad (Secciones 2, 7 y 8) y en la Política de Uso de IA.</p>

        <h3>6. Transferencias Internacionales</h3>
        <p>Para generar y revisar su plan, parte de su perfil se procesa en servidores de nuestros proveedores de inteligencia artificial, <strong>DeepSeek</strong> (República Popular China) y <strong>OpenAI</strong> (Estados Unidos), y, si usa el modo voz en vivo, OpenAI también procesa el audio de su micrófono y las respuestas del coach. Las fotos que usted escanea o envía al chat las analiza <strong>Google</strong> con su modelo <strong>Gemini</strong> (principalmente en Estados Unidos), que en el modo voz también convierte en voz el texto de las respuestas del coach. El resto de nuestros encargados opera principalmente en Estados Unidos, incluida la analítica de producto (PostHog). Todo ello constituye una transferencia internacional de datos. Nunca enviamos a los proveedores de inteligencia artificial su correo ni sus datos de pago. Si usted reside en la Unión Europea, estas transferencias se amparan en Cláusulas Contractuales Estándar de la Comisión Europea o, para los proveedores estadounidenses adheridos, en el Marco de Privacidad de Datos UE-EE. UU. El detalle de qué recibe cada proveedor está en la <strong>Política de Uso de Inteligencia Artificial</strong>.</p>

        <h3>7. Medidas de Seguridad</h3>
        <p>Aplicamos cifrado en tránsito (TLS) y en reposo, aislamiento estricto por identificador de usuario en cada consulta a la base de datos (con tests automatizados que enforzan que ninguna consulta acceda a datos de otro usuario), autenticación con tokens firmados criptográficamente, y acceso sin contraseña (código de un solo uso al correo, o Google). El detalle técnico está en la Política de Privacidad.</p>

        <h3>8. Reclamaciones</h3>
        <p>Si considera que el tratamiento de sus datos no se ajusta a la normativa, le pedimos contactarnos primero a <strong>bioboros.support@gmail.com</strong> para resolverlo. Sin perjuicio de ello, usted conserva el derecho de presentar una reclamación ante la autoridad de control competente en materia de protección de datos de su jurisdicción.</p>

        <h3>9. Cambios en esta Política</h3>
        <p>Publicaremos cualquier actualización en esta página con su nueva fecha de "Última actualización". Si los cambios son materiales, se lo notificaremos por correo electrónico.</p>
    </LegalLayout>
);

/* ============================================================================
   POLÍTICA DE USO DE INTELIGENCIA ARTIFICIAL
   ============================================================================ */
export const AIUse = () => (
    <LegalLayout title="Política de Uso de Inteligencia Artificial" lastUpdated="28 de Septiembre, 2026">
        <p>Bioboros usa inteligencia artificial de forma central en su producto. Creemos que debe saber, con transparencia, dónde interviene la IA, qué datos suyos utiliza, cuáles son sus límites y qué control conserva usted sobre las decisiones. Esta política lo explica.</p>

        <h3>1. Dónde Usamos IA</h3>
        <ul>
            <li><strong>Generación de tu plan:</strong> un sistema de orquestación coordina varios pasos —generación, cálculo determinista de macronutrientes, validación y guardas clínicas— para producir tu plan diario, recetas y lista de compras.</li>
            <li><strong>Revisión clínica:</strong> un segundo modelo comprueba que el plan respete tus condiciones de salud, medicamentos y alergias antes de entregártelo.</li>
            <li><strong>Coach conversacional:</strong> el asistente responde preguntas, cambia comidas, regenera días y registra tu consumo, recalculando con el motor determinista.</li>
            <li><strong>Escáner de comida:</strong> puedes fotografiar un plato para que la IA identifique los alimentos y estime sus macros; tú revisas y confirmas antes de guardarlo en tu diario. La foto del escáner no se guarda en nuestros servidores una vez analizada; la app guarda una copia sólo en tu dispositivo, para la ficha de esa comida. Las fotos que envías al chat del coach sí se guardan, de forma privada, junto a esa conversación (ver la Política de Privacidad).</li>
            <li><strong>Dictado y modo voz:</strong> puedes dictarle al coach con el micrófono o conversar con él en voz alta. El dictado convierte tu voz en texto en tu propio dispositivo o navegador: a Bioboros sólo llega el texto, como cualquier otro mensaje, y tu voz no se envía. Según el navegador, su fabricante (por ejemplo, Google en Chrome o Apple en Safari y en el iPhone) puede procesar en sus servidores lo que dices, bajo sus propios términos. En el modo voz, para leerte en voz alta la respuesta del coach, enviamos el texto de esa respuesta a Google (API de Gemini, servicio de pago que, según sus condiciones, no usa esos datos para entrenar sus modelos) y reproducimos el audio que devuelve. Si ese servicio no está disponible, se usa la voz de tu dispositivo o navegador, que, según el navegador o el dispositivo, puede generarse en servidores de su fabricante (por ejemplo, Google en Chrome) a partir del mismo texto, bajo sus propios términos.</li>
        </ul>

        <h3>2. Modelos Confidenciales y en Evolución — y Qué Datos Viajan</h3>
        <p>Orquestamos <strong>varios modelos de IA de última generación</strong> de proveedores externos. La identidad, versión y combinación exacta de esos modelos es <strong>información confidencial de Bioboros</strong> (secreto comercial): los evaluamos y rotamos constantemente para darte el mejor resultado, por lo que <strong>pueden cambiar sin previo aviso</strong>. Todo cambio de modelo pasa por la misma barra de calidad, validación determinista y guardas clínicas descritas en esta política.</p>
        <p>Lo que sí divulgamos siempre es <strong>quién recibe tus datos</strong>. Hoy son cuatro proveedores de IA: <strong>DeepSeek</strong> genera partes de tu plan, mueve la conversación con el coach y estima las macros de las comidas que anotas por escrito en tu diario (también las correcciones que escribes al escanear una); <strong>OpenAI</strong> genera días de tu plan, hace la revisión clínica, actúa como respaldo cuando DeepSeek no responde y, en el modo voz en vivo, recibe el audio de tu micrófono y las respuestas del coach para escucharte y responderte; <strong>Google</strong>, con su modelo <strong>Gemini</strong>, <strong>analiza las fotos que escaneas o envías al chat</strong> y, en el modo voz, <strong>lee en voz alta las respuestas del coach</strong>; y <strong>Cohere</strong> convierte textos en embeddings vectoriales para que el coach y tu plan recuerden lo relevante (no genera respuestas): recibe las notas que el coach guarda sobre ti, la búsqueda que hace a partir de tu mensaje, un resumen de tu perfil (objetivo, alergias, condiciones de salud, dieta, alimentos que no te gustan y obstáculos) al generar tu plan, la descripción de las comidas que escaneas para tu diario y un resumen de las comidas que sueles dejar sin registrar, para ajustar los recordatorios. Los demás encargados que tratan tus datos —base de datos, pagos, avisos y analítica— están en la Política de Privacidad. Si añadiéramos o sustituyéramos un proveedor, actualizaremos esta política y la Política de Protección de Datos antes. Para producir tu plan y responderte en el coach les enviamos únicamente lo necesario:</p>
        <ul>
            <li>Tu perfil de salud (peso, estatura, edad, género, nivel de actividad, condiciones, medicamentos y restricciones declaradas).</li>
            <li>Tus preferencias y los alimentos que te gustan o no.</li>
            <li>El historial reciente de tu conversación con el asistente.</li>
            <li>El nombre de tu cuenta, para que el coach se dirija a ti.</li>
            <li>Las comidas que anotes por escrito en tu diario y las correcciones que escribas al escanear una, para estimar sus macros (sólo a DeepSeek).</li>
            <li>Las fotos de comida que decidas escanear y las fotos que envíes al chat, con lo que escribas para aclararlas (sólo a Google).</li>
            <li>El audio de tu micrófono y las respuestas del coach, si usas el modo voz en vivo (a OpenAI); el texto de las respuestas que se leen con la voz de respaldo (a Google).</li>
        </ul>
        <p><strong>NUNCA</strong> enviamos a los proveedores tu correo electrónico ni tus datos de pago. Cada proveedor trata estos datos bajo sus propios términos; los servidores de DeepSeek están en la República Popular China, y los de OpenAI y Google, principalmente en Estados Unidos (ver «Transferencias Internacionales» en la Política de Protección de Datos).</p>

        <h3>3. No Entrenamos Modelos con tus Datos</h3>
        <p>No usamos tus datos personales para entrenar modelos de IA propios ni de terceros, ni los vendemos. La «memoria a largo plazo» del coach se basa en información privada de TU cuenta y no se cruza ni se agrega con la de otros usuarios.</p>

        <h3>4. Límites de la IA</h3>
        <p>La IA es potente pero no infalible. Debes conocer sus límites:</p>
        <ul>
            <li>Los modelos generativos pueden, en raras ocasiones, producir datos incorrectos o «alucinar». Para mitigarlo, sobre la generación corre un <strong>motor determinista</strong> que calcula y cuadra los macronutrientes (no los estima a ojo) y valida la coherencia entre recetas y lista de compras — pero ningún sistema elimina el riesgo al 100%.</li>
            <li>La calidad de las recomendaciones depende de la veracidad de los datos que nos proporcionas.</li>
            <li>La IA no realiza diagnóstico médico ni reemplaza a un profesional de la salud.</li>
        </ul>

        <h3>5. Supervisión Humana y Decisiones Automatizadas</h3>
        <p>El plan se genera de forma automatizada, pero es una <strong>herramienta de apoyo</strong>: tú decides si lo sigues, lo ajustas o lo descartas, y revisas las estimaciones (por ejemplo, al escanear una comida) antes de guardarlas. Conforme a la Ley 172-13, tienes derecho a no quedar sujeto a decisiones basadas únicamente en tratamiento automatizado que produzcan efectos significativos: puedes solicitar intervención humana o aclaraciones escribiéndonos a <strong>bioboros.support@gmail.com</strong>.</p>

        <h3>6. No Es Consejo Médico</h3>
        <p>Las recomendaciones generadas por IA son informativas y educativas, <strong>no constituyen consejo médico</strong> ni establecen una relación médico-paciente. Si tienes una condición de salud, consulta a un profesional. Lee el <strong>Aviso Médico</strong> para el detalle completo.</p>

        <h3>7. Mejora Continua</h3>
        <p>Trabajamos constantemente en mejorar la precisión y seguridad de nuestros sistemas. El uso de datos para mejorar el producto y para investigación se rige por la <strong>Política de Investigación</strong>, con las salvaguardas allí descritas.</p>

        <h3>8. Contacto</h3>
        <p>¿Dudas sobre cómo usamos la IA? Escríbenos a <strong>bioboros.support@gmail.com</strong>.</p>
    </LegalLayout>
);

/* ============================================================================
   POLÍTICA DE INVESTIGACIÓN
   ============================================================================ */
export const Research = () => (
    <LegalLayout title="Investigación" lastUpdated="30 de Junio, 2026">
        <p>Para que Bioboros sea cada vez más preciso y útil, analizamos cómo funciona el sistema sobre el uso real. Esta Política explica qué entendemos por «investigación», qué datos usamos para ello, cómo los protegemos, y —sobre todo— qué control conservas tú. Nuestro principio es claro: <strong>mejorar el producto sin comprometer tu privacidad ni tus datos sensibles de salud.</strong></p>

        <h3>1. Qué Entendemos por Investigación</h3>
        <p>Bajo «investigación» incluimos:</p>
        <ul>
            <li><strong>Mejora del motor:</strong> medir la precisión de los planes (qué tan cerca quedan de los objetivos de macronutrientes), la tasa de éxito de la generación y los errores, para corregir y calibrar nuestros sistemas.</li>
            <li><strong>Investigación nutricional agregada:</strong> entender patrones generales (por ejemplo, qué tan bien se cubren ciertos micronutrientes en una población de planes) para mejorar nuestras reglas y catálogos.</li>
            <li><strong>Calidad y seguridad:</strong> detectar combinaciones problemáticas, sesgos o fallos para hacer el servicio más seguro.</li>
        </ul>

        <h3>2. Qué Datos Usamos y Cómo los Protegemos</h3>
        <p>Para investigación trabajamos preferentemente con datos <strong>agregados, anonimizados o seudonimizados</strong> — es decir, métricas y estadísticas que no te identifican (por ejemplo, «el X% de los planes quedó dentro de la banda de proteína»). Aplicamos minimización de datos: usamos lo mínimo necesario para la finalidad de mejora.</p>

        <h3>3. Datos Sensibles de Salud — Exención y Consentimiento</h3>
        <p>Tu perfil de salud (condiciones, alergias, peso) es <strong>dato sensible</strong> bajo la Ley 172-13. Por defecto, <strong>NO usamos tus datos sensibles de salud de forma identificable para investigación sin tu consentimiento expreso</strong>. Cualquier uso para mejora del producto se hace sobre datos disociados de tu identidad. Si en el futuro propusiéramos un estudio que requiera datos identificables, te lo pediríamos de forma separada, específica e informada, y podrías negarte sin afectar tu servicio.</p>

        <h3>4. Lo que NO Hacemos</h3>
        <ul>
            <li>No vendemos tus datos ni los cedemos a terceros con fines comerciales o publicitarios.</li>
            <li>No usamos tus datos para entrenar modelos de IA propios ni de terceros.</li>
            <li>No publicamos información que permita identificarte. Cualquier hallazgo que difundamos será agregado y anónimo.</li>
        </ul>

        <h3>5. La Memoria del Coach es Tuya</h3>
        <p>La «memoria a largo plazo» del asistente (lo que recuerda de tus gustos y progreso) es una función de <strong>personalización privada de TU cuenta</strong>, no un mecanismo de investigación entre usuarios. No se cruza ni se agrega con datos de otras personas.</p>

        <h3>6. Tu Control (Oposición y Opt-out)</h3>
        <p>Puedes oponerte a que tus datos —incluso de forma anonimizada— se usen para mejora del producto e investigación, escribiéndonos a <strong>bioboros.support@gmail.com</strong>. Oponerte no afecta tu capacidad de usar el servicio. También puedes ejercer el resto de tus derechos según la <strong>Política de Protección de Datos</strong>.</p>

        <h3>7. Base Legal</h3>
        <p>El tratamiento para mejora del producto se ampara en nuestro interés legítimo de ofrecer un servicio preciso y seguro, ponderado con tus derechos y limitado a datos no sensibles o disociados. Para cualquier investigación con datos sensibles identificables, la base será tu <strong>consentimiento expreso</strong>.</p>

        <h3>8. Cambios y Contacto</h3>
        <p>Publicaremos cualquier actualización en esta página con su nueva fecha. Para preguntas sobre cómo investigamos y mejoramos, escríbenos a <strong>bioboros.support@gmail.com</strong>.</p>
    </LegalLayout>
);

/* ============================================================================
   POLÍTICA DE REEMBOLSOS Y CANCELACIONES
   ============================================================================ */
export const Refunds = () => (
    <LegalLayout title="Política de Reembolsos y Cancelaciones" lastUpdated="18 de Agosto, 2026">
        <p>Esta Política detalla cómo funcionan las cancelaciones y los reembolsos de tu suscripción a Bioboros. Queremos que sea clara y justa, conforme a la Ley No. 358-05 de Protección al Consumidor de República Dominicana. En resumen: puedes <strong>probar gratis</strong> antes de pagar y <strong>cancelar cuando quieras</strong>; las suscripciones <strong>no son reembolsables</strong>, salvo donde la ley lo exija.</p>

        <h3>1. Plan Gratis</h3>
        <p>El Plan Gratis no tiene costo ni requiere tarjeta. Puedes dejar de usarlo cuando quieras, sin cargos ni compromisos.</p>

        <h3>2. Cómo Cancelar tu Suscripción</h3>
        <p>Puedes cancelar en cualquier momento desde <strong>Ajustes</strong> en la app o directamente desde tu cuenta de <strong>PayPal</strong>. La cancelación:</p>
        <ul>
            <li>Detiene las futuras renovaciones automáticas.</li>
            <li>Surte efecto <strong>al final del período ya facturado</strong> (mensual o anual): conservas el acceso de pago hasta esa fecha.</li>
            <li>No genera prorrateo ni devolución por los días no usados del período en curso.</li>
        </ul>

        <h3>3. Reembolsos</h3>
        <p>Las suscripciones de Bioboros (Básico, Plus y Max) <strong>no son reembolsables</strong>, salvo donde la ley aplicable lo exija. Esto aplica tanto a la compra inicial como a las renovaciones. En lugar de reembolsos ofrecemos:</p>
        <ul>
            <li>Un <strong>Plan Gratis</strong> para que evalúes la plataforma sin costo ni tarjeta antes de suscribirte.</li>
            <li><strong>Cancelar cuando quieras</strong> para detener cobros futuros: conservas el acceso hasta el final del período ya pagado y no cobramos renovaciones posteriores.</li>
        </ul>
        <p>Te recomendamos cancelar antes de tu fecha de renovación si no deseas continuar.</p>

        <h3>4. Excepciones Legales</h3>
        <p>Cuando la Ley No. 358-05 de Protección al Consumidor u otra normativa aplicable te reconozca un derecho de reembolso o de retracto en un caso concreto, lo respetaremos. Si consideras que te corresponde, escríbenos a <strong>bioboros.support@gmail.com</strong> desde el correo asociado a tu cuenta, indicando el plan y la fecha de compra; revisaremos tu solicitud y, cuando proceda, acreditaremos el reembolso por la misma vía de pago (PayPal).</p>

        <h3>5. Renovación Automática</h3>
        <p>Las suscripciones se renuevan automáticamente al final de cada período hasta que las canceles. Te recomendamos revisar tu fecha de renovación en Ajustes o en PayPal. Si modificamos los precios, te avisaremos con al menos <strong>treinta (30) días</strong> de anticipación antes de que el nuevo precio aplique a tu renovación.</p>

        <h3>6. Pagos por PayPal</h3>
        <p>Todos los pagos se procesan a través de PayPal. Bioboros no almacena tu número de tarjeta ni datos financieros. Validamos del lado del servidor que el plan reportado por PayPal coincida con el que seleccionaste.</p>

        <h3>7. Disputas</h3>
        <p>Si tienes un problema con un cobro, contáctanos primero a <strong>bioboros.support@gmail.com</strong> — la mayoría se resuelve rápido. Conservas tus derechos como consumidor bajo la Ley 358-05 y la posibilidad de acudir a las instancias de protección al consumidor que correspondan.</p>

        <h3>8. Contacto</h3>
        <p>Para cualquier asunto de facturación, cancelaciones o reembolsos: <strong>bioboros.support@gmail.com</strong>. Respondemos en menos de 24 horas.</p>
    </LegalLayout>
);

/* ============================================================================
   POLÍTICA DE USO ACEPTABLE
   ============================================================================ */
export const AcceptableUse = () => (
    <LegalLayout title="Política de Uso" lastUpdated="28 de Septiembre, 2026">
        <p>Esta Política de Uso establece las reglas para utilizar Bioboros de forma responsable, segura y justa para todos. Complementa nuestros <strong>Términos de Servicio</strong> (donde se detalla la relación contractual completa) y se aplica a cualquier persona que acceda a la plataforma, ya sea con plan gratuito, de pago o en modo invitado. Al usar Bioboros, usted acepta cumplir estas reglas.</p>

        <h3>1. Quién Puede Usar la Plataforma</h3>
        <p>Bioboros está destinada a personas <strong>mayores de 18 años</strong>, para su uso personal y no comercial. Usted es responsable de la confidencialidad de sus credenciales y de toda la actividad realizada bajo su cuenta. Si detecta un acceso no autorizado, notifíquenos de inmediato a <strong>bioboros.support@gmail.com</strong>.</p>

        <h3>2. Uso Permitido</h3>
        <p>Puede usar Bioboros para:</p>
        <ul>
            <li>Generar y ajustar planes de comidas personalizados para usted.</li>
            <li>Consultar al asistente conversacional sobre su nutrición, cambiar comidas y registrar su consumo.</li>
            <li>Analizar fotos de comida que usted decida compartir.</li>
            <li>Gestionar su nevera, su lista de compras y su historial de planes.</li>
            <li>Compartir capturas o resúmenes de su plan para uso personal.</li>
        </ul>

        <h3>3. Conductas Prohibidas</h3>
        <p>Para proteger el servicio, la seguridad de los demás usuarios y la integridad de la plataforma, usted se compromete a <strong>NO</strong>:</p>
        <ul>
            <li><strong>Acceder a datos ajenos:</strong> intentar leer, modificar o eliminar información de otros usuarios, o sortear los controles de aislamiento por cuenta.</li>
            <li><strong>Atacar la infraestructura:</strong> realizar ataques de denegación de servicio, abuso de los límites de uso (rate limits), evasión de cuotas, o sondeos de partes no públicas de la API.</li>
            <li><strong>Extraer datos de forma masiva:</strong> usar scraping, bots, scrapers o cualquier técnica automatizada no autorizada para recolectar contenido de la plataforma.</li>
            <li><strong>Ingeniería inversa:</strong> descompilar, desensamblar o intentar derivar el código fuente, los modelos, los prompts o los algoritmos de validación.</li>
            <li><strong>Manipular la IA (prompt injection):</strong> inyectar instrucciones maliciosas para inducir al asistente a actuar fuera de estos términos, revelar información de otros usuarios o eludir nuestras guardas de seguridad.</li>
            <li><strong>Compartir o revender el acceso:</strong> ceder, prestar, revender o sublicenciar su cuenta o el servicio a terceros.</li>
            <li><strong>Subir contenido prohibido</strong> a través del módulo de visión o del chat: material ilegal, que infrinja derechos de autor, contenido sexual explícito, violento o de odio.</li>
            <li><strong>Usar el servicio con fines ilícitos o fraudulentos</strong>, o que infrinjan derechos de terceros o la legislación dominicana aplicable.</li>
            <li><strong>Usar los planes generados para entrenar modelos competidores</strong> o para redistribuirlos masivamente.</li>
            <li><strong>Suplantar identidad</strong> o proporcionar información falsa en el registro o en su perfil de salud (esto último, además, degrada la calidad y seguridad de su plan).</li>
        </ul>

        <h3>4. Uso Justo de la Inteligencia Artificial</h3>
        <p>La generación de planes y el asistente consumen recursos de cómputo y de nuestros proveedores de IA. Por eso aplicamos cuotas mensuales por plan (el plan gratuito incluye {TIER_CREDITS.gratis} créditos) y límites de frecuencia para prevenir abuso. Estos límites buscan un uso razonable y personal; el uso automatizado, comercial no autorizado o que degrade el servicio para otros está prohibido y puede dar lugar a restricciones.</p>

        <h3>5. Contenido que Usted Aporta</h3>
        <p>Usted es responsable del contenido que introduce: texto libre en el formulario y el chat, y fotos de comida. Al subirlo, declara que tiene derecho a hacerlo y que no infringe la ley ni derechos de terceros. Procesamos ese contenido únicamente para prestarle el servicio, según se describe en la <strong>Política de Privacidad</strong> y la <strong>Política de Uso de Inteligencia Artificial</strong>.</p>

        <h3>6. Seguridad e Informe de Vulnerabilidades</h3>
        <p>No intente vulnerar la seguridad de la plataforma. Si descubre una vulnerabilidad o un comportamiento que considere inseguro, le pedimos reportarlo de forma responsable a <strong>bioboros.support@gmail.com</strong> antes de divulgarlo públicamente. Agradecemos y tomamos en serio estos reportes.</p>

        <h3>7. Consecuencias del Incumplimiento</h3>
        <p>El incumplimiento de esta Política puede dar lugar, según su gravedad, a: advertencias, limitación temporal de funciones, suspensión o terminación de la cuenta —<strong>sin derecho a reembolso</strong>— y, cuando corresponda, a las acciones legales pertinentes. Nos reservamos el derecho de actuar de inmediato ante conductas que pongan en riesgo a otros usuarios o a la infraestructura.</p>

        <h3>8. No Es Consejo Médico</h3>
        <p>El uso del servicio no sustituye la consulta con un profesional de la salud. Las recomendaciones son informativas y educativas. Lea el <strong>Aviso Médico</strong> para el detalle completo.</p>

        <h3>9. Relación con Otras Políticas</h3>
        <p>Esta Política de Uso se interpreta junto con los <strong>Términos de Servicio</strong>, la <strong>Política de Privacidad</strong>, la <strong>Política de Protección de Datos</strong>, la <strong>Política de Uso de Inteligencia Artificial</strong> y el <strong>Aviso Médico</strong>. En caso de conflicto entre documentos sobre un mismo asunto, prevalecen los Términos de Servicio.</p>

        <h3>10. Cambios y Contacto</h3>
        <p>Podremos actualizar esta Política para reflejar cambios en el servicio o en la normativa. La versión vigente se publica siempre en esta página con su fecha de "Última actualización". Para cualquier duda sobre el uso aceptable de la plataforma, escríbanos a <strong>bioboros.support@gmail.com</strong>.</p>
    </LegalLayout>
);

/* [P3-ABOUT-PAGE-ABSTRACT · 2026-06-30] El componente About se movió a su propia página
   con estética abstracta: ver frontend/src/pages/AboutPage.jsx. Ya no vive aquí. */

/* ============================================================================
   POLÍTICA DE DIVULGACIÓN RESPONSABLE (SEGURIDAD)
   [P3-RESPONSIBLE-DISCLOSURE · 2026-06-30] Política de reporte coordinado de
   vulnerabilidades. Companion: /.well-known/security.txt (RFC 9116) la referencia.
   ============================================================================ */
export const ResponsibleDisclosure = () => (
    <LegalLayout title="Política de Divulgación Responsable" lastUpdated="30 de Junio, 2026">
        <p>En Bioboros la seguridad de tus datos —especialmente tu información de salud— es una prioridad. Agradecemos a la comunidad de investigadores de seguridad que nos ayuda a proteger a nuestros usuarios. Esta Política explica cómo reportarnos una vulnerabilidad de forma responsable y qué puedes esperar de nosotros a cambio.</p>

        <h3>1. Cómo Reportar una Vulnerabilidad</h3>
        <p>Si descubres una vulnerabilidad de seguridad, escríbenos a <strong>bioboros.support@gmail.com</strong> con el asunto <em>«Reporte de seguridad»</em>. Para ayudarnos a reproducir y corregir el problema rápido, incluye en lo posible:</p>
        <ul>
            <li>Una descripción clara de la vulnerabilidad y su posible impacto.</li>
            <li>Los pasos detallados para reproducirla (URL, parámetros, capturas o un video corto).</li>
            <li>El navegador, sistema operativo o herramienta que usaste.</li>
            <li>Cualquier sugerencia de mitigación, si la tienes.</li>
        </ul>
        <p>Puedes escribirnos en español o en inglés. Confirmaremos la recepción de tu reporte normalmente dentro de <strong>3 días hábiles</strong>.</p>

        <h3>2. Nuestro Compromiso Contigo</h3>
        <p>Cuando reportas de buena fe siguiendo esta Política, nos comprometemos a:</p>
        <ul>
            <li><strong>Acusar recibo</strong> de tu reporte y mantener una comunicación honesta sobre su estado.</li>
            <li><strong>Investigar y corregir</strong> las vulnerabilidades válidas en un plazo razonable según su severidad.</li>
            <li><strong>No emprender acciones legales</strong> en tu contra por una investigación de seguridad realizada de buena fe y conforme a esta Política (puerto seguro).</li>
            <li><strong>Darte crédito públicamente</strong> —si así lo deseas— una vez resuelto el problema.</li>
        </ul>

        <h3>3. Lo que te Pedimos (Reglas de Buena Fe)</h3>
        <ul>
            <li>Danos un tiempo razonable para corregir el problema <strong>antes de divulgarlo públicamente</strong> o a terceros.</li>
            <li><strong>No accedas, modifiques ni elimines datos de otros usuarios.</strong> Si una prueba requiere una cuenta, usa únicamente cuentas propias o de prueba.</li>
            <li>No degrades nuestro servicio: nada de ataques de denegación de servicio (DoS/DDoS), fuerza bruta masiva ni spam.</li>
            <li>No uses ingeniería social contra nuestro equipo, usuarios o proveedores, ni accesos físicos.</li>
            <li>No exfiltres más datos de los estrictamente necesarios para demostrar la vulnerabilidad, y elimina cualquier dato obtenido tras reportarla.</li>
            <li>No condiciones el reporte a una recompensa económica ni a cualquier forma de extorsión.</li>
        </ul>

        <h3>4. Alcance</h3>
        <p><strong>Dentro de alcance:</strong> el sitio y la aplicación web en <code>bioboros.com</code> (incluido el subdominio de la app) y nuestra API pública.</p>
        <p><strong>Fuera de alcance:</strong> los sistemas de nuestros proveedores subcontratados (PayPal, DeepSeek, Neon, Sentry, Oracle Cloud, entre otros) — repórtales directamente a ellos según sus propios programas. También quedan fuera los hallazgos sin impacto demostrable de seguridad, como:</p>
        <ul>
            <li>Reportes de escáneres automáticos sin una prueba de explotación real.</li>
            <li>Ausencia de cabeceras de seguridad «recomendadas» sin un vector de ataque concreto.</li>
            <li>Problemas que requieren un dispositivo del usuario ya comprometido, físicamente o con malware.</li>
            <li>Vulnerabilidades en versiones de navegador obsoletas o sin soporte.</li>
            <li>Reportes de buenas prácticas (p. ej. política de contraseñas, SPF/DMARC) sin impacto explotable.</li>
        </ul>

        <h3>5. Recompensas</h3>
        <p>Actualmente <strong>no contamos con un programa de recompensas económicas (bug bounty)</strong>. Reconocemos y agradecemos públicamente —con tu permiso— a quienes nos ayudan a mejorar la seguridad de la plataforma. Si en el futuro habilitamos recompensas, lo anunciaremos aquí.</p>

        <h3>6. Cómo nos Encuentras</h3>
        <p>Mantenemos un archivo <code>security.txt</code> conforme al estándar <a href="https://www.rfc-editor.org/rfc/rfc9116" target="_blank" rel="noopener noreferrer" className={styles.link}>RFC 9116</a> en <code>https://bioboros.com/.well-known/security.txt</code> con nuestro contacto de seguridad y el enlace a esta Política.</p>

        <h3>7. Cambios en esta Política</h3>
        <p>Podremos actualizar esta Política para reflejar cambios en nuestros sistemas o procesos. La versión vigente siempre se publica aquí con su fecha de «Última actualización».</p>
    </LegalLayout>
);
