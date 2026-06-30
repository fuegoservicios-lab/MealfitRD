import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';
import styles from './LegalPages.module.css';
import { AlertTriangle, ArrowLeft, CalendarDays } from 'lucide-react';

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
                        "Acerca de MealfitRD" no es una política con fecha → sin meta. */}
                    {lastUpdated && (
                        <p className={styles.meta}>
                            <CalendarDays size={14} strokeWidth={2.5} className={styles.metaIcon} />
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
    <LegalLayout title="Política de Privacidad" lastUpdated="30 de Junio, 2026">
        <p>En MealfitRD nos tomamos en serio la protección de sus datos. Esta Política describe con precisión técnica qué información recopilamos, cómo la procesamos, dónde la almacenamos, con quién la compartimos, qué cookies y almacenamiento local usamos, y qué derechos tiene usted sobre ella. La transparencia es nuestro principio fundamental.</p>

        <h3>1. Identidad del Responsable del Tratamiento</h3>
        <p>El responsable del tratamiento de sus datos es <strong>MealfitRD</strong>, plataforma operada desde República Dominicana. Para cualquier consulta sobre privacidad puede contactarnos en <strong>fuego.servicios@gmail.com</strong>.</p>

        <h3>2. Información que Recopilamos</h3>
        <p>Recopilamos únicamente la información necesaria para personalizar su plan nutricional y operar la plataforma. Las categorías exactas son:</p>
        <ul>
            <li><strong>Datos de cuenta:</strong> nombre, correo electrónico, contraseña (hasheada con bcrypt vía el backend anterior Auth — nunca almacenamos contraseñas en texto plano).</li>
            <li><strong>Perfil de salud (<code>health_profile</code>):</strong> peso actual, estatura, edad, género, nivel de actividad física, objetivo (perder peso, ganar músculo, mantener), restricciones dietéticas, alergias alimentarias, condiciones de salud declaradas y preferencias culinarias.</li>
            <li><strong>Histórico nutricional:</strong> comidas registradas (<code>consumed_meals</code>), hidratación diaria, peso histórico (<code>weight_history</code>), inventario de despensa (<code>user_inventory</code>) e ítems agotados.</li>
            <li><strong>Datos de interacción con IA:</strong> mensajes con el asistente conversacional (<code>agent_messages</code>), planes generados (<code>meal_plans</code>), recetas expandidas, "lecciones aprendidas" derivadas de su uso (<code>user_facts</code>) almacenadas como embeddings vectoriales para personalización a largo plazo.</li>
            <li><strong>Imágenes de comida (opcional):</strong> si usted decide subir fotos al asistente de visión, las procesamos para identificar alimentos. No retenemos las imágenes una vez procesadas; solo guardamos el resultado textual del análisis.</li>
            <li><strong>Datos de pago:</strong> NO almacenamos números de tarjeta de crédito ni información financiera. Solo guardamos el identificador de suscripción de PayPal (<code>paypal_subscription_id</code>) y el plan vigente (<code>plan_tier</code>).</li>
            <li><strong>Datos técnicos automáticos:</strong> dirección IP, tipo de navegador, sistema operativo, y eventos de error (gestionados por Sentry con filtrado de información personal — ver Sección 7).</li>
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
        <p>MealfitRD <strong>no es un simple "wrapper" sobre un modelo de IA</strong>. Nuestro sistema combina varios componentes propietarios: un orquestador basado en grafos de estados (LangGraph) que coordina la generación de planes en múltiples pasos validados, un motor propio de coherencia nutricional que verifica que la lista de compras concuerde con las recetas generadas, un sistema de memoria a largo plazo con embeddings vectoriales que aprende de sus interacciones, un agente conversacional con herramientas seguras (no permitimos que la IA acceda a datos de otros usuarios — defensa <code>P0-AGENT-1</code>), un módulo de visión multimodal para analizar fotos de comida, y un circuit breaker que protege contra fallos del proveedor del modelo.</p>
        <p>Como motor generativo base utilizamos los modelos <strong>DeepSeek V4</strong> (familia <code>deepseek-v4-flash</code> para el plan gratuito y <code>deepseek-v4-pro</code> para los planes de pago), operados por DeepSeek. Esto significa que ciertos datos suyos viajan a la API de DeepSeek para ejecutar la inferencia. Específicamente enviamos al proveedor:</p>
        <ul>
            <li>Su perfil de salud completo (peso, altura, edad, género, restricciones).</li>
            <li>Sus preferencias y comidas que le gustan/no le gustan.</li>
            <li>El historial reciente de la conversación con el asistente.</li>
            <li>Las fotos de comida que usted decide compartir (cuando el análisis visual esté habilitado).</li>
        </ul>
        <p>DeepSeek trata estos datos bajo sus <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className={styles.link}>Términos de Servicio y Política de Privacidad de la Plataforma Abierta</a>. Tenga en cuenta que los servidores del proveedor de inferencia pueden estar ubicados fuera de la República Dominicana (incluida la República Popular China), por lo que el envío implica una transferencia internacional de datos. No anonimizamos los datos antes de enviarlos porque la personalización requiere su contexto específico; sin embargo, NUNCA enviamos su nombre completo, correo electrónico ni datos de pago.</p>
        <p>Adicionalmente, NOSOTROS no usamos sus datos personales para entrenar modelos propios. La "memoria a largo plazo" del agente se basa en embeddings vectoriales privados de SU cuenta — no se cruza ni se agrega con otros usuarios.</p>

        <h3>5. Infraestructura y Seguridad Técnica</h3>
        <p>Su información se almacena en infraestructura administrada:</p>
        <ul>
            <li><strong>Base de datos:</strong> el backend anterior (PostgreSQL gestionado sobre Amazon Web Services), con cifrado en reposo AES-256 a nivel de disco y cifrado en tránsito TLS 1.2 o superior.</li>
            <li><strong>Row Level Security (RLS):</strong> todas las tablas con datos personales tienen políticas RLS activadas — la base de datos rechaza consultas que intenten acceder a información de otro usuario, incluso si fallara la capa de aplicación.</li>
            <li><strong>Aislamiento por <code>user_id</code>:</strong> cada consulta del backend incluye un filtro explícito de <code>user_id</code>. Hemos publicado tests automatizados que enforzan este contrato en cada cambio (invariantes I2/I6 del código).</li>
            <li><strong>Autenticación:</strong> el backend anterior Auth con JWT firmado HMAC-SHA256, validación server-side en cada petición. Tokens de sesión en cookies HttpOnly + SameSite.</li>
            <li><strong>Protección de contraseñas:</strong> verificación contra la base de datos HaveIBeenPwned al registrarse (k-anonymity) — si su contraseña aparece en una filtración pública conocida, le pedimos elegir otra.</li>
            <li><strong>Headers de seguridad web:</strong> HSTS, X-Frame-Options DENY, Content Security Policy, Referrer-Policy estrictos.</li>
        </ul>

        <h3>6. Procesamiento de Pagos</h3>
        <p>Los pagos se procesan exclusivamente a través de <strong>PayPal</strong> (PayPal Holdings, Inc., certificada PCI-DSS Level 1). MealfitRD nunca recibe ni almacena su número de tarjeta, fecha de vencimiento ni CVV. Cuando usted hace upgrade a un plan pago, PayPal nos devuelve únicamente un identificador de suscripción que asociamos a su cuenta. Validamos del lado del servidor que el plan reportado por PayPal coincida exactamente con el que usted seleccionó (defensa contra manipulación cliente-side).</p>

        <h3>7. Monitoreo de Errores y Telemetría</h3>
        <p>Usamos <strong>Sentry</strong> (Functional Software, Inc.) para detectar errores técnicos en frontend y backend. Tenemos filtros automáticos (PII scrubbing) que eliminan de los reportes de error: <code>user_id</code>, contraseñas, tokens, perfil de salud, contenido de mensajes con el agente y números de pago. El sampling rate por defecto es 10% (configurable). Sentry conserva los reportes según su política propia de retención.</p>
        <p>No utilizamos Google Analytics, Mixpanel, Facebook Pixel, ni ningún rastreador publicitario.</p>

        <h3>8. Proveedores Subcontratados (Encargados de Tratamiento)</h3>
        <p>Para operar la plataforma compartimos datos estrictamente necesarios con los siguientes proveedores. Todos están bajo contratos de procesamiento de datos:</p>
        <ul>
            <li><strong>Neon, Inc.</strong> — almacenamiento de base de datos y autenticación.</li>
            <li><strong>DeepSeek (Hangzhou DeepSeek Artificial Intelligence Basic Technology Research Co., Ltd.)</strong> — inferencia con modelos DeepSeek V4 (perfil de salud, conversaciones y, cuando esté habilitado, imágenes).</li>
            <li><strong>PayPal Holdings, Inc.</strong> — procesamiento de pagos y suscripciones.</li>
            <li><strong>Functional Software, Inc. (Sentry)</strong> — monitoreo de errores técnicos.</li>
            <li><strong>Oracle Corporation (Oracle Cloud Infrastructure)</strong> — infraestructura de hosting (VPS con nginx) del frontend y backend.</li>
        </ul>

        <h3>9. Retención de Datos</h3>
        <p>Mantenemos sus datos mientras su cuenta esté activa. Tablas operacionales (planes huérfanos, telemetría de chunks, logs de errores) tienen políticas automáticas de purga: 7 días para planes abandonados sin generar, 90 días para telemetría desvinculada del plan, 30 días para caché de operaciones temporales. Los registros de facturación se conservan por el plazo legal aplicable (típicamente 5-7 años en RD).</p>

        <h3>10. Sus Derechos</h3>
        <p>Usted puede en cualquier momento:</p>
        <ul>
            <li><strong>Acceder</strong> a la información que tenemos de usted desde Ajustes en la app o solicitándola por correo.</li>
            <li><strong>Rectificar</strong> datos incorrectos editando su perfil directamente.</li>
            <li><strong>Eliminar</strong> su cuenta y todos los datos asociados escribiendo a fuego.servicios@gmail.com. El borrado dispara CASCADE sobre todas las tablas vinculadas mediante claves foráneas.</li>
            <li><strong>Exportar</strong> sus datos en formato JSON solicitándolo por correo (cumplimos en un plazo máximo de 30 días).</li>
            <li><strong>Oponerse</strong> al tratamiento para finalidades distintas a la ejecución del contrato.</li>
            <li><strong>Revocar el consentimiento</strong> cancelando su suscripción y eliminando la cuenta.</li>
        </ul>

        <h3>11. Menores de Edad</h3>
        <p>MealfitRD está destinada a personas mayores de 18 años. Aunque actualmente solicitamos la edad como dato declarativo del usuario, no realizamos verificación de identidad. Si descubrimos que un menor ha creado una cuenta sin consentimiento parental, eliminaremos la cuenta y sus datos asociados de inmediato. Padres o tutores pueden notificarnos en fuego.servicios@gmail.com.</p>

        <h3>12. Transferencias Internacionales</h3>
        <p>Dado que nuestros proveedores (el backend anterior, Google, PayPal, Sentry, AWS) operan globalmente, sus datos pueden procesarse fuera de República Dominicana, principalmente en Estados Unidos. Estos proveedores están adheridos a marcos de privacidad reconocidos (Cláusulas Contractuales Estándar y/o Data Privacy Framework UE-EEUU).</p>

        <h3>13. Cookies y Almacenamiento Local</h3>
        <p>Aplicamos un principio de minimalismo: solo usamos los almacenamientos estrictamente necesarios para que el servicio funcione y para recordar sus preferencias entre visitas. <strong>No utilizamos cookies de publicidad, marketing ni rastreadores de terceros</strong> — sin Google Analytics, Meta/TikTok Pixel, retargeting, identificadores publicitarios (IDFA, GAID) ni fingerprinting del navegador.</p>
        <ul>
            <li><strong>Cookies de sesión (autenticación):</strong> establecen y renuevan su sesión tras iniciar sesión. Son <code>HttpOnly</code> y <code>Secure</code>; sin ellas no podría usar funciones que requieran cuenta. Caducan según la duración de su sesión.</li>
            <li><strong>Cookies técnicas de PayPal:</strong> durante el flujo de pago, PayPal puede establecer cookies en su propio dominio para detección de fraude y para mantener su sesión de pago. No controlamos su contenido; PayPal las describe en su <a href="https://www.paypal.com/us/legalhub/privacy-full" target="_blank" rel="noopener noreferrer" className={styles.link}>política de privacidad</a>.</li>
            <li><strong>Almacenamiento local (<code>localStorage</code>):</strong> guarda en SU dispositivo preferencias y caché operacional (su plan actual, el borrador del formulario de evaluación, el tracker de hidratación, la caché de despensa y del diario nutricional, preferencias de notificaciones y banderitas de UI). Nunca se envía automáticamente a nuestros servidores y persiste hasta que usted lo borre o cierre sesión.</li>
            <li><strong>Service Worker (PWA):</strong> como Aplicación Web Progresiva, registramos un Service Worker que cachea recursos estáticos (imágenes, fuentes, JavaScript) para uso offline e instalación como app. No envía información personal a nuestros servidores.</li>
            <li><strong>Sentry (telemetría técnica):</strong> inserta un identificador anónimo de sesión técnica para correlacionar errores de una misma visita — sin cookies de rastreo publicitario y con filtrado de datos personales (ver Sección 7).</li>
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
    <LegalLayout title="Términos de Servicio" lastUpdated="26 de Mayo, 2026">
        <p>Bienvenido a MealfitRD. Al acceder o utilizar nuestra plataforma usted acepta los presentes Términos de Servicio, que constituyen un acuerdo legalmente vinculante entre usted y MealfitRD. Por favor léalos con atención.</p>

        <h3>1. Naturaleza del Servicio</h3>
        <p>MealfitRD es una plataforma propietaria de nutrición personalizada que integra varias capas tecnológicas desarrolladas internamente: un orquestador determinístico basado en grafos de estados que coordina la generación de planes en múltiples pasos validados, un motor de coherencia nutricional que verifica matemáticamente la consistencia entre recetas y listas de compras, un agente conversacional con herramientas seguras de modificación de datos del usuario, un módulo de visión multimodal para análisis de fotografías de comida, un sistema de memoria a largo plazo con embeddings vectoriales para personalización continua, un programador de tareas (chunks rolling) que regenera porciones de su plan sin interrumpir su uso, y un sistema de auditoría con detección de derivas operativas.</p>
        <p>Como modelo generativo base utilizamos la familia <strong>DeepSeek V4</strong>. Sin embargo, <strong>MealfitRD no es un wrapper ni un envoltorio simple sobre un modelo de IA</strong>: el valor diferencial reside en nuestros sistemas de orquestación, validación, persistencia y aprendizaje continuo, todos propietarios. El modelo DeepSeek funciona como una pieza dentro de un sistema mucho mayor.</p>

        <h3>2. Elegibilidad y Registro</h3>
        <p>Para utilizar MealfitRD usted debe:</p>
        <ul>
            <li>Tener al menos 18 años cumplidos (o contar con consentimiento expreso de un padre o tutor legal).</li>
            <li>Proporcionar información veraz y mantenerla actualizada.</li>
            <li>Tener capacidad legal para celebrar este contrato según las leyes de su jurisdicción.</li>
            <li>No estar suspendido previamente de la plataforma por violación de términos.</li>
        </ul>
        <p>Usted es el único responsable de la confidencialidad de sus credenciales y de todas las actividades realizadas bajo su cuenta. Notifíquenos de inmediato cualquier acceso no autorizado.</p>

        <h3>3. Suscripciones, Planes y Pagos</h3>
        <p>Ofrecemos un plan gratuito con 15 créditos mensuales y tres planes pagos:</p>
        <ul>
            <li><strong>Básico</strong> — USD 9.99/mes ó USD 89.99/año (≈ USD 7.50/mes).</li>
            <li><strong>Plus</strong> — USD 19.99/mes ó USD 179.99/año (≈ USD 15.00/mes).</li>
            <li><strong>Ultra Ilimitado</strong> — USD 49.99/mes ó USD 449.99/año (≈ USD 37.50/mes).</li>
        </ul>
        <p>Todos los pagos se procesan mediante PayPal. La suscripción se renueva automáticamente al final de cada período (mensual o anual) salvo que usted la cancele desde Ajustes o desde su cuenta de PayPal antes de la fecha de renovación. Las cancelaciones surten efecto al final del período facturado en curso — no realizamos prorrateo de devolución por períodos parcialmente consumidos.</p>
        <p><strong>Política de devolución:</strong> ofrecemos siete (7) días desde la primera compra para solicitar reembolso completo si el servicio no cumple sus expectativas. Las renovaciones automáticas no califican para esta ventana — solo la primera compra inicial. Solicitudes de reembolso deben dirigirse a fuego.servicios@gmail.com.</p>
        <p>Reservamos el derecho de modificar los precios y planes con notificación previa de treinta (30) días para suscriptores existentes.</p>

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
        <p>Todo el software, el código fuente, los modelos propietarios, los prompts diseñados para el agente, los algoritmos de validación nutricional, los esquemas de datos, los diseños de interfaz, el sistema de tipografía, los íconos personalizados, las marcas <em>MealfitRD</em>, los logos y demás contenidos generados por la plataforma son propiedad exclusiva de MealfitRD y están protegidos por las leyes de derechos de autor y propiedad industrial de República Dominicana e internacionales.</p>
        <p>Los planes nutricionales generados específicamente para usted son para su uso personal y no comercial. Puede compartir capturas o resúmenes para uso personal pero NO puede revenderlos, redistribuirlos masivamente, ni utilizarlos para entrenar modelos competidores.</p>

        <h3>6. Limitación de Responsabilidad</h3>
        <p>El servicio se entrega <em>"tal cual" y "según disponibilidad"</em>. Aunque hacemos esfuerzos razonables para mantener disponibilidad y precisión, <strong>MealfitRD no garantiza</strong>:</p>
        <ul>
            <li>Que el servicio funcione sin interrupciones, sin errores, o sin retrasos.</li>
            <li>Que los planes generados produzcan resultados específicos de pérdida de peso, ganancia muscular u otros objetivos.</li>
            <li>La exactitud absoluta de cálculos nutricionales o macronutrientes, dado que la composición real de los alimentos puede variar.</li>
            <li>La disponibilidad de los modelos de DeepSeek ni de el backend anterior u otros proveedores subcontratados.</li>
        </ul>
        <p>En la máxima medida permitida por la ley, MealfitRD no será responsable de daños indirectos, incidentales, especiales, consecuenciales o punitivos, ni de pérdidas de datos, ganancias o oportunidad. Nuestra responsabilidad total agregada por cualquier reclamación no excederá el monto pagado por usted en los últimos doce (12) meses.</p>
        <p><strong>Las recomendaciones nutricionales no constituyen consejo médico.</strong> Consulte el Aviso Médico para detalle.</p>

        <h3>7. Modificaciones del Servicio y de Estos Términos</h3>
        <p>Podremos modificar funcionalidades de la plataforma, añadir nuevas características, deprecar otras o ajustar la capacidad de modelos de IA disponibles, con previo aviso razonable cuando los cambios sean materiales. Estos Términos pueden actualizarse periódicamente; la versión vigente se publica siempre en esta página con su fecha. Para cambios materiales, le notificaremos por correo electrónico antes de su entrada en vigor.</p>

        <h3>8. Terminación</h3>
        <p>Usted puede cancelar su suscripción en cualquier momento desde Ajustes. MealfitRD podrá terminar o suspender cuentas que violen estos Términos, incurran en fraude, o representen riesgo para otros usuarios o para la infraestructura. Tras la terminación, sus datos personales se eliminarán según se describe en la Política de Privacidad. Los registros de facturación necesarios para cumplimiento legal se conservarán por el plazo aplicable.</p>

        <h3>9. Ley Aplicable y Resolución de Disputas</h3>
        <p>Estos Términos se rigen por las leyes de la República Dominicana, incluyendo en lo pertinente la Ley 358-05 de Protección al Consumidor. Cualquier controversia que no pueda resolverse amistosamente será sometida a los tribunales competentes de la ciudad de Santo Domingo, Distrito Nacional.</p>

        <h3>10. Contacto</h3>
        <p>Para cualquier consulta legal, técnica o comercial puede escribirnos a <strong>fuego.servicios@gmail.com</strong>.</p>
    </LegalLayout>
);

/* [P3-COOKIES-MERGE · 2026-06-30] La "Política de Cookies" se fusionó dentro de la
   Política de Privacidad (sección 13). El componente Cookies se eliminó; la ruta
   /cookies redirige a /privacy (App.jsx) para no romper enlaces ya indexados. */

/* ============================================================================
   AVISO MÉDICO
   ============================================================================ */
export const MedicalDisclaimer = () => (
    <LegalLayout title="Aviso Médico" lastUpdated="26 de Mayo, 2026">
        <div className={styles.alertBox}>
            <p className={styles.alertTitle}>
                <AlertTriangle size={20} /> IMPORTANTE
            </p>
            <p className={styles.alertText}>
                MealfitRD es una herramienta de apoyo nutricional generada por Inteligencia Artificial. <strong>No es un dispositivo médico, no diagnostica enfermedades, y no sustituye la atención de un profesional de la salud.</strong>
            </p>
        </div>

        <p>Esta sección explica con claridad qué es MealfitRD desde el punto de vista médico, qué NO es, y cuándo debe usted necesariamente consultar a un profesional. Léala completa antes de seguir cualquier recomendación generada por nuestra plataforma.</p>

        <h3>1. Naturaleza de las Recomendaciones</h3>
        <p>Los planes de comidas, recetas, listas de compras, cálculos de macronutrientes y consejos del asistente conversacional son <strong>recomendaciones generales de carácter informativo y educativo</strong>, generadas algorítmicamente a partir de la información que usted nos proporciona (peso, altura, edad, género, objetivos, alergias declaradas y preferencias). Su precisión depende de la veracidad de esos datos.</p>
        <p>Nuestros cálculos siguen fórmulas nutricionales estándar (Mifflin-St Jeor para metabolismo basal, factor de actividad, balance de macronutrientes). Sin embargo, la composición real de los alimentos en cada caso particular puede variar según marca, preparación, frescura y origen, y los requerimientos individuales pueden divergir significativamente de los promedios poblacionales.</p>

        <h3>2. Lo que MealfitRD NO Hace</h3>
        <ul>
            <li>NO diagnostica enfermedades, deficiencias nutricionales, intolerancias, alergias ni trastornos alimentarios.</li>
            <li>NO prescribe tratamientos médicos, suplementos, medicamentos ni terapias.</li>
            <li>NO sustituye la consulta con médicos generales, nutricionistas clínicos, endocrinólogos, gastroenterólogos, psicólogos especializados en alimentación, ni ningún otro profesional de la salud.</li>
            <li>NO interpreta resultados de laboratorio, estudios de composición corporal, ni señales clínicas.</li>
            <li>NO está certificada como dispositivo médico por la Dirección General de Drogas y Farmacias de República Dominicana, la FDA estadounidense, la EMA europea, ni ningún otro organismo regulatorio sanitario.</li>
            <li>NO está diseñada para el manejo de emergencias médicas.</li>
        </ul>

        <h3>3. Consulta Profesional Obligatoria</h3>
        <p>Antes de seguir cualquier plan generado por MealfitRD, <strong>debe consultar a un profesional de la salud calificado</strong> si:</p>
        <ul>
            <li>Tiene <strong>diabetes</strong> (tipo 1, tipo 2 o gestacional), prediabetes, o resistencia a la insulina.</li>
            <li>Tiene <strong>enfermedad renal</strong> crónica o aguda, o restricciones de proteína prescritas.</li>
            <li>Tiene <strong>enfermedad cardiovascular</strong>, hipertensión, hipercolesterolemia, o usa medicación cardiovascular.</li>
            <li>Está <strong>embarazada, amamantando o planificando un embarazo</strong>.</li>
            <li>Tiene historial actual o pasado de <strong>trastornos alimentarios</strong> (anorexia, bulimia, atracones, ARFID, ortorexia).</li>
            <li>Tiene <strong>enfermedad celíaca</strong>, intolerancia severa al gluten, intolerancia confirmada a la lactosa, o cualquier alergia alimentaria diagnosticada (incluyendo frutos secos, mariscos, soya, mariscos, sulfitos, etc.).</li>
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
            <li>Los modelos generativos (DeepSeek V4, sobre los cuales operamos) pueden, en raras ocasiones, "alucinar" datos. Nuestros sistemas de validación reducen esto, pero no lo eliminan al 100%.</li>
        </ul>

        <h3>5. No Establecimiento de Relación Médico-Paciente</h3>
        <p>El uso de MealfitRD <strong>no establece una relación médico-paciente, terapéutica, ni profesional</strong> entre usted y MealfitRD, sus empleados, contratistas, accionistas o desarrolladores. No somos su nutricionista, su médico, ni su psicólogo.</p>

        <h3>6. Emergencias Médicas</h3>
        <p>Si experimenta <strong>una emergencia médica</strong> — incluyendo, sin limitación: reacción alérgica severa, dolor de pecho, dificultad para respirar, hipoglucemia, deshidratación severa, pensamientos suicidas o ideación de autolesión, vómito persistente, signos de shock anafiláctico, o cualquier signo de gravedad — <strong>no use MealfitRD para resolverla</strong>. Llame de inmediato al <strong>9-1-1</strong> (República Dominicana), acuda a la sala de emergencia más cercana, o contacte a su médico tratante. Si está en otro país, use el número de emergencias local.</p>

        <h3>7. Exención de Responsabilidad</h3>
        <p>Usted reconoce y acepta que la decisión de seguir cualquier plan, recomendación o sugerencia provista por MealfitRD es <strong>exclusivamente suya</strong>. En la máxima medida permitida por la ley, MealfitRD no asume responsabilidad alguna por consecuencias adversas para la salud, alteraciones nutricionales, reacciones alérgicas o cualquier otro perjuicio que pudiera resultar del uso de la plataforma sin consulta profesional previa.</p>

        <h3>8. Comunicación de Errores Nutricionales</h3>
        <p>Si detecta un error específico en un cálculo, una combinación de alimentos potencialmente peligrosa, o cualquier recomendación que considere inadecuada, le pedimos reportarla a <strong>fuego.servicios@gmail.com</strong>. Tomamos en serio cada reporte y los usamos para mejorar la calibración de nuestros sistemas de validación.</p>
    </LegalLayout>
);

/* ============================================================================
   POLÍTICA DE PROTECCIÓN DE DATOS (Ley 172-13)
   ============================================================================ */
export const DataProtection = () => (
    <LegalLayout title="Política de Protección de Datos" lastUpdated="30 de Junio, 2026">
        <p>Esta Política desarrolla los derechos que la legislación de protección de datos le reconoce sobre su información personal y le explica, paso a paso, cómo ejercerlos en MealfitRD. Complementa nuestra <strong>Política de Privacidad</strong> (qué datos tratamos) centrándose en <strong>sus derechos como titular</strong> de esos datos.</p>

        <h3>1. Marco Legal Aplicable</h3>
        <p>MealfitRD opera desde República Dominicana y trata sus datos conforme a la <strong>Ley No. 172-13 sobre Protección Integral de los Datos Personales</strong>, así como, en lo pertinente, la Ley No. 358-05 de Protección al Consumidor y la Ley No. 126-02 sobre Comercio Electrónico, Documentos y Firmas Digitales.</p>
        <p>A medida que ampliemos el servicio a otros países de Latinoamérica, respetaremos adicionalmente la normativa local de protección de datos que resulte aplicable a los residentes de cada jurisdicción (por ejemplo, la LFPDPPP en México, la Ley 1581 en Colombia, la LGPD en Brasil o la Ley 25.326 en Argentina), reconociéndole en cada caso los derechos equivalentes a los descritos aquí.</p>

        <h3>2. Responsable del Tratamiento</h3>
        <p>El responsable es <strong>MealfitRD</strong>, plataforma operada desde República Dominicana. Punto de contacto para cualquier asunto de datos personales: <strong>fuego.servicios@gmail.com</strong>.</p>

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
            <li><strong>Eliminación autoservicio:</strong> puede borrar su cuenta y todos los datos asociados desde la propia app; la eliminación dispara un borrado en cascada sobre todas las tablas vinculadas a su identificador.</li>
            <li><strong>Solicitudes por correo:</strong> para acceso detallado, portabilidad (exportación JSON), oposición o cualquier otro derecho, escriba a <strong>fuego.servicios@gmail.com</strong> desde el correo asociado a su cuenta. Respondemos en un plazo máximo de <strong>treinta (30) días</strong>.</li>
        </ul>
        <p>No le cobramos por ejercer estos derechos. Podremos pedirle verificar su identidad para proteger su cuenta frente a solicitudes fraudulentas.</p>

        <h3>5. Datos Sensibles de Salud</h3>
        <p>Su perfil incluye datos de salud (peso, condiciones declaradas como diabetes o enfermedad renal, alergias) que la Ley 172-13 considera <strong>datos sensibles</strong>. Los tratamos <strong>exclusivamente</strong> para generar y ajustar su plan nutricional, con la finalidad limitada que usted consiente al completar el formulario, y nunca para publicidad. No los compartimos con terceros salvo el proveedor de inferencia estrictamente necesario para producir su plan (ver Política de Privacidad y Política de Uso de IA).</p>

        <h3>6. Transferencias Internacionales</h3>
        <p>Para generar su plan, parte de su perfil se procesa en servidores de nuestro proveedor de inteligencia artificial (DeepSeek), que pueden ubicarse fuera de República Dominicana, incluida la República Popular China. Esto constituye una transferencia internacional de datos. Nunca enviamos su nombre completo, correo ni datos de pago. El detalle está en la <strong>Política de Uso de Inteligencia Artificial</strong>.</p>

        <h3>7. Medidas de Seguridad</h3>
        <p>Aplicamos cifrado en tránsito (TLS) y en reposo, aislamiento estricto por identificador de usuario en cada consulta a la base de datos (con tests automatizados que enforzan que ninguna consulta acceda a datos de otro usuario), autenticación con tokens firmados criptográficamente, y verificación de contraseñas filtradas (HaveIBeenPwned) al registrarse. El detalle técnico está en la Política de Privacidad.</p>

        <h3>8. Reclamaciones</h3>
        <p>Si considera que el tratamiento de sus datos no se ajusta a la normativa, le pedimos contactarnos primero a <strong>fuego.servicios@gmail.com</strong> para resolverlo. Sin perjuicio de ello, usted conserva el derecho de presentar una reclamación ante la autoridad de control competente en materia de protección de datos de su jurisdicción.</p>

        <h3>9. Cambios en esta Política</h3>
        <p>Publicaremos cualquier actualización en esta página con su nueva fecha de "Última actualización". Si los cambios son materiales, se lo notificaremos por correo electrónico.</p>
    </LegalLayout>
);

/* ============================================================================
   POLÍTICA DE USO DE INTELIGENCIA ARTIFICIAL
   ============================================================================ */
export const AIUse = () => (
    <LegalLayout title="Política de Uso de Inteligencia Artificial" lastUpdated="30 de Junio, 2026">
        <p>MealfitRD usa inteligencia artificial de forma central en su producto. Creemos que debe saber, con transparencia, dónde interviene la IA, qué datos suyos utiliza, cuáles son sus límites y qué control conserva usted sobre las decisiones. Esta política lo explica.</p>

        <h3>1. Dónde Usamos IA</h3>
        <ul>
            <li><strong>Generación de tu plan:</strong> un sistema de orquestación coordina varios pasos —generación, cálculo determinista de macronutrientes, validación y guardas clínicas— para producir tu plan diario, recetas y lista de compras.</li>
            <li><strong>Coach conversacional:</strong> el asistente responde preguntas, cambia comidas, regenera días y registra tu consumo, recalculando con el motor determinista.</li>
            <li><strong>Análisis de fotos de comida:</strong> cuando esta función esté disponible, podrás subir una foto para estimar sus macros; revisas y confirmas antes de guardar.</li>
        </ul>

        <h3>2. Qué Modelo Usamos y Qué Datos Viajan</h3>
        <p>Como modelo generativo base utilizamos la familia <strong>DeepSeek V4</strong> (<code>deepseek-v4-flash</code> en el plan gratuito; <code>deepseek-v4-pro</code> en los planes de pago), operada por DeepSeek. Para producir tu plan enviamos al proveedor únicamente lo necesario:</p>
        <ul>
            <li>Tu perfil de salud (peso, estatura, edad, género, nivel de actividad, condiciones y restricciones declaradas).</li>
            <li>Tus preferencias y los alimentos que te gustan o no.</li>
            <li>El historial reciente de tu conversación con el asistente.</li>
            <li>Las fotos de comida que decidas compartir (cuando el análisis visual esté habilitado).</li>
        </ul>
        <p><strong>NUNCA</strong> enviamos al proveedor tu nombre completo, tu correo electrónico ni tus datos de pago. DeepSeek trata estos datos bajo sus propios términos y sus servidores pueden estar fuera de República Dominicana (ver «Transferencias Internacionales» en la Política de Protección de Datos).</p>

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
        <p>El plan se genera de forma automatizada, pero es una <strong>herramienta de apoyo</strong>: tú decides si lo sigues, lo ajustas o lo descartas, y revisas las estimaciones (por ejemplo, al escanear una comida) antes de guardarlas. Conforme a la Ley 172-13, tienes derecho a no quedar sujeto a decisiones basadas únicamente en tratamiento automatizado que produzcan efectos significativos: puedes solicitar intervención humana o aclaraciones escribiéndonos a <strong>fuego.servicios@gmail.com</strong>.</p>

        <h3>6. No Es Consejo Médico</h3>
        <p>Las recomendaciones generadas por IA son informativas y educativas, <strong>no constituyen consejo médico</strong> ni establecen una relación médico-paciente. Si tienes una condición de salud, consulta a un profesional. Lee el <strong>Aviso Médico</strong> para el detalle completo.</p>

        <h3>7. Mejora Continua</h3>
        <p>Trabajamos constantemente en mejorar la precisión y seguridad de nuestros sistemas. El uso de datos para mejorar el producto y para investigación se rige por la <strong>Política de Investigación</strong>, con las salvaguardas allí descritas.</p>

        <h3>8. Contacto</h3>
        <p>¿Dudas sobre cómo usamos la IA? Escríbenos a <strong>fuego.servicios@gmail.com</strong>.</p>
    </LegalLayout>
);

/* ============================================================================
   POLÍTICA DE INVESTIGACIÓN
   ============================================================================ */
export const Research = () => (
    <LegalLayout title="Investigación" lastUpdated="30 de Junio, 2026">
        <p>Para que MealfitRD sea cada vez más preciso y útil, analizamos cómo funciona el sistema sobre el uso real. Esta Política explica qué entendemos por «investigación», qué datos usamos para ello, cómo los protegemos, y —sobre todo— qué control conservas tú. Nuestro principio es claro: <strong>mejorar el producto sin comprometer tu privacidad ni tus datos sensibles de salud.</strong></p>

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
        <p>Puedes oponerte a que tus datos —incluso de forma anonimizada— se usen para mejora del producto e investigación, escribiéndonos a <strong>fuego.servicios@gmail.com</strong>. Oponerte no afecta tu capacidad de usar el servicio. También puedes ejercer el resto de tus derechos según la <strong>Política de Protección de Datos</strong>.</p>

        <h3>7. Base Legal</h3>
        <p>El tratamiento para mejora del producto se ampara en nuestro interés legítimo de ofrecer un servicio preciso y seguro, ponderado con tus derechos y limitado a datos no sensibles o disociados. Para cualquier investigación con datos sensibles identificables, la base será tu <strong>consentimiento expreso</strong>.</p>

        <h3>8. Cambios y Contacto</h3>
        <p>Publicaremos cualquier actualización en esta página con su nueva fecha. Para preguntas sobre cómo investigamos y mejoramos, escríbenos a <strong>fuego.servicios@gmail.com</strong>.</p>
    </LegalLayout>
);

/* ============================================================================
   POLÍTICA DE REEMBOLSOS Y CANCELACIONES
   ============================================================================ */
export const Refunds = () => (
    <LegalLayout title="Política de Reembolsos y Cancelaciones" lastUpdated="30 de Junio, 2026">
        <p>Esta Política detalla cómo funcionan las cancelaciones y los reembolsos de tu suscripción a MealfitRD. Queremos que sea clara y justa, conforme a la Ley No. 358-05 de Protección al Consumidor de República Dominicana.</p>

        <h3>1. Plan Gratis</h3>
        <p>El Plan Gratis no tiene costo ni requiere tarjeta. Puedes dejar de usarlo cuando quieras, sin cargos ni compromisos.</p>

        <h3>2. Cómo Cancelar tu Suscripción</h3>
        <p>Puedes cancelar en cualquier momento desde <strong>Ajustes</strong> en la app o directamente desde tu cuenta de <strong>PayPal</strong>. La cancelación:</p>
        <ul>
            <li>Detiene las futuras renovaciones automáticas.</li>
            <li>Surte efecto <strong>al final del período ya facturado</strong> (mensual o anual): conservas el acceso de pago hasta esa fecha.</li>
            <li>No genera prorrateo ni devolución por los días no usados del período en curso (salvo lo previsto en la ventana de reembolso del punto 3).</li>
        </ul>

        <h3>3. Ventana de Reembolso</h3>
        <p>Ofrecemos <strong>siete (7) días desde tu primera compra</strong> para solicitar un reembolso completo si el servicio no cumple tus expectativas. Importante:</p>
        <ul>
            <li>La ventana aplica únicamente a la <strong>primera compra inicial</strong> de un plan de pago.</li>
            <li>Las <strong>renovaciones automáticas</strong> (períodos posteriores) <strong>no califican</strong> para reembolso — por eso te recomendamos cancelar antes de la fecha de renovación si no deseas continuar.</li>
        </ul>

        <h3>4. Cómo Solicitar un Reembolso</h3>
        <p>Escribe a <strong>fuego.servicios@gmail.com</strong> desde el correo asociado a tu cuenta, indicando el plan contratado y la fecha de compra. Procesamos las solicitudes válidas a la brevedad; el reembolso se acredita por la misma vía de pago (PayPal).</p>

        <h3>5. Renovación Automática</h3>
        <p>Las suscripciones se renuevan automáticamente al final de cada período hasta que las canceles. Te recomendamos revisar tu fecha de renovación en Ajustes o en PayPal. Si modificamos los precios, te avisaremos con al menos <strong>treinta (30) días</strong> de anticipación antes de que el nuevo precio aplique a tu renovación.</p>

        <h3>6. Pagos por PayPal</h3>
        <p>Todos los pagos se procesan a través de PayPal. MealfitRD no almacena tu número de tarjeta ni datos financieros. Validamos del lado del servidor que el plan reportado por PayPal coincida con el que seleccionaste.</p>

        <h3>7. Disputas</h3>
        <p>Si tienes un problema con un cobro, contáctanos primero a <strong>fuego.servicios@gmail.com</strong> — la mayoría se resuelve rápido. Conservas tus derechos como consumidor bajo la Ley 358-05 y la posibilidad de acudir a las instancias de protección al consumidor que correspondan.</p>

        <h3>8. Contacto</h3>
        <p>Para cualquier asunto de facturación, cancelaciones o reembolsos: <strong>fuego.servicios@gmail.com</strong>. Respondemos en menos de 24 horas.</p>
    </LegalLayout>
);

/* ============================================================================
   POLÍTICA DE USO ACEPTABLE
   ============================================================================ */
export const AcceptableUse = () => (
    <LegalLayout title="Política de Uso" lastUpdated="30 de Junio, 2026">
        <p>Esta Política de Uso establece las reglas para utilizar MealfitRD de forma responsable, segura y justa para todos. Complementa nuestros <strong>Términos de Servicio</strong> (donde se detalla la relación contractual completa) y se aplica a cualquier persona que acceda a la plataforma, ya sea con plan gratuito, de pago o en modo invitado. Al usar MealfitRD, usted acepta cumplir estas reglas.</p>

        <h3>1. Quién Puede Usar la Plataforma</h3>
        <p>MealfitRD está destinada a personas <strong>mayores de 18 años</strong>, para su uso personal y no comercial. Usted es responsable de la confidencialidad de sus credenciales y de toda la actividad realizada bajo su cuenta. Si detecta un acceso no autorizado, notifíquenos de inmediato a <strong>fuego.servicios@gmail.com</strong>.</p>

        <h3>2. Uso Permitido</h3>
        <p>Puede usar MealfitRD para:</p>
        <ul>
            <li>Generar y ajustar planes de comidas personalizados para usted.</li>
            <li>Consultar al asistente conversacional sobre su nutrición, cambiar comidas y registrar su consumo.</li>
            <li>Analizar fotos de comida que usted decida compartir (cuando la función esté disponible).</li>
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
        <p>La generación de planes y el asistente consumen recursos de cómputo y de nuestro proveedor de IA. Por eso aplicamos cuotas mensuales por plan (el plan gratuito incluye 15 créditos) y límites de frecuencia para prevenir abuso. Estos límites buscan un uso razonable y personal; el uso automatizado, comercial no autorizado o que degrade el servicio para otros está prohibido y puede dar lugar a restricciones.</p>

        <h3>5. Contenido que Usted Aporta</h3>
        <p>Usted es responsable del contenido que introduce: texto libre en el formulario y el chat, y fotos de comida. Al subirlo, declara que tiene derecho a hacerlo y que no infringe la ley ni derechos de terceros. Procesamos ese contenido únicamente para prestarle el servicio, según se describe en la <strong>Política de Privacidad</strong> y la <strong>Política de Uso de Inteligencia Artificial</strong>.</p>

        <h3>6. Seguridad e Informe de Vulnerabilidades</h3>
        <p>No intente vulnerar la seguridad de la plataforma. Si descubre una vulnerabilidad o un comportamiento que considere inseguro, le pedimos reportarlo de forma responsable a <strong>fuego.servicios@gmail.com</strong> antes de divulgarlo públicamente. Agradecemos y tomamos en serio estos reportes.</p>

        <h3>7. Consecuencias del Incumplimiento</h3>
        <p>El incumplimiento de esta Política puede dar lugar, según su gravedad, a: advertencias, limitación temporal de funciones, suspensión o terminación de la cuenta —<strong>sin derecho a reembolso</strong>— y, cuando corresponda, a las acciones legales pertinentes. Nos reservamos el derecho de actuar de inmediato ante conductas que pongan en riesgo a otros usuarios o a la infraestructura.</p>

        <h3>8. No Es Consejo Médico</h3>
        <p>El uso del servicio no sustituye la consulta con un profesional de la salud. Las recomendaciones son informativas y educativas. Lea el <strong>Aviso Médico</strong> para el detalle completo.</p>

        <h3>9. Relación con Otras Políticas</h3>
        <p>Esta Política de Uso se interpreta junto con los <strong>Términos de Servicio</strong>, la <strong>Política de Privacidad</strong>, la <strong>Política de Protección de Datos</strong>, la <strong>Política de Uso de Inteligencia Artificial</strong> y el <strong>Aviso Médico</strong>. En caso de conflicto entre documentos sobre un mismo asunto, prevalecen los Términos de Servicio.</p>

        <h3>10. Cambios y Contacto</h3>
        <p>Podremos actualizar esta Política para reflejar cambios en el servicio o en la normativa. La versión vigente se publica siempre en esta página con su fecha de "Última actualización". Para cualquier duda sobre el uso aceptable de la plataforma, escríbanos a <strong>fuego.servicios@gmail.com</strong>.</p>
    </LegalLayout>
);

/* ============================================================================
   ACERCA DE MEALFITRD
   ============================================================================ */
export const About = () => (
    <LegalLayout title="Acerca de MealfitRD">
        <p>MealfitRD es una plataforma dominicana de <strong>nutrición de precisión potenciada por inteligencia artificial</strong>. Creamos planes de alimentación 100% personalizados, adaptados a tus gustos, tu presupuesto, tu condición de salud y, sobre todo, a la mesa dominicana real.</p>

        <h3>Nuestra Misión</h3>
        <p>Hacer que comer bien deje de ser complicado o caro. Creemos que una buena nutrición no debería requerir contratar a un especialista costoso ni seguir dietas genéricas pensadas para otros países y otros bolsillos. Por eso construimos una herramienta que pone la nutrición de precisión al alcance de cualquier persona, con alimentos que de verdad se consiguen y se comen en República Dominicana.</p>

        <h3>El Problema que Resolvemos</h3>
        <p>La mayoría de las apps de nutrición usan catálogos de alimentos extranjeros, precios irreales y planes que ignoran tu contexto. El resultado: listas de compras imposibles de seguir y comidas que nadie quiere repetir. MealfitRD parte de un <strong>catálogo verificado de alimentos dominicanos</strong> con precios reales en RD$, y arma planes coherentes que puedes cocinar, comprar y disfrutar.</p>

        <h3>Cómo lo Hacemos</h3>
        <p>Detrás de cada plan hay mucho más que un modelo de IA. Combinamos:</p>
        <ul>
            <li><strong>Un motor de orquestación</strong> que coordina la generación en varios pasos validados.</li>
            <li><strong>Un cálculo determinista de macronutrientes</strong> — no estimamos "a ojo": cuadramos calorías, proteína y el resto de macros con fórmulas nutricionales estándar.</li>
            <li><strong>Guardas clínicas</strong> que ajustan el plan según condiciones declaradas (diabetes, enfermedad renal, embarazo, cirugía bariátrica y más).</li>
            <li><strong>Un motor de coherencia</strong> que verifica que la lista de compras concuerde con las recetas.</li>
            <li><strong>Un coach conversacional</strong> que responde tus dudas, cambia comidas y registra tu consumo en tiempo real.</li>
        </ul>
        <p>La IA es una pieza poderosa dentro de un sistema mayor; el valor está en la validación, la personalización y la seguridad que la rodean.</p>

        <h3>Nuestros Principios</h3>
        <ul>
            <li><strong>Precisión:</strong> medimos qué tan cerca queda tu plan de tus objetivos y mejoramos continuamente.</li>
            <li><strong>Transparencia:</strong> te explicamos qué datos usamos, cómo funciona la IA y cuáles son sus límites.</li>
            <li><strong>Privacidad:</strong> tus datos son tuyos. No los vendemos ni los usamos para entrenar modelos. Lee nuestra <strong>Política de Privacidad</strong>.</li>
            <li><strong>Seguridad clínica:</strong> nuestras recomendaciones son una herramienta de apoyo y nunca sustituyen a un profesional de la salud (ver <strong>Aviso Médico</strong>).</li>
        </ul>

        <h3>Quiénes Somos</h3>
        <p>MealfitRD es una plataforma operada desde República Dominicana, construida por un equipo que cree en la tecnología al servicio de la salud y la cultura local. Empezamos por la mesa dominicana, con la mira puesta en llevar esta misma precisión al resto de Latinoamérica.</p>

        <h3>Hablemos</h3>
        <p>¿Tienes preguntas, ideas o quieres colaborar con nosotros? Escríbenos a <strong>fuego.servicios@gmail.com</strong>. Respondemos en menos de 24 horas.</p>
    </LegalLayout>
);

/* ============================================================================
   POLÍTICA DE DIVULGACIÓN RESPONSABLE (SEGURIDAD)
   [P3-RESPONSIBLE-DISCLOSURE · 2026-06-30] Política de reporte coordinado de
   vulnerabilidades. Companion: /.well-known/security.txt (RFC 9116) la referencia.
   ============================================================================ */
export const ResponsibleDisclosure = () => (
    <LegalLayout title="Política de Divulgación Responsable" lastUpdated="30 de Junio, 2026">
        <p>En MealfitRD la seguridad de tus datos —especialmente tu información de salud— es una prioridad. Agradecemos a la comunidad de investigadores de seguridad que nos ayuda a proteger a nuestros usuarios. Esta Política explica cómo reportarnos una vulnerabilidad de forma responsable y qué puedes esperar de nosotros a cambio.</p>

        <h3>1. Cómo Reportar una Vulnerabilidad</h3>
        <p>Si descubres una vulnerabilidad de seguridad, escríbenos a <strong>fuego.servicios@gmail.com</strong> con el asunto <em>«Reporte de seguridad»</em>. Para ayudarnos a reproducir y corregir el problema rápido, incluye en lo posible:</p>
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
        <p><strong>Dentro de alcance:</strong> el sitio y la aplicación web en <code>mealfitrd.com</code> (incluido el subdominio de la app) y nuestra API pública.</p>
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
        <p>Mantenemos un archivo <code>security.txt</code> conforme al estándar <a href="https://www.rfc-editor.org/rfc/rfc9116" target="_blank" rel="noopener noreferrer" className={styles.link}>RFC 9116</a> en <code>https://mealfitrd.com/.well-known/security.txt</code> con nuestro contacto de seguridad y el enlace a esta Política.</p>

        <h3>7. Cambios en esta Política</h3>
        <p>Podremos actualizar esta Política para reflejar cambios en nuestros sistemas o procesos. La versión vigente siempre se publica aquí con su fecha de «Última actualización».</p>
    </LegalLayout>
);
