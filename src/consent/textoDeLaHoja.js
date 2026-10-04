// [P1-PLAN-LOTE-844 · 2026-09-29] El texto de la hoja «Tus datos y la IA» (auditoría App Store, §A.1, base es-DO, y la
// línea médica de §A.4.1). Vive en el JS a propósito: se corrige por OTA, sin binario nuevo.
//
// UNA sola fuente para lo que se PINTA y lo que se FIRMA: la hoja dibuja estos bloques y el SHA-256 que viaja con el
// permiso (`text_sha256`) se calcula sobre ellos, en el idioma en que se mostraron. Cambiar el texto de forma que
// cambie lo que se promete (un proveedor, los datos, el país) exige subir `AI_CONSENT_VERSION` (version.js) y el
// backend: la versión es lo que vuelve a pedir el permiso.
//
// Los nombres de los proveedores son nombres propios y no se traducen; todo lo demás va por `t()` (la clave ES el
// español) y la marca entra como `{app}` (P3-I18N-MARCA-HORNEADA-EN-26-CLAVES).
import { BRAND } from '../data/routeMeta';

/** Los bloques de la hoja, ya traducidos con `t`. */
export function textoDeLaHoja(t) {
    return {
        titulo: t('Tus datos y la IA'),
        intro: t('Para crear tu plan, responderte en el coach y analizar tus fotos, {app} envía algunos de tus datos a proveedores de inteligencia artificial externos. No los usamos para publicidad ni los vendemos.', { app: BRAND }),
        proveedores: [
            {
                nombre: 'DeepSeek',
                donde: t('Hangzhou DeepSeek, República Popular China'),
                recibe: t('Recibe tu perfil de salud (edad, peso, condiciones, medicamentos, alergias, embarazo, restricción religiosa de dieta), tus preferencias, tu nombre, tus mensajes con el coach y lo que anotas en el diario.'),
                para: t('Para generar partes de tu plan, responderte en el coach y estimar lo que anotas.'),
            },
            {
                nombre: 'OpenAI',
                donde: t('EE. UU.'),
                recibe: t('Recibe tu perfil de salud, tus preferencias y, cuando hace falta, parte de la conversación. En el modo voz en vivo, recibe el audio de tu micrófono y las respuestas del coach.'),
                para: t('Para generar días de tu plan, revisar que sea seguro, servir de respaldo y escuchar y responder en el modo voz en vivo.'),
            },
            {
                nombre: 'Google Gemini',
                donde: t('EE. UU.'),
                recibe: t('Recibe las fotos que escaneas o envías al chat, lo que escribes para aclararlas y tu país; en el modo voz, el texto que lee en voz alta.'),
                para: t('Para reconocer los alimentos y generar la voz.'),
            },
            {
                nombre: 'Cohere',
                donde: t('Servidores principalmente en EE. UU.'),
                recibe: t('Recibe un resumen de tu perfil (objetivo, alergias, condiciones), las notas que el coach recuerda de ti y la descripción de tus comidas.'),
                para: t('Para que el coach encuentre lo relevante.'),
            },
        ],
        chinaTitulo: t('Transferencia a China'),
        china: t('DeepSeek trata tus datos en la República Popular China. La Unión Europea no reconoce a China un nivel de protección adecuado y no tenemos firmadas cláusulas contractuales con DeepSeek: tus datos podrían quedar al alcance de las autoridades de ese país y te sería más difícil ejercer allí tus derechos.'),
        casillaIA: t('Acepto que {app} use mis datos de salud para crear mi plan y darme el coach, y que los envíe a los proveedores de IA indicados.', { app: BRAND }),
        casillaChina: t('Acepto que mis datos se envíen a DeepSeek, en China, conociendo los riesgos descritos.'),
        opcional: t('Opcional'),
        casillaAnalitica: t('Ayúdanos a mejorar: analítica de uso, sin datos de salud.'),
        medico: t('{app} no sustituye a tu médico ni a tu nutricionista. Consúltales antes de cambiar tu alimentación, sobre todo si tienes una condición médica, tomas medicamentos, estás embarazada o en lactancia, o te operaron de cirugía bariátrica.', { app: BRAND }),
        retirada: t('Puedes retirar tu permiso cuando quieras en Configuración → Privacidad → IA de terceros. Retirarlo detiene los envíos nuevos.'),
        politica: t('Política de Privacidad'),
        usoIA: t('Uso de IA'),
    };
}

/** El texto mostrado, plano y en orden: es lo que se firma. */
export function textoPlanoDeLaHoja(tx) {
    return [
        tx.titulo,
        tx.intro,
        ...tx.proveedores.flatMap((p) => [p.nombre, p.donde, p.recibe, p.para]),
        tx.chinaTitulo,
        tx.china,
        tx.casillaIA,
        tx.casillaChina,
        tx.opcional,
        tx.casillaAnalitica,
        tx.medico,
        tx.retirada,
        tx.politica,
        tx.usoIA,
    ].join('\n');
}

/** SHA-256 en hexadecimal minúsculo del texto, o null donde no hay `crypto.subtle` (contexto no seguro). */
export async function huellaDelTexto(texto) {
    try {
        const sutil = globalThis.crypto && globalThis.crypto.subtle;
        if (!sutil || typeof TextEncoder === 'undefined') return null;
        const bytes = await sutil.digest('SHA-256', new TextEncoder().encode(String(texto)));
        return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
        return null;
    }
}
