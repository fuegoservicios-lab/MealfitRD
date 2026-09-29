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
    // [P1-PLAN-LOTE-794 · 2026-09-28 · ronda 2] Aquí vivía «Sin datos de salud, correo ni nombre», que
    // `verdad-publica.json` del landing prohibía. [Delta legal n.º 1 · ronda 3 · 2026-09-29] Sale de las
    // refutadas y pasa a EXIGIDA como «No recibe datos de salud» (fila `posthog-sin-datos-de-salud` del
    // landing): con frontend 3d6d079b (P1-PLAN-LOTE-842, rondas 1 y 2) el formulario, Configuración entera,
    // «Evaluar de nuevo», el check-in de renovación y los vasos del agua quedan fuera del autocapture, y
    // ningún evento propio lleva datos del perfil.
    // [Delta legal n.º 1 · 2026-09-29] PostHog YA NO recibe el texto de lo que se pulsa: desde el lote 716
    // (4ffc8391, en producción desde el 29-sep ~02:00 UTC) observabilityScope.js:55-60 pasa a posthog.init
    // mask_all_text + mask_all_element_attributes. Prueba con el SDK real: rama lote-840 de la sesión 0f
    // (lote840.test.js). Las mismas filas del landing (verdad-publica.json, rama ia6d-integ-landing).
    {
        frase: 'texto visible',
        porque: 'el autocapture enmascara el texto de lo que se pulsa desde el lote 716: decir que PostHog recibe el texto visible (y con él una opción de salud) describe una fuga que ya no existe',
    },
    {
        frase: 'puede recibir el texto de una opción de salud',
        porque: 'la misma afirmación en Protección de Datos §5: la analítica ya no está entre los que reciben datos de salud',
    },
    // [Delta legal n.º 1 · ronda 2 · 2026-09-29] El revisor de 6d, con el SDK real: con mask_all_text +
    // mask_all_element_attributes, posthog-js 1.399.2 sigue mandando tag_name, classes, nth_child/nth_of_type y
    // el href. Lo que hace cierto el texto es el lote 842 (frontend cd3c7d3b, rama lote-840, SIN desplegar):
    // ph-no-capture en las preguntas del formulario y en la rejilla de Configuración (lote842.test.jsx). Las
    // mismas filas del landing (verdad-publica.json, rama ia6d-integ-landing).
    {
        frase: 'sin su texto ni sus atributos',
        porque: 'con mask_all_element_attributes el SDK sigue mandando las clases CSS (classes) y el href del enlace pulsado: son atributos',
    },
    {
        frase: 'no sabe qué opción eligió',
        porque: 'fuera de las zonas con ph-no-capture la posición del control viaja (nth_child): con 3d6d079b la porción del escáner (½/1/1½/2) o Sorbo/Vaso/Botella del agua siguen diciendo con su posición qué se eligió (antes también la escala de hambre y energía del check-in, medido con el SDK real)',
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
    // [FUSIÓN 0f + 6d · ronda 3 · 2026-09-29] Las prohibidas nuevas del landing (verdad-publica.json), en esta copia.
    {
        frase: 'las fotos de comida que usted escanea o envía al chat',
        porque: 'el chat manda a Google y guarda CUALQUIER imagen (routers/diary.py purpose=chat, sin mirar el contenido); sólo el escáner es de comida (Privacidad §4)',
    },
    {
        frase: '<strong>análisis de las fotos de comida</strong> que usted escanea o envía al chat',
        porque: 'la misma acotación en la entrada de Google de Privacidad §8',
    },
    {
        frase: 'Las fotos de comida que usted decide escanear o enviar al chat',
        porque: 'la misma acotación en la lista de lo que se envía (Privacidad §4)',
    },
    {
        frase: 'Las fotos de comida que decidas escanear o enviar al chat',
        porque: 'la misma acotación, tuteada, en la Política de IA §2',
    },
    {
        frase: 'no guarda su correo, su nombre ni su perfil de salud.',
        porque: 'absoluta: el motivo de cada ajuste del panel es texto libre del personal y se guarda en admin_access_log (lote-771 admin_cuentas._motivo) — Privacidad §9',
    },
    {
        frase: '<strong>DeepSeek</strong> genera partes de su plan y mueve la conversación con el coach.',
        porque: 'DeepSeek estima además las comidas anotadas por escrito (estimate-macros/estimate-plate/scan: ChatGLM flash → deepseek), como ya dice Privacidad §8',
    },
    {
        frase: '<strong>DeepSeek</strong> genera partes de tu plan y mueve la conversación con el coach;',
        porque: 'la misma omisión en la Política de IA §2',
    },
    {
        frase: 'Política de Privacidad (Secciones 7 y 8)',
        porque: 'la voz y el dictado viven en Privacidad §2: Protección de Datos §5 tiene que remitir también a ella',
    },
    // [P1-APP-VARIANTES · 2026-09-29 · pedido de 0f] Espejo de verdad-publica.json del landing
    // (`plazo-de-respuesta-24-horas`, `respondemos-en-menos-de`, `ruta-de-menu-ajustes`, `desde-ajustes`,
    // `ajustes-en-negrita`, `renovacion-en-ajustes`). El dueño no ha comprometido plazo de respuesta, y la app
    // no tiene ningún menú «Ajustes»: la pantalla es «Configuración» (AccountMenu.jsx:180, Settings.jsx
    // sectionsConfig). El «Ajustes» que sí existe es el del sistema del teléfono, no un menú de Bioboros.
    //
    // `landing` dice de dónde se retiró la frase en el repo del landing; sin él, el mensaje de fallo da el
    // origen de las primeras filas de esta tabla (privacy + data-protection), que no es el de éstas.
    {
        frase: 'menos de 24 horas',
        porque: 'Reembolsos §8 prometía un plazo de respuesta que el dueño no ha comprometido',
        landing: 'La misma frase se retiró de content/refunds.html (§8) y del pie de todo el sitio en el repo del landing',
    },
    {
        frase: 'Respondemos en menos de',
        porque: 'la misma promesa con otro número',
        landing: 'La misma frase se retiró de content/refunds.html (§8) y del pie de todo el sitio en el repo del landing',
    },
    {
        frase: 'Ajustes →',
        porque: 'no hay menú «Ajustes» en la app: es Configuración (Privacidad §7, §10 y §13)',
        landing: 'La misma frase se retiró de content/privacy.html en el repo del landing',
    },
    {
        frase: 'desde Ajustes',
        porque: 'el mismo menú inexistente sin flecha (Privacidad §2 y §10, Términos §3 y §8)',
        landing: 'La misma frase se retiró de content/privacy.html y content/terms.html en el repo del landing',
    },
    {
        frase: '<strong>Ajustes</strong>',
        porque: 'el mismo menú inexistente en negrita (Reembolsos §2, Protección de Datos §5)',
        landing: 'La misma frase se retiró de content/refunds.html y content/data-protection.html en el repo del landing',
    },
    {
        frase: 'en Ajustes o en PayPal',
        porque: 'el mismo menú inexistente (Reembolsos §5)',
        landing: 'La misma frase se retiró de content/refunds.html en el repo del landing',
    },
    // [P1-APP-VARIANTES · 2026-09-29 · pedido de 0f] Espejo de `plazo-en-dias-habiles`,
    // `plazo-de-respuesta-menor-que-24h` y su forma escapada. ALCANCE de esta tabla: sólo la copia legal
    // (`LegalPages.jsx`). El beneficio del plan Max de `pages/Upgrade.jsx`, que vendía el mismo plazo, lo
    // vigila su propio bloque más abajo (decisión de 0f del 29-sep). «Respondemos en» a secas no se prohíbe:
    // casaría con Protección de Datos §5 («Respondemos en un plazo máximo de treinta (30) días»), plazo de
    // norma que se queda.
    {
        frase: 'días hábiles',
        porque: 'Divulgación Responsable §1 prometía acusar recibo en 3 días hábiles, un plazo que el dueño no ha comprometido',
        landing: 'La misma frase se retiró de content/responsible-disclosure.html (§1) en el repo del landing',
    },
    {
        frase: '< 24h',
        porque: 'la misma promesa de plazo en forma abreviada',
        landing: 'El landing la prohíbe en todo el sitio (verdad-publica.json), donde nunca llegó a publicarse',
    },
    {
        frase: '&lt; 24h',
        porque: 'la misma promesa de plazo en forma abreviada, escrita como entidad HTML',
        landing: 'El landing la prohíbe en todo el sitio (verdad-publica.json), donde nunca llegó a publicarse',
    },
];

