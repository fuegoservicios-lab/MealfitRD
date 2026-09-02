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
        porque: 'nombra UN proveedor de IA y hay dos (Z.ai + OpenAI); omitir al que recibe las fotos es omitir a un destinatario',
    },
    {
        frase: 'actualmente el proveedor de inferencia es',
        porque: 'misma afirmación en la Política de IA',
    },
    {
        frase: 'cuando el análisis visual esté habilitado',
        porque: 'el escáner de fotos está habilitado en producción y las fotos van a OpenAI; presentarlo como futuro oculta un tratamiento que ya ocurre',
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

    // Sin esta comprobación, borrar la sección entera dejaría el test en verde: el
    // fichero pasaría por «no afirma nada falso» simplemente por no afirmar nada.
    it('sigue describiendo cómo se entra de verdad', () => {
        expect(texto).toMatch(/sin contrase|c[oó]digo de un solo uso/i);
    });
});
