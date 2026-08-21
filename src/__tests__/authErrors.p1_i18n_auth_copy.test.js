/* [P1-I18N-AUTH-COPY · 2026-08-21] La copia de error del acceso, en los cinco idiomas.
 *
 * `utils/authErrors.js` tenía CERO imports y nueve `return` de literal español, dentro
 * de un formulario cuyos 27 textos restantes ya pasaban por `t()`. Era el único trozo
 * en español de esa pantalla y aparecía justo cuando algo va mal: la primera impresión
 * de un usuario anglófono que se equivoca de código era un mensaje que no entiende.
 *
 * LO QUE CAMBIA DE VERDAD no es envolver nueve cadenas — eso es mecánico — sino cómo se
 * decide qué mensajes pasan TAL CUAL a la pantalla. Antes se olfateaba el idioma: si el
 * texto «parecía español», pasaba. Ese heurístico existía para respetar nuestro propio
 * copy («Código inválido o expirado.»), que es más accionable que un genérico. Al
 * encender los idiomas rompía por los dos lados:
 *
 *   · nuestros emisores (`authClient.js`, `firstPartySession.js`) ahora mandan el texto
 *     YA traducido, así que en francés dejaban de «parecer español» y degradaban a
 *     genérico — perdiendo justo la precisión que la rama existía para conservar;
 *   · y un mensaje español del servidor mostrado a quien lee francés reproduce el bug
 *     que esta función se escribió para cerrar.
 *
 * Se sustituye por un CONTRATO: quien emite declara que el mensaje es suyo con `mfCopy`.
 * Una propiedad del dato es más fiable que adivinarla mirándolo — la misma lección que
 * dejó escrita P1-DIET-CANON-SSOT.
 */
import { describe, it, expect } from 'vitest';
import { humanizeAuthError } from '../utils/authErrors';

// Un `t` de mentira que marca lo traducido, para poder distinguir «pasó por el
// catálogo» de «salió el español de siempre» sin cargar los catálogos reales.
const tFake = (es) => `[fr] ${es}`;

describe('[P1-I18N-AUTH-COPY] las ocho familias pasan por t()', () => {
    const casos = [
        ['timeout', { code: 'request_timeout', message: 'x' }],
        ['credenciales', { message: 'Invalid login credentials' }],
        ['rate limit', { message: 'rate limit exceeded' }],
        ['5xx', { message: 'HTTP 503 Service Unavailable' }],
        ['sesión inválida', { message: 'invalid session' }],
        ['validación', { message: 'HTTP 400 malformed' }],
        ['genérico', { message: 'Unexpected upstream failure xyz-42' }],
        ['red', { message: 'Failed to fetch' }],
    ];

    for (const [etiqueta, err] of casos) {
        it(`${etiqueta} se traduce`, () => {
            const msg = humanizeAuthError(err, tFake, 'fr-FR');
            expect(msg.startsWith('[fr] '), `«${msg}» no pasó por t()`).toBe(true);
        });
    }
});

describe('[P1-I18N-AUTH-COPY] sin `t`, se comporta como antes', () => {
    // MUTACIÓN DE CONTROL del bloque de arriba: si la función devolviera SIEMPRE algo
    // marcado, aquellos tests pasarían sin probar nada.
    it('devuelve el español de siempre', () => {
        const msg = humanizeAuthError({ code: 'request_timeout', message: 'x' });
        expect(msg).toBe('La conexión tardó demasiado. Inténtalo de nuevo.');
    });

    it('los cuatro consumidores viejos siguen funcionando con un solo argumento', () => {
        expect(humanizeAuthError({ message: 'invalid session' })).toMatch(/sesión/i);
        expect(humanizeAuthError({ message: 'rate limit exceeded' })).toMatch(/intentos/i);
    });
});

describe('[P1-I18N-AUTH-COPY] el contrato `mfCopy` sustituye al olfato de idioma', () => {
    it('un mensaje NUESTRO pasa tal cual, aunque esté en francés', () => {
        // El caso que el heurístico rompía: `authClient` ya tradujo el texto, así que
        // «Code invalide ou expiré.» no parece español — y degradaba a genérico.
        const err = { message: 'Code invalide ou expiré.', mfCopy: true };
        expect(humanizeAuthError(err, tFake, 'fr-FR')).toBe('Code invalide ou expiré.');
    });

    it('un mensaje AJENO en español NO se le enseña a quien lee francés', () => {
        // Sin `mfCopy` y con locale no español, un texto español suelto es ruido: se
        // clasifica como cualquier otro error en vez de pintarse crudo.
        const err = { message: 'Su código de verificación no pudo procesarse.' };
        const msg = humanizeAuthError(err, tFake, 'fr-FR');
        expect(msg.startsWith('[fr] '), `«${msg}» se pintó crudo en una UI francesa`).toBe(true);
    });

    it('en es-DO el heurístico sigue vivo como red para emisores sin `mfCopy`', () => {
        // NO REGRESIÓN: el comportamiento actual de la base dominicana no cambia ni un
        // caracter. Si esto falla, el arreglo de i18n rompió el idioma de todos los
        // usuarios de hoy para arreglar el de los de mañana.
        const err = { message: 'Ese correo no está registrado.' };
        expect(humanizeAuthError(err, tFake, 'es-DO')).toBe('Ese correo no está registrado.');
    });

    it('un volcado técnico no pasa ni siquiera en es-DO', () => {
        const err = { message: 'Error: undefined en {stack} de la sesión' };
        const msg = humanizeAuthError(err, tFake, 'es-DO');
        expect(msg.startsWith('[fr] '), 'un volcado técnico llegó a la pantalla').toBe(true);
    });
});

describe('[P1-I18N-AUTH-COPY] anti-user-enumeration, que el i18n no debe aflojar', () => {
    it('credenciales inválidas no revela si la cuenta existe', () => {
        // El primer intento de este test prohibía la palabra «correo» y fallaba contra
        // el mensaje CORRECTO: «Correo o contraseña incorrectos.» nombra los dos campos
        // justamente para no decir cuál de los dos falló. La propiedad que hay que
        // medir no es qué palabras aparecen, es si se filtra la EXISTENCIA de la cuenta.
        const msg = humanizeAuthError({ message: 'Invalid login credentials' }, tFake, 'fr-FR');
        expect(msg).not.toMatch(/no est[áa] registrad|no existe|cuenta no encontrada|not registered|no account/i);
        // Y sigue nombrando los dos campos, que es lo que lo hace ambiguo a propósito.
        expect(msg).toMatch(/contraseña|password/i);
    });
});
