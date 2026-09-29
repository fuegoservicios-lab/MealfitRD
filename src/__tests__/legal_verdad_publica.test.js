/**
 * [P1-VERDAD-PUBLICA · 2026-08-19] La copia del dashboard tampoco puede afirmarlo.
 *
 * POR QUÉ EXISTE ESTE FICHERO Y NO BASTA EL DEL LANDING. Cada documento legal
 * existe DOS veces: `content/privacy.html` en el repo del sitio estático sirve
 * bioboros.com/privacy, y `pages/legal/LegalPages.jsx` sirve
 * app.bioboros.com/privacy —comprobado, responde 200—. Son dos repositorios con
 * dos despliegues y nada que los sincronice.
 *
 * La afirmación que motivó esto vivía en TRES sitios a la vez: las dos copias más
 * `data-protection.html`. Corregir una sola habría movido la contradicción de
 * sitio en lugar de cerrarla, y habría sido más difícil de encontrar la segunda
 * vez, porque ya nadie estaría buscando.
 *
 * QUÉ SE MIDIÓ. La política publicada decía que recopilamos una contraseña
 * «gestionada con hashing y sal» y que la comprobamos contra HaveIBeenPwned «al
 * registrarse». Ninguna de las dos cosas ocurre:
 *
 *   - No hay alta ni ingreso con contraseña. `Login.jsx` implementa código de un
 *     solo uso al correo y Google, nada más. El único `type="password"` del árbol
 *     es el campo del token de administrador en `SupermarketPage.jsx`.
 *   - `checkLeakedPassword` tiene un único call site de producción,
 *     `ResetPassword.jsx:80`, dentro de un flujo que exige un token de correo
 *     previo. Nunca en un registro, porque no hay registro con contraseña.
 *
 * Lo peligroso de una afirmación así no es que sea falsa: es que describe una
 * protección que el lector podría estar contando como suya.
 *
 * ⚠ LA TABLA ESTÁ DUPLICADA A PROPÓSITO, y conviene saberlo. El original es
 * `verdad-publica.json` del repo del landing; aquí sólo están las frases que
 * afectan a ESTA copia. Compartir el fichero exigiría que un repo dependiera del
 * otro, que es justo lo que `P1-BUILD-AUTONOMO` quitó. La duplicación queda
 * registrada como cuestión abierta en `contenido-legal.json`
 * (`dos-copias-del-mismo-texto-legal`); la salida real es que haya UNA copia.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LEGAL = path.join(process.cwd(), 'src', 'pages', 'legal', 'LegalPages.jsx');

/** Frases medidas como falsas, con la razón que las refuta. */
const REFUTADAS = [
    {
        frase: 'contraseña (gestionada de forma segura',
        porque: 'no se recopila ninguna contraseña: el ingreso es OTP por correo o Google',
    },
    {
        frase: 'HaveIBeenPwned al registrarse',
        porque: 'no hay registro con contraseña; la comprobación vive sólo en el reset residual',
    },
    {
        frase: 'verificación de contraseñas filtradas (HaveIBeenPwned) al registrarse',
        porque: 'la misma afirmación en prosa, dos párrafos más abajo de la lista',
    },
    // [P1-POLITICAS-VERDAD-IA-PAISES · 2026-08-22] Medido contra el VPS: hay DOS
    // proveedores de IA (OPENAI_API_KEY viva; gpt-5.6 es el reviewer clínico de pago,
    // la red de fallback y el motor del escáner), el escáner está HABILITADO
    // (MEALFIT_VISION_PROVIDER=openai_compatible) y la app nativa NO vende nada
    // (P1-IOS-NATIVE-SHELL). Las mismas frases se retiraron del apex ese día.
    {
        frase: 'actualmente el proveedor es',
        porque: 'nombra UN proveedor de IA y hay varios (medido el 2026-09-28: DeepSeek, OpenAI, Google/Gemini y Cohere); omitir al que recibe las fotos es omitir a un destinatario',
    },
    {
        frase: 'actualmente el proveedor de inferencia es',
        porque: 'misma afirmación en la Política de IA',
    },
    {
        frase: 'cuando el análisis visual esté habilitado',
        porque: 'el escáner de fotos está habilitado en producción (hoy las fotos van a Gemini); presentarlo como futuro oculta un tratamiento que ya ocurre',
    },
    {
        frase: 'cuando esta función esté disponible',
        porque: 'misma afirmación, otra redacción',
    },
    {
        frase: 'contrata su suscripción dentro de la app',
        porque: 'la app de la App Store no tiene comercio (Apple 3.1.1, P1-IOS-NATIVE-SHELL); describe un flujo que no existe',
    },
    {
        frase: 'consentimiento expreso de un padre o tutor',
        porque: 'decisión del dueño 2026-08-22: solo 18+, sin excepción — datos de salud y medicación, sin mecanismo de consentimiento parental, y los otros dos documentos ya decían 18+',
    },
    // [P1-PLAN-LOTE-794 · 2026-09-28 · ronda 2] Las frases que `verdad-publica.json` del landing (rama
    // ia6d-legal, 2ab05b9/e94872d) ya prohíbe y que esta copia seguía diciendo. Con ellas la app y
    // bioboros.com volvían a publicar dos contratos distintos.
    {
        frase: 'Sin datos de salud, correo ni nombre',
        porque: 'el autocapture de PostHog está encendido en la app (observabilityScope.js) y manda el texto visible de lo que se pulsa: el chip «Diabetes T2» del formulario es un div role="button" con cursor: pointer, y con identify queda unido a la cuenta',
    },
    {
        frase: 'su nombre completo, correo',
        porque: 'agent.py pone user_profiles.full_name en el prompt del coach: el proveedor que mueve el chat SÍ recibe el nombre de la cuenta',
    },
    {
        frase: 'tu nombre completo, tu correo',
        porque: 'la misma promesa falsa, tuteada, en la Política de IA',
    },
    {
        frase: 'ni fingerprinting del navegador',
        porque: 'en modo sin cookies PostHog calcula en su servidor un código a partir de la IP, el navegador y una clave diaria; el landing retiró la frase',
    },
    // [P1-PLAN-LOTE-794 · ronda 2] (re-verificación, defecto 4) Proveedores medidos contra el VPS el
    // 2026-09-28 (/opt/mealfit/backend/.env): MEALFIT_LLM_PROVIDER=deepseek; las fotos van a Gemini
    // (MEALFIT_VISION_MODEL=gemini-3.8-flash, base generativelanguage.googleapis.com); OPENAI_API_KEY y
    // COHERE_API_KEY vivas. La copia decía «dos: Z.ai y OpenAI», y que OpenAI analiza las fotos.
    {
        frase: 'sólo a OpenAI',
        porque: 'las fotos del escáner las analiza Google (Gemini), no OpenAI',
    },
    {
        frase: 'Hoy son <strong>dos</strong>',
        porque: 'son cuatro proveedores de IA (DeepSeek, OpenAI, Google/Gemini y Cohere)',
    },
    {
        frase: 'Hoy son dos proveedores',
        porque: 'misma cuenta vieja, en la Política de IA',
    },
    {
        frase: 'revisión clínica de los planes de pago',
        porque: 'la revisión clínica corre también en el plan gratis (P1-REVIEWER-TIER-MODELS: free → Luna)',
    },
    {
        frase: 'a partir de su mensaje para recuperarlas',
        porque: 'Cohere recibe además un resumen del perfil al generar el plan, la descripción de las comidas escaneadas y el resumen de las no registradas (landing, ronda 2)',
    },
    {
        frase: 'PayPal, Z.ai, Neon',
        porque: 'la Política de Divulgación Responsable nombraba a Z.ai entre los encargados; hoy es DeepSeek (el landing ya lo dice)',
    },
    {
        frase: 'ElevenLabs',
        porque: 'producción no le envía nada desde el 31-may (P1-DEADCODE-TTS); nombrarlo declara un tratamiento que no ocurre',
    },
    // [FUSIÓN 0f + 6d · 2026-09-28] Lo que la rama lote-771-legal-react (0f) corrigió en esta copia y
    // las filas nuevas de `verdad-publica.json` del landing fusionado (rama ia6d-integ-landing). La
    // guarda «(sólo a OpenAI)» de 0f ya la cubre `sólo a OpenAI`, más arriba.
    {
        frase: 'Z.ai',
        porque: 'DeepSeek reemplazó a Z.ai como generador del plan y del coach; Z.ai ya no recibe nada (0 llamadas en llm_usage_events)',
    },
    {
        frase: 'decida compartir (cuando la función esté disponible)',
        porque: 'el escáner de fotos está vivo (hoy lo sirve Google, API de Gemini); la Política de Uso lo presentaba como futuro',
    },
    {
        frase: 'cómputo y de nuestro proveedor de IA',
        porque: 'son cuatro proveedores de IA (DeepSeek, OpenAI, Google y Cohere), no uno',
    },
    {
        frase: 'salvo el proveedor de inferencia',
        porque: 'los datos de salud los reciben varios proveedores de inferencia, además de Cohere, los avisos y la analítica (Protección de Datos §5)',
    },
    {
        frase: 'personas para las que cocina',
        porque: 'el tamaño del hogar no se pregunta ni se puede fijar (householdSize fijo en 1)',
    },
    {
        frase: 'Sirven para escalar las cantidades',
        porque: 'restos de la frase del hogar: el presupuesto acota la lista, nada escala las cantidades a cuántos comen',
    },
    // [FUSIÓN 0f + 6d · ronda 2 · 2026-09-28] Las prohibidas nuevas del landing (verdad-publica.json), en esta copia.
    {
        frase: 'No retenemos la imagen una vez procesada',
        porque: 'las fotos del chat del coach se guardan en chat_attachments junto a la conversación (routers/diary.py → db_chat.create_chat_attachment); sólo la del escáner se analiza en memoria',
    },
    {
        frase: 'La foto no se conserva una vez analizada',
        porque: 'la misma afirmación en la Política de IA §1',
    },
    {
        frase: 'se usa la voz de su dispositivo.',
        porque: 'el respaldo del modo voz es speechSynthesis, que prefiere las voces «google» sin filtrar localService: en Chrome de escritorio son de red y el texto llega a Google',
    },
    {
        frase: 'se usa la voz de tu dispositivo.',
        porque: 'lo mismo, tuteado, en la Política de IA §1',
    },
    {
        frase: 'Google trata las fotos bajo los',
        porque: 'Google recibe también el texto del modo voz (P1-PLAN-LOTE-685); las condiciones cubren los dos',
    },
    {
        frase: 'Ese acceso no incluye sus conversaciones',
        porque: 'absoluta y falsa: hay acceso técnico directo a la base de datos; lo que se puede prometer es lo que el PANEL de soporte no muestra',
    },
];