// [P1-PLAN-LOTE-794 · ronda 2] Lo que la copia TIENE que decir, igual que las `exigidas` del landing. Sin
// esto, retirar una frase falsa dejando el hueco pasaría por «no afirma nada falso».
const EXIGIDAS = [
    { frase: 'sin cookies ni almacenamiento local', porque: 'PostHog en cookieless_mode (§7/§13)' },
    { frase: 'una clave que cambia cada día', porque: 'el código seudónimo diario que PostHog calcula en su servidor (§7)' },
    { frase: 'sin su texto', porque: 'fuera de las zonas con ph-no-capture el autocapture registra qué control se pulsa, sin su texto pero con su tipo, posición, clases y enlace (§7, delta legal n.º 1)' },
    { frase: 'no registra nada de lo que usted pulsa', porque: 'el formulario, Configuración entera, el check-in de renovación y los vasos del agua llevan ph-no-capture (842, 3d6d079b): sólo es cierto con ese frontend desplegado (§7, delta legal n.º 1 · rondas 2 y 3)' },
    // [Delta legal n.º 1 · ronda 3 · 2026-09-29] Las mismas exigidas del landing (verdad-publica.json, rama
    // ia6d-integ-landing): posthog-sin-datos-de-salud, posthog-eventos-propios-de-configuracion y
    // posthog-sin-salud-en-proteccion-de-datos. Sólo son ciertas con frontend 3d6d079b desplegado.
    { frase: 'No recibe datos de salud', porque: 'con 3d6d079b ninguna pantalla donde lo pulsado es un dato del perfil de salud entra en el autocapture, y ningún trackEvent lleva datos del perfil (§8, remite a §7)' },
    { frase: 'como eventos propios de Bioboros', porque: 'ph-no-capture no corta los eventos propios: de Configuración salen locale_changed (i18n/index.js:810, desde Settings.jsx:457) y plan_regeneration_triggered con account_reset (Settings.jsx:2927), y §7 los nombra' },
    { frase: 'La analítica de producto (PostHog) no los recibe', porque: 'Protección de Datos §5, la sección de datos sensibles, lo dice en positivo y no sólo callando' },
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
    // [FUSIÓN 0f + 6d · ronda 3 · 2026-09-29] Las exigidas nuevas del landing (verdad-publica.json), en esta copia.
    { frase: 'y las fotos que usted envía al chat</strong>', porque: 'Google recibe cualquier foto del chat, no sólo de comida (Privacidad §4)' },
    { frase: 'y las fotos que usted envía al chat (sólo a Google)', porque: 'la lista de lo que se envía (Privacidad §4)' },
    { frase: 'y de las fotos que usted envía al chat</strong>', porque: 'la entrada de Google en Privacidad §8' },
    { frase: 'y las fotos que envíes al chat, con lo que escribas para aclararlas', porque: 'la lista de lo que se envía (Política de IA §2)' },
    { frase: 'No recibe sus fotos.', porque: 'OpenAI no recibe ninguna foto: el único cliente de imágenes va a Gemini (Privacidad §8)' },
    { frase: 'las que sube sin llegar a enviarlas, pasadas 24 horas', porque: 'la purga de adjuntos del chat sin mensaje (db_chat._cleanup_orphan_chat_attachments + cron horario del lote 798), Privacidad §2' },
    { frase: '<strong>Borrador del chat (<code>IndexedDB</code>):</strong>', porque: 'chatDraftStore.js: texto y hasta 4 fotos por conversación en el dispositivo (Privacidad §13)' },
    { frase: 'más allá de lo que el personal escriba como motivo de un ajuste, que no debe incluir datos personales', porque: 'la única salvedad que el código permite al registro del equipo (Privacidad §9)' },
    { frase: 'estima las macros de las comidas que usted anota por escrito', porque: 'DeepSeek en Privacidad §4, como en §8' },
    { frase: 'para estimar sus macros (sólo a DeepSeek)', porque: 'las listas de lo que se envía (Privacidad §4 y Política de IA §2)' },
    { frase: 'estima las macros de las comidas que anotas por escrito', porque: 'DeepSeek en la Política de IA §2' },
    { frase: 'Política de Privacidad (Secciones 2, 7 y 8)', porque: 'Protección de Datos §5 remite a donde viven la voz y el dictado' },
    // [P1-APP-VARIANTES · 2026-09-29 · pedido de 0f] Las rutas de menú REALES (exigidas del landing con el mismo id).
    { frase: 'Configuración → General → Notificaciones', porque: 'Settings.jsx: sección General (id profile), título «Notificaciones» (Privacidad §2) — `ruta-notificaciones`' },
    { frase: 'Configuración → Privacidad → «Ayuda a mejorar Bioboros»', porque: 'Settings.jsx: Privacidad → Preferencias → t(\'Ayuda a mejorar {app}\') (Privacidad §7 y §13) — `ruta-analitica-configuracion-privacidad`' },
    { frase: 'Configuración → Privacidad → Eliminar mi cuenta', porque: 'DeleteAccountSection dentro de Privacidad, botón «Eliminar mi cuenta» (Privacidad §10) — `ruta-eliminar-cuenta`' },
    { frase: 'Configuración → Privacidad → Exportar datos', porque: 'Privacidad → «Tus datos» → «Exportar datos» (Privacidad §10) — `ruta-exportar-datos`' },
    { frase: 'desde <strong>Configuración</strong> en la aplicación', porque: 'Protección de Datos §5 — `ruta-configuracion-proteccion-datos`' },
    { frase: 'Configuración → Suscripción → «Cancelar Suscripción»', porque: 'Settings.jsx: botón «Cancelar Suscripción» de la sección Suscripción (Reembolsos §2) — `ruta-cancelar-suscripcion`' },
    { frase: 'la app para iPhone o Android no muestra esa sección', porque: 'SECTION_IDS quita Suscripción con nativeHidesCommerce() (Reembolsos §2) — `cancelar-no-en-la-app-nativa`' },
    { frase: 'Configuración → Suscripción (al usar Bioboros en el navegador)', porque: 'Términos §3 y §8 — `ruta-cancelar-terminos`' },
    // [Decisión de 0f · 2026-09-29] Las tres de arriba son `solo_web` en el landing: /app/terms y /app/refunds
    // (las que abre la app nativa) las quitan y dejan sólo la cuenta de PayPal (Apple 3.1.1). Esta copia es la
    // WEB (app.bioboros.com en el navegador), así que aquí se siguen exigiendo.
    { frase: 'reembolsos, escríbenos a <strong>bioboros.support@gmail.com</strong>.', porque: 'Reembolsos §8 sigue dando el correo, sin plazo — `reembolsos-contacto-sin-plazo`' },
    { frase: 'Confirmaremos la recepción de tu reporte.', porque: 'Divulgación Responsable §1 sigue comprometiendo el acuse, sin plazo — `divulgacion-acuse-sin-plazo`' },
];

