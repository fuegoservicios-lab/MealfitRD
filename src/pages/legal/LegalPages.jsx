import React from 'react';
import styles from './LegalPages.module.css';
import { AlertTriangle } from 'lucide-react';

const LegalLayout = ({ title, lastUpdated, children }) => {
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>{title}</h1>
                <p className={styles.meta}>Última actualización: {lastUpdated}</p>
            </header>
            <div className={styles.content}>
                {children}
            </div>
        </div>
    );
};

export const Privacy = () => (
    <LegalLayout title="Política de Privacidad" lastUpdated="23 de Enero, 2026">
        <p>En MealfitRD, valoramos y respetamos su privacidad. Esta Política de Privacidad describe cómo recopilamos, usamos y protegemos su información personal.</p>

        <h3>1. Información que Recopilamos</h3>
        <p>Podemos recopilar información personal que usted nos proporciona voluntariamente, como su nombre, dirección de correo electrónico, datos de salud (peso, altura, objetivos) y preferencias alimenticias para generar su plan personalizado.</p>

        <h3>2. Uso de la Información</h3>
        <p>Utilizamos su información para:</p>
        <ul>
            <li>Proporcionar y personalizar nuestros servicios de planificación de comidas.</li>
            <li>Mejorar nuestros algoritmos de Inteligencia Artificial.</li>
            <li>Comunicarnos con usted sobre su cuenta y actualizaciones del servicio.</li>
        </ul>

        <h3>3. Protección de Datos</h3>
        <p>Implementamos medidas de seguridad técnicas y organizativas para proteger sus datos personales contra el acceso no autorizado, la pérdida o la alteración.</p>
    </LegalLayout>
);

export const Terms = () => (
    <LegalLayout title="Términos de Servicio" lastUpdated="23 de Enero, 2026">
        <p>Bienvenido a MealfitRD. Al acceder a nuestro sitio web y utilizar nuestros servicios, usted acepta cumplir con estos Términos de Servicio.</p>

        <h3>1. Uso del Servicio</h3>
        <p>Usted se compromete a utilizar nuestros servicios solo para fines legales y de acuerdo con estos términos. No debe utilizar el servicio para ninguna actividad fraudulenta o dañina.</p>

        <h3>2. Propiedad Intelectual</h3>
        <p>Todo el contenido, marcas y tecnología en este sitio son propiedad de MealfitRD y están protegidos por las leyes de propiedad intelectual.</p>

        <h3>3. Limitación de Responsabilidad</h3>
        <p>MealfitRD no se hace responsable de daños directos, indirectos o consecuentes que surjan del uso o la imposibilidad de uso de nuestros servicios.</p>
    </LegalLayout>
);

export const Cookies = () => (
    <LegalLayout title="Política de Cookies" lastUpdated="23 de Enero, 2026">
        <p>MealfitRD utiliza cookies para mejorar su experiencia en nuestro sitio web.</p>

        <h3>¿Qué son las cookies?</h3>
        <p>Las cookies son pequeños archivos de texto que se almacenan en su dispositivo cuando visita un sitio web. Nos ayudan a recordar sus preferencias y a analizar el tráfico del sitio.</p>

        <h3>Cómo usamos las cookies</h3>
        <ul>
            <li><strong>Cookies Esenciales:</strong> Necesarias para el funcionamiento del sitio.</li>
            <li><strong>Cookies de Rendimiento:</strong> Nos ayudan a entender cómo interactúan los usuarios con el sitio.</li>
            <li><strong>Cookies Funcionales:</strong> Permiten recordar sus elecciones (como el idioma).</li>
        </ul>
    </LegalLayout>
);

export const MedicalDisclaimer = () => (
    <LegalLayout title="Aviso Médico" lastUpdated="23 de Enero, 2026">
        <div className={styles.alertBox}>
            <p className={styles.alertTitle}>
                <AlertTriangle size={20} /> IMPORTANTE
            </p>
            <p className={styles.alertText}>
                MealfitRD es una herramienta de información y bienestar, no un servicio médico.
            </p>
        </div>

        <p>La información y los planes de alimentación proporcionados por MealfitRD son solo para fines informativos y educativos. No pretenden sustituir el consejo, diagnóstico o tratamiento médico profesional.</p>

        <h3>Consulta a tu Médico</h3>
        <p>Siempre busque el consejo de su médico u otro proveedor de salud calificado con cualquier pregunta que pueda tener sobre una condición médica. Nunca ignore el consejo médico profesional ni se demore en buscarlo debido a algo que haya leído en este sitio web.</p>

        <h3>Sin Relación Médico-Paciente</h3>
        <p>El uso de este sitio y la generación de planes dietéticos no crea una relación médico-paciente. Si cree que tiene una emergencia médica, llame a su médico o a los servicios de emergencia de inmediato.</p>
    </LegalLayout>
);