// [P1-PLAN-LOTE-794 · ronda 2] Lo que la copia TIENE que decir, igual que las `exigidas` del landing. Sin
// esto, retirar una frase falsa dejando el hueco pasaría por «no afirma nada falso».
const EXIGIDAS = [
    { frase: 'sin cookies ni almacenamiento local', porque: 'PostHog en cookieless_mode (§7/§13)' },
    { frase: 'una clave que cambia cada día', porque: 'el código seudónimo diario que PostHog calcula en su servidor (§7)' },
    { frase: 'texto visible', porque: 'el autocapture manda el texto de lo que se pulsa, chips de salud incluidos (§7/§8)' },
    { frase: 'el nombre de su cuenta', porque: 'el coach recibe el nombre (Privacidad §4)' },
    { frase: 'el nombre de tu cuenta', porque: 'el coach recibe el nombre (Política de IA §2)' },
    { frase: 'Hoy son <strong>cuatro</strong>', porque: 'DeepSeek, OpenAI, Google/Gemini y Cohere (Privacidad §4)' },
    { frase: 'Hoy son cuatro proveedores de IA', porque: 'la misma cuenta en la Política de IA' },
    { frase: 'DeepSeek', porque: 'MEALFIT_LLM_PROVIDER=deepseek en producción' },
    { frase: 'Gemini', porque: 'el escáner de fotos usa gemini-3.8-flash' },
    { frase: '<strong>Cohere</strong>', porque: '«cohere» es subcadena de «coherencia»: se exige el nombre marcado' },
    { frase: 'un resumen de su perfil (objetivo, alergias', porque: 'lo que Cohere recibe al generar el plan (Privacidad)' },
    { frase: 'un resumen de tu perfil (objetivo, alergias', porque: 'lo mismo en la Política de IA' },
    { frase: 'Google LLC', porque: 'Google en sus cuatro papeles: fotos, avisos de Android, voz del modo voz e identidad' },
    { frase: 'Firebase Cloud Messaging', porque: 'los avisos de Android llevan texto que puede mencionar la salud' },
    { frase: 'Apple Push Notification', porque: 'los avisos del iPhone, ídem' },
    // [FUSIÓN 0f + 6d · 2026-09-28] Las exigidas nuevas del landing fusionado, en esta copia.
    { frase: 'en cuatro papeles distintos', porque: 'Google: fotos, avisos de Android, voz del modo voz (P1-PLAN-LOTE-685) e identidad (Privacidad §8)' },
    { frase: 'enviamos el texto de esa respuesta a Google (API de Gemini', porque: 'desde el 685 la voz del modo voz la genera Google a partir del texto de la respuesta (Privacidad §2)' },
    { frase: 'a Bioboros sólo llega el texto transcrito', porque: 'el dictado convierte la voz en texto en el dispositivo (Privacidad §2)' },
    { frase: 'se usa la voz de su dispositivo', porque: 'el respaldo del modo voz es la voz del dispositivo o del navegador (Privacidad §2)' },
    { frase: 'Cada cambio queda registrado con quién lo hizo, cuándo y por qué, y cada consulta, con quién la hizo y cuándo.', porque: 'acceso del equipo de Bioboros (P1-PLAN-LOTE-771, Privacidad §5): cada acción del panel queda en admin_access_log' },
    { frase: 'Desde ese panel no se ven sus conversaciones con el asistente, sus fotos ni su perfil de salud.', porque: 'lo que el panel de soporte NO ve (Privacidad §5), acotado al panel' },
    // [FUSIÓN 0f + 6d · ronda 2 · 2026-09-28] Las exigidas nuevas del landing, en esta copia.
    { frase: 'puede generarse en servidores de su fabricante (por ejemplo, Google en Chrome)', porque: 'el respaldo de la voz puede ser de red (Privacidad §2 y Uso de IA §1)' },
    { frase: 'las lee la voz de su navegador o dispositivo', porque: 'lo mismo en Protección de Datos §5' },
    { frase: '<strong>lee en voz alta las respuestas del coach</strong>. Para las fotos', porque: 'Google en su papel de voz, en la lista de proveedores de Privacidad §4' },
    { frase: 'si usa el modo voz (sólo a Google)', porque: 'el texto que se lee en voz alta, en la lista de lo que se envía (Privacidad §4)' },
    { frase: 'Google trata las fotos y el texto del modo voz', porque: 'las condiciones de Google cubren fotos y voz (Privacidad §4)' },
    { frase: 'en el modo voz, <strong>lee en voz alta las respuestas del coach</strong>', porque: 'Google y la voz en la Política de IA §2' },
    { frase: 'si usas el modo voz (sólo a Google)', porque: 'la lista de lo que se envía en la Política de IA §2' },
    { frase: 'que en el modo voz también convierte en voz el texto de las respuestas del coach', porque: 'Google por la voz en las transferencias (Protección de Datos §6)' },
    { frase: 'Las fotos que usted envía al chat del coach sí se guardan', porque: 'chat_attachments (Privacidad §2)' },
    { frase: 'Las fotos que envías al chat del coach sí se guardan', porque: 'lo mismo en la Política de IA §1' },
    { frase: '<strong>Fotos de sus comidas (<code>IndexedDB</code>):</strong>', porque: 'la copia de la foto en el dispositivo (fotosDeComidas.js, P1-PLAN-LOTE-721), en Privacidad §13' },
    { frase: 'y los regalos que ha recibido, con su motivo', porque: 'lo que el panel de soporte muestra (admin_cuentas.ficha, Privacidad §5)' },
    { frase: 'se conserva aunque usted elimine su cuenta', porque: 'admin_access_log no tiene FK: el registro del equipo sobrevive al borrado (Privacidad §9)' },
    { frase: 'lo que se conserva después, y por qué, está en la Política de Privacidad (Sección 9)', porque: 'Protección de Datos §4 remite a lo que sobrevive al borrado' },
    { frase: 'aparece en la exportación de sus datos', porque: 'los regalos de cuenta (account_grants) salen en la exportación (Privacidad §2)' },
    { frase: 'genera días de su plan', porque: 'OpenAI genera días del plan en todos los planes, no sólo revisa los de pago (Privacidad §4)' },
    { frase: 'genera días de tu plan', porque: 'lo mismo en la Política de IA §2' },
    { frase: '<strong>Cohere Inc.</strong>', porque: 'Cohere como encargado en Privacidad §8' },
    { frase: 'los proveedores de inferencia', porque: 'Protección de Datos §5, en plural' },
    { frase: 'nuestros proveedores de IA', porque: 'Política de Uso §4, en plural' },
    { frase: 'no le pedimos aceptar cookies para la analítica', porque: 'PostHog sin cookies: no hay ninguna que aceptar (Privacidad §7)' },
    { frase: '<strong>9-1-1</strong> en República Dominicana', porque: 'Aviso Médico §6: el número de cada país (G94)' },
    { frase: '<strong>911</strong> en Estados Unidos, Puerto Rico y México', porque: 'Aviso Médico §6' },
    { frase: '<strong>112</strong> en España', porque: 'Aviso Médico §6' },
    { frase: '<strong>123</strong> en Colombia', porque: 'Aviso Médico §6' },
];