// [FUSIÓN 0f + 6d · ronda 3 · 2026-09-29] La FAQ de Investigación también existe dos veces:
// `content/research.html` en el landing y `ResearchPage.jsx` aquí. Misma fila que el landing
// (`research-un-solo-proveedor` / `research-proveedores-en-plural`).
const RESEARCH = path.join(process.cwd(), 'src', 'pages', 'ResearchPage.jsx');
const RESEARCH_REFUTADAS = [
    { frase: 'El modelo generativo base es de un proveedor externo', porque: 'son cuatro proveedores de IA (DeepSeek, OpenAI, Google/Gemini y Cohere), no uno' },
];
const RESEARCH_EXIGIDAS = [
    { frase: 'Los modelos de IA que usamos son de proveedores externos', porque: 'la FAQ habla de los proveedores en plural, como las políticas' },
];

describe('P1-VERDAD-PUBLICA · la copia legal del dashboard', () => {
    const texto = fs.readFileSync(LEGAL, 'utf8');

    it.each(REFUTADAS)('no afirma «$frase»', ({ frase, porque, landing }) => {
        const donde = texto.toLowerCase().indexOf(frase.toLowerCase());
        const origen = landing
            ?? 'La misma frase se retiró de content/privacy.html y content/data-protection.html en el repo del landing';
        expect(
            donde,
            `LegalPages.jsx afirma «${frase}», y ${porque}. `
            + `${origen}: si vuelve aquí, el usuario con sesión iniciada lee un `
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

// [P1-APP-VARIANTES · 2026-09-29 · pedido de 0f] El pie de las páginas públicas de la app React también
// prometía «Respondemos en menos de 24 horas», como el pie del landing (`plazo-de-respuesta-24-horas`).
const FOOTER = path.join(process.cwd(), 'src', 'components', 'layout', 'Footer.jsx');

describe('P1-VERDAD-PUBLICA · el pie de la app React', () => {
    const texto = fs.readFileSync(FOOTER, 'utf8');

    it.each(['menos de 24 horas', 'Respondemos en menos de'])('no promete un plazo de respuesta («%s»)', (frase) => {
        expect(
            texto.toLowerCase().indexOf(frase.toLowerCase()),
            `Footer.jsx dice «${frase}»: el dueño no ha comprometido ningún plazo de respuesta, y el pie del landing ya no lo dice.`,
        ).toBe(-1);
    });

    it('sigue dando el correo de soporte', () => {
        expect(texto).toContain('mailto:bioboros.support@gmail.com');
    });
});

describe('P1-VERDAD-PUBLICA · la FAQ de Investigación del dashboard', () => {
    const texto = fs.readFileSync(RESEARCH, 'utf8');

    it.each(RESEARCH_REFUTADAS)('no afirma «$frase»', ({ frase, porque }) => {
        expect(
            texto.toLowerCase().indexOf(frase.toLowerCase()),
            `ResearchPage.jsx afirma «${frase}», y ${porque}. content/research.html del landing ya no lo dice.`,
        ).toBe(-1);
    });

    it.each(RESEARCH_EXIGIDAS)('dice «$frase»', ({ frase, porque }) => {
        expect(
            texto.toLowerCase().includes(frase.toLowerCase()),
            `ResearchPage.jsx ya no dice «${frase}» (${porque}). El landing lo exige en content/research.html.`,
        ).toBe(true);
    });
});

// [P1-APP-VARIANTES · 2026-09-29 · decisión de 0f] El beneficio «Soporte Prioritario VIP» del plan Max
// (`pages/Upgrade.jsx`) vendía una respuesta en menos de 24 h con un técnico asignado. Nadie ha comprometido
// ese plazo: un plazo vendido que no se cumple es una promesa comercial engañosa (`plazo-de-respuesta-24-horas`
// y `plazo-de-respuesta-menor-que-24h` del landing). Pasa a «Soporte prioritario». Reversible: el día que el
// dueño comprometa un plazo, se quita este bloque junto con el cambio de copy.
const UPGRADE = path.join(process.cwd(), 'src', 'pages', 'Upgrade.jsx');
const CATALOGOS = ['en-US', 'fr-FR', 'it-IT', 'pt-BR'];
const PLAZO_VENDIDO = /<\s*24\s*h|&lt;\s*24\s*h|menos de 24 horas|técnico dedicado/i;

describe('P1-VERDAD-PUBLICA · el soporte que vende Upgrade.jsx', () => {
    it('Upgrade.jsx no vende un plazo de respuesta', () => {
        const hit = fs.readFileSync(UPGRADE, 'utf8').match(PLAZO_VENDIDO);
        expect(hit?.[0] ?? null, `Upgrade.jsx vende «${hit?.[0]}»: nadie ha comprometido un plazo de respuesta.`).toBeNull();
    });

    it('Upgrade.jsx sigue describiendo el beneficio', () => {
        expect(fs.readFileSync(UPGRADE, 'utf8')).toContain("desc: t('Soporte prioritario')");
    });

    it.each(CATALOGOS)('el catálogo %s no traduce el plazo viejo', (loc) => {
        const catalogo = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'i18n', 'locales', `${loc}.json`), 'utf8'));
        expect(catalogo).not.toHaveProperty(['Respuesta < 24h con técnico dedicado']);
        expect(typeof catalogo['Soporte prioritario'], `${loc}.json no traduce «Soporte prioritario»`).toBe('string');
        expect(catalogo['Soporte prioritario']).not.toBe('');
    });
});
