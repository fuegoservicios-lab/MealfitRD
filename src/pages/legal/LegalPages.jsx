import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAssessment } from '../../context/AssessmentContext';
import styles from './LegalPages.module.css';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

const LegalLayout = ({ title, lastUpdated, children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { userProfile } = useAssessment();

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
                    if (path === '/' || path === '/login' || path === '/register') {
                        navigate('/');
                        return;
                    }
                }
            }
        } catch {
            // ignore URL parse errors
        }

        // 3. Fallback auth-based
        if (userProfile?.id) {
            navigate('/dashboard');
        } else {
            navigate('/');
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
                    <p className={styles.meta}>Última actualización: {lastUpdated}</p>
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
    <LegalLayout title="Política de Privacidad" lastUpdated="26 de Mayo, 2026">
        <p>En MealfitRD nos tomamos en serio la protección de sus datos. Esta Política describe con precisión técnica qué información recopilamos, cómo la procesamos, dónde la almacenamos, con quién la compartimos y qué derechos tiene usted sobre ella. La transparencia es nuestro principio fundamental.</p>

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
            <li><strong>el backend anterior Inc.</strong> — almacenamiento de base de datos y autenticación.</li>
            <li><strong>DeepSeek (Hangzhou DeepSeek Artificial Intelligence Basic Technology Research Co., Ltd.)</strong> — inferencia con modelos DeepSeek V4 (perfil de salud, conversaciones y, cuando esté habilitado, imágenes).</li>
            <li><strong>PayPal Holdings, Inc.</strong> — procesamiento de pagos y suscripciones.</li>
            <li><strong>Functional Software, Inc. (Sentry)</strong> — monitoreo de errores técnicos.</li>
            <li><strong>Amazon Web Services</strong> — infraestructura subyacente de el backend anterior y backend.</li>
            <li><strong>Vercel Inc.</strong> y <strong>EasyPanel</strong> — hosting del frontend y backend respectivamente.</li>
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

        <h3>13. Cambios en esta Política</h3>
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

/* ============================================================================
   POLÍTICA DE COOKIES
   ============================================================================ */
export const Cookies = () => (
    <LegalLayout title="Política de Cookies" lastUpdated="26 de Mayo, 2026">
        <p>Esta política explica con detalle qué cookies y mecanismos de almacenamiento local usamos en MealfitRD, para qué sirven y cómo controlarlos. Nuestro principio es minimalismo: solo usamos los almacenamientos estrictamente necesarios para que el servicio funcione y para recordar sus preferencias entre visitas. <strong>No utilizamos cookies de publicidad, marketing, ni de terceros para tracking comportamental.</strong></p>

        <h3>1. ¿Qué son las cookies y el almacenamiento local?</h3>
        <p>Las <strong>cookies</strong> son pequeños archivos que el navegador almacena cuando visita un sitio web. Pueden tener distintos atributos de seguridad (<code>HttpOnly</code>, <code>Secure</code>, <code>SameSite</code>) que limitan cómo pueden ser leídas. El <strong>almacenamiento local (<code>localStorage</code>)</strong> es un mecanismo similar pero más amplio, gestionado directamente por la aplicación, que persiste hasta que el usuario lo borra desde la configuración del navegador.</p>
        <p>MealfitRD usa ambos mecanismos para distintos propósitos. Lo describimos en detalle a continuación.</p>

        <h3>2. Cookies que utilizamos</h3>
        <p>Estas cookies son creadas y leídas exclusivamente por nosotros y nuestros proveedores autorizados:</p>
        <ul>
            <li><strong>Token de sesión el backend anterior (<code>sb-*-auth-token</code>):</strong> establece su sesión autenticada tras iniciar sesión. Es HttpOnly y Secure. Sin esta cookie no podría usar funciones que requieran cuenta. Caduca según la duración de su sesión.</li>
            <li><strong>Refresh token el backend anterior:</strong> permite renovar el token de sesión sin pedirle iniciar sesión nuevamente. Bajo el mismo nivel de protección.</li>
            <li><strong>Cookies técnicas de PayPal:</strong> durante el flujo de pago, PayPal puede establecer sus propias cookies en su dominio para detectar fraude y mantener su sesión de pago. No controlamos su contenido; PayPal las describe en su <a href="https://www.paypal.com/us/legalhub/privacy-full" target="_blank" rel="noopener noreferrer" className={styles.link}>política de privacidad</a>.</li>
        </ul>

        <h3>3. Almacenamiento Local (<code>localStorage</code>)</h3>
        <p>Usamos <code>localStorage</code> del navegador para recordar preferencias y caché operacional. Estos datos viven SOLO en su dispositivo — nunca se envían automáticamente a nuestros servidores. Las claves específicas que almacenamos son:</p>
        <ul>
            <li><code>mealfit_plan</code> — caché local de su plan actual para carga instantánea.</li>
            <li><code>mealfit_assessment</code> — borrador del formulario de evaluación inicial (en caso de que cierre la pestaña a la mitad).</li>
            <li><code>mealfit_guest_session_id</code> — identificador anónimo si está probando la plataforma sin registrarse.</li>
            <li><code>mealfit_water_tracker</code> — caché local de su tracker de hidratación diaria.</li>
            <li><code>mealfit_pantry_cache</code> — caché local del inventario de despensa para reducir consultas.</li>
            <li><code>mealfit_consumed_meals_cache</code> — caché local del diario nutricional.</li>
            <li><code>mealfit_notifications</code> — preferencias de notificaciones push.</li>
            <li><code>mealfit_history_dirty_at</code> — marca temporal para invalidación de caché del historial.</li>
            <li><code>mealfit_depleted_items</code> — caché local de ítems marcados como agotados.</li>
            <li><code>dismissed_ios_prompt</code> — banderita para no volver a mostrar el prompt de "Instalar en iOS".</li>
        </ul>
        <p>Estos datos persisten hasta que usted los borre manualmente o cierre sesión.</p>

        <h3>4. Service Worker (PWA)</h3>
        <p>MealfitRD es una Aplicación Web Progresiva (PWA). Esto significa que registramos un Service Worker en su navegador para permitir uso offline, instalación como app y notificaciones push (si usted las acepta). El Service Worker cachea recursos estáticos (imágenes, fuentes, código JavaScript) y NO envía información personal a nuestros servidores. Puede desinstalar el Service Worker desde las opciones de su navegador en la sección de almacenamiento del sitio.</p>

        <h3>5. Telemetría Técnica (Sentry)</h3>
        <p>Como parte de nuestra operación, integramos Sentry para detectar errores técnicos. Sentry NO usa cookies de rastreo publicitario. Inserta un identificador anónimo de sesión técnica únicamente para correlacionar errores producidos en la misma visita. Aplicamos filtros automáticos (PII scrubbing) que eliminan datos personales antes de que abandonen su navegador.</p>

        <h3>6. Lo que NO usamos</h3>
        <p>Para ser explícitos, MealfitRD <strong>NO utiliza</strong>:</p>
        <ul>
            <li>Google Analytics, Mixpanel, Amplitude ni similares.</li>
            <li>Facebook Pixel, TikTok Pixel, ni rastreadores de redes sociales.</li>
            <li>Cookies de retargeting publicitario.</li>
            <li>Identificadores publicitarios (IDFA, GAID).</li>
            <li>Fingerprinting del navegador.</li>
        </ul>

        <h3>7. Cómo controlar y eliminar cookies</h3>
        <p>Usted tiene control total. Puede:</p>
        <ul>
            <li>Bloquear o eliminar cookies desde la configuración de su navegador (Chrome: Configuración → Privacidad y seguridad → Cookies; Safari: Preferencias → Privacidad; Firefox: similar).</li>
            <li>Borrar el <code>localStorage</code> abriendo las DevTools del navegador (F12) → Application → Local Storage → clic derecho → Clear.</li>
            <li>Eliminar el Service Worker desde DevTools → Application → Service Workers → Unregister.</li>
            <li>Usar el navegador en modo incógnito/privado para no persistir nada entre sesiones.</li>
        </ul>
        <p>Tenga en cuenta que bloquear cookies estrictamente necesarias (sesión el backend anterior) impedirá iniciar sesión o usar funciones que requieran autenticación.</p>

        <h3>8. Cambios en esta política</h3>
        <p>Si añadimos nuevos almacenamientos o cookies, actualizaremos esta lista. La versión vigente siempre incluye la fecha de "Última actualización" arriba.</p>
    </LegalLayout>
);

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