describe('P1-VERDAD-PUBLICA · la copia legal del dashboard', () => {
    const texto = fs.readFileSync(LEGAL, 'utf8');

    it.each(REFUTADAS)('no afirma «$frase»', ({ frase, porque }) => {
        const donde = texto.toLowerCase().indexOf(frase.toLowerCase());
        expect(
            donde,
            `LegalPages.jsx afirma «${frase}», y ${porque}. `
            + `La misma frase se retiró de content/privacy.html y content/data-protection.html `
            + `en el repo del landing: si vuelve aquí, el usuario con sesión iniciada lee un `
            + `contrato distinto del que lee el visitante.`,
        ).toBe(-1);
    });

    it.each(EXIGIDAS)('dice «$frase»', ({ frase, porque }) => {
        expect(
            texto.toLowerCase().includes(frase.toLowerCase()),
            `LegalPages.jsx ya no dice «${frase}» (${porque}). El landing lo exige en su copia `
            + `(verdad-publica.json): sin ello las dos políticas vuelven a decir cosas distintas.`,
        ).toBe(true);
    });

    // Sin esta comprobación, borrar la sección entera dejaría el test en verde: el
    // fichero pasaría por «no afirma nada falso» simplemente por no afirmar nada.
    it('sigue describiendo cómo se entra de verdad', () => {
        expect(texto).toMatch(/sin contrase|c[oó]digo de un solo uso/i);
    });
});
