import React, { useEffect } from 'react';
import styles from './LegalPages.module.css';
import { AlertTriangle } from 'lucide-react';

const LegalLayout = ({ title, lastUpdated, children }) => {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className={styles.container}>
            <div className={styles.contentWrapper}>
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

export const Privacy = () => (
    <LegalLayout title="Política de Privacidad" lastUpdated="18 de Marzo, 2026">
        <p>En MealfitRD, la privacidad y seguridad de sus datos son nuestra máxima prioridad. Esta Política de Privacidad describe nuestras prácticas sobre la recopilación, uso, protección y manejo de su información personal cuando interactúa con nuestra plataforma tecnológica impulsada por Inteligencia Artificial.</p>

        <h3>1. Información Biométrica y Personal que Recopilamos</h3>
        <p>Para que nuestro motor de IA funcione con precisión, recopilamos información que usted nos proporciona voluntariamente durante su evaluación. Esto incluye, de manera enunciativa más no limitativa: datos de contacto (nombre, correo electrónico), métricas de salud (peso actual, estatura, edad, género), objetivos físicos, restricciones dietéticas, alergias y preferencias alimenticias.</p>

        <h3>2. Procesamiento de Datos a través de Inteligencia Artificial</h3>
        <p>La información recopilada es estrictamente utilizada para:</p>
        <ul>
            <li>Alimentar nuestros algoritmos de IA para generar y personalizar planes de nutrición altamente específicos según su perfil y requerimientos.</li>
            <li>Entrenar y refinar nuestros modelos de predicción de bienestar (de forma completamente anonimizada) para mejorar la eficacia de la plataforma.</li>
            <li>Proporcionar soporte técnico, enviar actualizaciones del servicio y gestionar su suscripción de manera eficiente.</li>
        </ul>

        <h3>3. Seguridad y Protección de la Información</h3>
        <p>Nos tomamos muy en serio la custodia de sus datos. Implementamos protocolos robustos de seguridad, cifrado de datos de extremo a extremo y medidas de infraestructura en la nube para proteger su información personal (y de salud) contra accesos no autorizados, alteraciones, divulgación o destrucción inapropiada. No vendemos ni compartimos sus datos personales con terceros para fines de marketing directo.</p>
    </LegalLayout>
);

export const Terms = () => (
    <LegalLayout title="Términos de Servicio" lastUpdated="18 de Marzo, 2026">
        <p>Bienvenido a MealfitRD. Al acceder a nuestra plataforma y utilizar nuestros servicios de planificación nutricional impulsados por Inteligencia Artificial, usted acepta regirse legalmente por los presentes Términos de Servicio.</p>

        <h3>1. Uso de la Plataforma y Tecnología</h3>
        <p>Nuestros servicios utilizan algoritmos avanzados de IA para generar planes de alimentación altamente personalizados. Usted se compromete a utilizar estas herramientas tecnológicas exclusivamente para fines personales y lícitos. Queda estrictamente prohibido el uso de la plataforma para actividades fraudulentas, así como cualquier intento de ingeniería inversa, extracción masiva de datos (web scraping) o vulneración de nuestra infraestructura técnica.</p>

        <h3>2. Cuentas y Seguridad</h3>
        <p>Para utilizar nuestros servicios avanzados, puede ser necesario registrar una cuenta. Usted es responsable de mantener la confidencialidad de sus credenciales de acceso y de todas las actividades que ocurran bajo su cuenta. MealfitRD se reserva el derecho de suspender o cancelar cuentas que incumplan nuestras políticas o presenten un riesgo para la comunidad.</p>

        <h3>3. Propiedad Intelectual e IA</h3>
        <p>Todo el contenido generado, los modelos de Inteligencia Artificial, los algoritmos subyacentes, las marcas registradas, los diseños de interfaz y la tecnología patentada en esta plataforma son propiedad exclusiva de MealfitRD. Estos activos están protegidos por las leyes internacionales de propiedad intelectual y derechos de autor.</p>

        <h3>4. Limitación de Responsabilidad</h3>
        <p>Aunque nuestra Inteligencia Artificial se entrena rigurosamente para ofrecer las mejores sugerencias posibles, la nutrición es una ciencia compleja. MealfitRD proporciona estas herramientas "tal cual" y no asume responsabilidad civil por daños directos, indirectos, incidentales o consecuentes derivados del uso de la plataforma, la interpretación de los planes generados o la imposibilidad técnica de acceder a nuestro servicio.</p>
    </LegalLayout>
);

export const Cookies = () => (
    <LegalLayout title="Política de Cookies" lastUpdated="18 de Marzo, 2026">
        <p>En MealfitRD, utilizamos cookies y tecnologías de seguimiento similares para garantizar el correcto funcionamiento de nuestra plataforma, optimizar su experiencia de usuario y mejorar continuamente nuestros modelos de recomendación basados en Inteligencia Artificial.</p>

        <h3>¿Qué son las cookies?</h3>
        <p>Las cookies son pequeños archivos de datos que se almacenan en su dispositivo (computadora, tableta o dispositivo móvil) cuando visita y utiliza nuestra aplicación. Estas herramientas nos permiten recordar información sobre su visita, facilitando su próximo acceso y haciendo que nuestra plataforma sea mucho más útil y personalizada para usted.</p>

        <h3>Cómo utilizamos las cookies</h3>
        <p>Nuestra plataforma tecnológica emplea diferentes tipos de cookies con propósitos específicos:</p>
        <ul>
            <li><strong>Cookies Estrictamente Necesarias:</strong> Son fundamentales para que el sitio funcione correctamente. Incluyen el mantenimiento de su sesión activa (inicio de sesión seguro), la gestión de pagos y la navegación básica por la plataforma. Sin ellas, MealfitRD no podría operar adecuadamente.</li>
            <li><strong>Cookies de Rendimiento y Análisis:</strong> Nos permiten recopilar métricas anónimas sobre cómo los usuarios interactúan con la interfaz. Usamos estos datos para identificar áreas de mejora, optimizar tiempos de carga y perfeccionar el flujo de usuario.</li>
            <li><strong>Cookies Funcionales y de Personalización:</strong> Ayudan a que la plataforma recuerde sus ajustes y preferencias previas (como configuración de idioma o visualización) para ofrecer una experiencia más fluida y adaptada.</li>
            <li><strong>Cookies de Optimización de IA:</strong> Utilizamos datos de interacción anonimizados para entender mejor los patrones de uso. Esta información nos ayuda a seguir entrenando y calibrando nuestro motor de Inteligencia Artificial para ofrecerte una experiencia en la plataforma y tecnología mucho más innovadora y completa.</li>
        </ul>

        <h3>Control de Cookies</h3>
        <p>Usted tiene el derecho de decidir si acepta o rechaza algunas de estas cookies. La mayoría de los navegadores web aceptan cookies de forma predeterminada, pero puede modificar la configuración de su navegador para bloquearlas o eliminar las existentes si así lo prefiere. Tenga en cuenta que desactivar ciertas cookies podría restringir el uso de funciones avanzadas y afectar negativamente la experiencia personalizada dentro de MealfitRD.</p>
    </LegalLayout>
);

export const MedicalDisclaimer = () => (
    <LegalLayout title="Aviso Médico" lastUpdated="18 de Marzo, 2026">
        <div className={styles.alertBox}>
            <p className={styles.alertTitle}>
                <AlertTriangle size={20} /> IMPORTANTE
            </p>
            <p className={styles.alertText}>
                MealfitRD utiliza Inteligencia Artificial avanzada para optimizar tu nutrición, pero no reemplaza la atención médica profesional.
            </p>
        </div>

        <p>Nuestra tecnología analiza datos para generar planes de alimentación altamente personalizados y precisos orientados a mejorar tu bienestar y rendimiento. Sin embargo, toda la información y recomendaciones proporcionadas por MealfitRD están diseñadas con fines educativos y de optimización nutricional, y no deben interpretarse como un diagnóstico, tratamiento o consejo médico prescriptivo.</p>

        <h3>Complemento a tu Salud</h3>
        <p>Recomendamos que integres las herramientas de MealfitRD como un complemento a tu estilo de vida. Siempre consulta a tu médico, nutricionista clínico u otro profesional de la salud calificado antes de realizar cambios drásticos en tu dieta, especialmente si tienes condiciones médicas preexistentes. Nunca ignores el consejo médico profesional debido a la información generada por nuestra plataforma.</p>

        <h3>Sin Relación Médico-Paciente</h3>
        <p>El uso de nuestro motor de Inteligencia Artificial y la generación de planes dietéticos no establece una relación médico-paciente. Si experimentas una emergencia médica o de salud, comunícate de inmediato con los servicios de emergencia o tu proveedor de salud local.</p>
    </LegalLayout>
);
